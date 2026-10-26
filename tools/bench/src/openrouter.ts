import { OpenRouter } from "@openrouter/sdk";
import { HTTPClient } from "@openrouter/sdk/lib/http.js";
import type { DecisionsRequest, DecisionsResponse } from "@openrouter/sdk/models";
import { isUnknown } from "@openrouter/sdk/types/discriminatedUnion.js";
import { isSplitChoice } from "bench-summary/schema";
import type { ChoiceVia } from "bench-summary/schema";
import {
  Array as Arr,
  Clock,
  Config,
  Number as Num,
  Effect,
  Option,
  pipe,
  Record as Rec,
  Redacted,
  Result,
  Schema,
  Order,
} from "effect";

import { DecisionSchema, NOUL_CRITERIA, OutcomeSchema } from "./item.ts";
import type { ChoiceItem, Decision, Item, Outcome } from "./item.ts";
import { toRequest } from "./label.ts";
import { makeCache, modelSlug } from "./store.ts";

interface DecisionAdapter {
  readonly model: string;
  readonly decide: (item: Readonly<Item>) => Effect.Effect<Outcome>;
}

const QUESTION_ID = "q";
const NO_COST = 0;
const MIN_TOTAL = Number.EPSILON;
const READOUT = "probabilities";

const REPO = "masseater/mst-ja-decision-bench";
const APP = `https://github.com/${REPO}/bench`;

const isSet = (name: string): Effect.Effect<boolean> =>
  Config.option(Config.NonEmptyString(name)).pipe(
    Effect.map(Option.isSome),
    Effect.orElseSucceed(() => false),
  );

const contextOf = Effect.gen(function* contextOf() {
  if (yield* isSet("GITHUB_ACTIONS")) {
    return "github-actions";
  }
  if (yield* isSet("CLAUDE_CODE_REMOTE")) {
    return "claude-code-cloud";
  }
  if (yield* isSet("CLAUDECODE")) {
    return "claude-code";
  }
  return "local";
});

const hiddenApp = (): HTTPClient =>
  new HTTPClient().addHook("beforeRequest", (request) => {
    request.headers.set("X-OpenRouter-App-Visibility", "hidden");
  });

const attribution = contextOf.pipe(
  Effect.map((context) => ({
    httpReferer: `${APP}/${context}`,
    appTitle: `${REPO} ${context} bench`,
    httpClient: hiddenApp(),
  })),
);

type Answers = Readonly<DecisionsResponse["answers"]>;
type Answer = Answers[string];

const decodeKnown = (answer: Answer): Option.Option<Decision> => {
  if (isUnknown<"type">(answer)) {
    return Option.none();
  }
  return Schema.decodeOption(DecisionSchema)(answer);
};

const decodeAnswer = (answer: Answer | undefined): Option.Option<Decision> =>
  Option.flatMap(Option.fromNullishOr(answer), decodeKnown);

const noulOf = (answer: Answer): Option.Option<number> =>
  Option.flatMap(decodeAnswer(answer), (decision) => {
    if (decision.type !== "noul") {
      return Option.none();
    }
    return Option.some(decision.noul);
  });

const isAnswered = (outcome: Outcome): boolean => outcome.status === "answered";

const failed = (reason: string, latencyMs: number): Outcome => ({
  status: "failed",
  reason,
  latencyMs,
});

const toQuestions = (item: Readonly<Item>): DecisionsRequest["questions"] => {
  const instructions = item.criteria;
  if (item.type === "choice") {
    return { [QUESTION_ID]: { type: item.type, instructions, criteria: item.options } };
  }
  if (item.type === "noul") {
    return { [QUESTION_ID]: { type: item.type, instructions, criteria: item.options } };
  }
  return { [QUESTION_ID]: { type: item.type, instructions, criteria: [...item.options] } };
};

const toSplitQuestions = (item: Readonly<ChoiceItem>): DecisionsRequest["questions"] =>
  Rec.fromEntries(
    pipe(
      Rec.toEntries(item.options),
      Arr.map(([key, option]) => [
        key,
        {
          type: "noul" as const,
          instructions: `${item.criteria}\n次の答えは正しいですか: ${option}`,
          criteria: NOUL_CRITERIA,
        },
      ]),
    ),
  );

