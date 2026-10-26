import { LabelStatsSchema } from "bench-summary/schema";
import type { TaskId } from "bench-summary/schema";
import { Array as Arr, Effect, Number as Num, Option, Order, Record, Schema, pipe } from "effect";

import { ItemSchema } from "./item.ts";
import type { Item, Question } from "./item.ts";
import { Opus } from "./runtime.ts";
import { dataPath, toJson, writeJson, writeJsonl } from "./store.ts";

const SAMPLE_COUNT = 3;
const UNANIMOUS = 1;

const SYSTEM =
  "あなたは日本語の判定タスクに答える評価者です。state を読み、question に指定された形式で答えだけを返してください。";

const byGroupSize = Order.mapInput(Num.Order, (group: readonly string[]) => group.length);

const answerKeys = (question: Readonly<Question>): readonly string[] => {
  if (question.type === "choice") {
    return Record.keys(question.options);
  }
  if (question.type === "noul") {
    return ["true", "false"];
  }
  return pipe(
    question.options,
    Arr.map((_level, index) => String(index)),
  );
};

const toRequest = (
  question: Readonly<Question>,
): Readonly<{
  state: string;
  question: Readonly<{ type: Item["type"]; instructions: string; criteria: Question["options"] }>;
}> => ({
  state: question.text,
  question: { type: question.type, instructions: question.criteria, criteria: question.options },
});

const AnswerSchema = Schema.Struct({ answer: Schema.String });

const askThrice = Effect.fn("askThrice")(function* askThrice(question: Readonly<Question>) {
  const opus = yield* Opus;
  const prompt = yield* toJson(toRequest(question));
  const jsonSchema = {
    type: "object",
    properties: { answer: { type: "string", enum: answerKeys(question) } },
    required: ["answer"],
    additionalProperties: false,
  };
  const results = yield* Effect.forEach(
    Arr.makeBy(SAMPLE_COUNT, (sample) => sample),
    (sample) => opus.ask({ system: SYSTEM, prompt, schema: AnswerSchema, jsonSchema, sample }),
  );
  return {
    answers: pipe(
      results,
      Arr.map(({ output }) => output.answer),
    ),
    costUsd: Num.sumAll(
      pipe(
        results,
        Arr.map(({ costUsd }) => costUsd),
      ),
    ),
  };
});

const tally = (answers: readonly string[]): Readonly<{ mode: string; agreement: number }> => {
  const groups = Record.values(Arr.groupBy(answers, (answer) => answer));
  const largest = Arr.reduce(groups, Arr.empty<string>(), Order.max(byGroupSize));
  return {
    mode: pipe(
      Arr.head(largest),
      Option.getOrElse(() => ""),
    ),
    agreement: largest.length / answers.length,
  };
};

const splitOf = (agreement: number): Item["split"] => {
  if (agreement === UNANIMOUS) {
    return "test";
  }
  return "hard";
};

const writeLabeled = Effect.fn("writeLabeled")(function* writeLabeled(
  task: TaskId,
  items: readonly Item[],
  stats: Omit<typeof LabelStatsSchema.Type, "task" | "items" | "hard">,
) {
  yield* writeJsonl(ItemSchema, yield* dataPath({ task, extension: "jsonl" }), items);
  yield* writeJson(LabelStatsSchema, yield* dataPath({ task, extension: "stats.json" }), {
    task,
    items: items.length,
    hard: pipe(
      items,
      Arr.filter(({ split }) => split === "hard"),
    ).length,
    ...stats,
  });
});

export { askThrice, splitOf, tally, toRequest, writeLabeled };