const byNoulDescending = Order.mapInput(
  Order.flip(Num.Order),
  ({ noul }: Readonly<{ noul: number }>) => noul,
);

const decodeSplit = (item: Readonly<ChoiceItem>, answers: Answers): Option.Option<Decision> =>
  Option.gen(function* split() {
    const record = yield* Option.all(pipe(answers, Rec.map(noulOf)));
    const scored = yield* Option.all(
      pipe(
        Rec.keys(item.options),
        Arr.map((key) => Option.map(Option.fromNullishOr(record[key]), (noul) => ({ key, noul }))),
      ),
    );
    const best = yield* pipe(scored, Arr.sortBy(byNoulDescending), Arr.head);
    const nouls = pipe(
      scored,
      Arr.map(({ noul }) => noul),
    );
    const total = Math.max(MIN_TOTAL, Num.sumAll(nouls));
    const probabilities = Rec.fromEntries(
      pipe(
        scored,
        Arr.map(({ key, noul }) => [key, noul / total]),
      ),
    );
    return { type: "choice" as const, choice: best.key, probabilities };
  });

const decodeDecision = (
  item: Readonly<Item>,
  via: ChoiceVia,
  answers: Answers,
): Option.Option<Decision> => {
  if (item.type === "choice" && isSplitChoice({ format: item.type, choiceVia: via })) {
    return decodeSplit(item, answers);
  }
  return Option.filter(
    decodeAnswer(answers[QUESTION_ID]),
    (decision) => decision.type === item.type,
  );
};

interface Reply {
  readonly answers: Answers;
  readonly costUsd: number;
  readonly latencyMs: number;
}

const toOutcome = (
  item: Readonly<Item>,
  via: ChoiceVia,
  { answers, costUsd, latencyMs }: Reply,
): Outcome =>
  Option.match(decodeDecision(item, via, answers), {
    onNone: () => failed("answer type mismatch", latencyMs),
    onSome: (decision) => ({ status: "answered", decision, latencyMs, costUsd }),
  });

const callSystemOne = Effect.fn("callSystemOne")(function* callSystemOne(
  create: (item: Readonly<Item>) => Promise<DecisionsResponse>,
  item: Readonly<Item>,
  via: ChoiceVia,
) {
  const started = yield* Clock.currentTimeMillis;
  const response = yield* Effect.tryPromise(() => create(item)).pipe(Effect.result);
  const latencyMs = (yield* Clock.currentTimeMillis) - started;
  if (Result.isFailure(response)) {
    return failed(String(response.failure.cause), latencyMs);
  }
  const { answers, usage } = response.success;
  return toOutcome(item, via, {
    answers,
    costUsd: usage.cost ?? NO_COST,
    latencyMs,
  });
});

const questionsOf = (item: Readonly<Item>, via: ChoiceVia): DecisionsRequest["questions"] => {
  if (item.type === "choice" && isSplitChoice({ format: item.type, choiceVia: via })) {
    return toSplitQuestions(item);
  }
  return toQuestions(item);
};

const cacheKey = (model: string, item: Readonly<Item>, via: ChoiceVia): unknown => {
  if (item.type === "choice" && isSplitChoice({ format: item.type, choiceVia: via })) {
    return { model, request: toRequest(item), via, readout: READOUT };
  }
  if (item.type === "choice") {
    return { model, request: toRequest(item), readout: READOUT };
  }
  return { model, request: toRequest(item) };
};

const makeOpenRouterAdapter = Effect.fn("makeOpenRouterAdapter")(function* makeOpenRouterAdapter(
  model: string,
  via: ChoiceVia,
) {
  const client = new OpenRouter({
    apiKey: Redacted.value(yield* Config.Redacted("OPENROUTER_API_KEY")),
    ...(yield* attribution),
  });
  const create = (item: Readonly<Item>): Promise<DecisionsResponse> =>
    client.systemOne.create({
      decisionsRequest: { model, state: item.text, questions: questionsOf(item, via) },
    });
  const cached = yield* makeCache(`openrouter-${modelSlug(model)}`, OutcomeSchema, isAnswered);
  const adapter: DecisionAdapter = {
    model,
    decide: (item) => cached(cacheKey(model, item, via), callSystemOne(create, item, via)),
  };
  return adapter;
});

export { makeOpenRouterAdapter };
