import { percent as pct, percentRange, usdAmount } from "bench-summary/format";
import { LabelStatsSchema, SummarySchema } from "bench-summary/schema";
import type { Summary, Support, TaskResult } from "bench-summary/schema";
import {
  DateTime,
  Effect,
  Number as Num,
  Option,
  Schema,
  String as Str,
  pipe,
  Array as Arr,
} from "effect";

import { ItemSchema, OutcomeSchema } from "./item.ts";
import type { Item, Scored } from "./item.ts";
import { makeOpenRouterAdapter } from "./openrouter.ts";
import { runBench } from "./runtime.ts";
import { metric, usage } from "./score.ts";
import {
  benchPath,
  dataPath,
  modelSlug,
  readJsonl,
  readText,
  writeJson,
  writeText,
} from "./store.ts";

const CONCURRENCY = 4;
const LABEL_COST_DIGITS = 2;
const START = "<!-- results:start -->";
const END = "<!-- results:end -->";

const TASKS = [
  { id: "jnli", label: "JNLI 含意関係", format: "choice", metric: "macro-f1" },
  { id: "rules", label: "業務ルール判定", format: "noul", metric: "balanced-accuracy" },
] as const;

const MODELS = [
  { provider: "openrouter", id: "typesafe/jev-1.13", label: "Jev 1.13", choiceVia: "choice" },
  { provider: "openrouter", id: "respan/span-01-lite", label: "span-01 lite", choiceVia: "noul" },
  { provider: "openrouter", id: "respan/span-01", label: "span-01", choiceVia: "noul" },
  { provider: "openrouter", id: "liquid/d1", label: "Liquid d1", choiceVia: "choice" },
  {
    provider: "openrouter",
    id: "microsoft/microsoft-decision-1",
    label: "Microsoft-Decision-1",
    choiceVia: "choice",
  },
  { provider: "openrouter", id: "nace-ai/drex-v1.5", label: "Drex v1.5", choiceVia: "choice" },
  { provider: "openrouter", id: "cloudflare/clef", label: "Clef", choiceVia: "choice" },
  { provider: "openrouter", id: "cloudflare/clef-omni", label: "Clef Omni", choiceVia: "choice" },
  { provider: "openrouter", id: "cloudflare/clef-flash", label: "Clef Flash", choiceVia: "choice" },
  {
    provider: "openrouter",
    id: "upstage/solar-decide",
    label: "Solar Decide",
    choiceVia: "choice",
  },
  {
    provider: "openrouter",
    id: "upstage/solar-decide-flash",
    label: "Solar Decide Flash",
    choiceVia: "choice",
  },
  {
    provider: "openrouter",
    id: "perplexity/pplx-decider-v1.1-27b",
    label: "Decider V1.1 27B",
    choiceVia: "choice",
  },
  {
    provider: "openrouter",
    id: "openai/gpt-6-luna-decisions",
    label: "GPT-6 Luna Decisions",
    choiceVia: "choice",
  },
  {
    provider: "openrouter",
    id: "togethercomputer/tev1-4b-experimental",
    label: "Tev1 4B Experimental",
    choiceVia: "choice",
  },
  {
    provider: "openrouter",
    id: "inception/mercury-decide",
    label: "Mercury Decide",
    choiceVia: "choice",
  },
  { provider: "openrouter", id: "jaredpalmer/kev-4b", label: "Kev 4B", choiceVia: "choice" },
] as const;

type Task = (typeof TASKS)[number] & Readonly<{ items: readonly Item[] }>;

const DetailSchema = Schema.Struct({
  model: Schema.String,
  outcomes: Schema.Array(Schema.Struct({ id: Schema.String, outcome: OutcomeSchema })),
});

const humanMatch = (value: Option.Option<number>): string =>
  Option.match(value, { onNone: () => "-", onSome: (rate) => `${pct(rate)}%` });

const pairCell = (pairs: TaskResult["test"]["pairs"]): string => {
  if (pairs.status === "unavailable") {
    return "-";
  }
  return `${pct(pairs.accuracy)}（${percentRange(pairs.interval)}）`;
};

const indexTable = (summary: Summary): readonly string[] => [
  "| モデル | 指数（参考） | 全タスクの費用 (USD) |",
  "| --- | ---: | ---: |",
  ...pipe(
    summary.models,
    Arr.map((model) => `| ${model.label} | ${pct(model.index)} | ${usdAmount(model.costUsd)} |`),
  ),
];

const labelLine = (stats: Summary["labeling"][number]): string =>
  `正解ラベル: ${stats.items} 件（hard ${stats.hard} 件）、Opus 5.5 のラベル費用（API 換算） ${stats.opusCostUsd.toFixed(LABEL_COST_DIGITS)} USD、Opus 5.5 と人の正解の一致率 ${humanMatch(Option.fromNullishOr(stats.opusMatchesHuman))}。`;

const taskTable = (summary: Summary, task: (typeof TASKS)[number]): readonly string[] => [
  `### ${task.label}（${task.format}、raw は ${task.metric}）`,
  "",
  ...pipe(
    summary.labeling,
    Arr.filter((stats) => stats.task === task.id),
    Arr.map((stats) => labelLine(stats)),
  ),
  "",
  "| モデル | skill（95% 区間） | raw | 正解率 | 対の正解率（95% 区間） | coverage | p50 / p95 (ms) | タスク全体の費用 (USD) |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...pipe(
    summary.models,
    Arr.flatMap((model) =>
      pipe(
        model.tasks,
        Arr.filter((result) => result.task === task.id),
        Arr.map((result) =>
          Str.trim(
            pipe(
              [
                "",
                model.label,
                `${pct(result.test.skill)}（${percentRange(result.test.skillInterval)}）`,
                pct(result.test.raw),
                pct(result.test.accuracy),
                pairCell(result.test.pairs),
                pct(result.test.coverage),
                `${result.p50Ms} / ${result.p95Ms}`,
                usdAmount(result.costUsd),
                "",
              ],
              Arr.join(" | "),
            ),
          ),
        ),
      ),
    ),
  ),
];

const table = (summary: Summary): string =>
  pipe(
    [
      ...indexTable(summary),
      ...pipe(
        TASKS,
        Arr.flatMap((task) => ["", ...taskTable(summary, task)]),
      ),
    ],
    Arr.join("\n"),
  );

const supportOf = (test: Readonly<{ failed: number; total: number }>): Support => {
  if (test.failed === test.total) {
    return "unsupported";
  }
  return "supported";
};

const runTask = Effect.fn("runTask")(function* runTask(
  adapter: Effect.Success<ReturnType<typeof makeOpenRouterAdapter>>,
  task: Task,
) {
  const rows = yield* Effect.forEach(
    task.items,
    (item) => adapter.decide(item).pipe(Effect.map((outcome): Scored => ({ item, outcome }))),
    { concurrency: CONCURRENCY },
  );
  const test = metric(
    pipe(
      rows,
      Arr.filter(({ item }) => item.split === "test"),
    ),
  );
  const result = {
    task: task.id,
    label: task.label,
    format: task.format,
    metric: task.metric,
    support: supportOf(test),
    test,
    hard: metric(
      pipe(
        rows,
        Arr.filter(({ item }) => item.split === "hard"),
      ),
    ),
    ...usage(rows),
  };
  return { rows, result };
});

const runModel = Effect.fn("runModel")(function* runModel(
  model: (typeof MODELS)[number],
  tasks: readonly Task[],
) {
  const adapter = yield* makeOpenRouterAdapter(model.id, model.choiceVia);
  const ran = yield* Effect.forEach(tasks, (task) => runTask(adapter, task), { discard: false });
  const results = pipe(
    ran,
    Arr.map(({ result }) => result),
  );
  yield* writeJson(DetailSchema, yield* benchPath("results", `${modelSlug(model.id)}.json`), {
    model: model.id,
    outcomes: pipe(
      ran,
      Arr.flatMap(({ rows }) =>
        pipe(
          rows,
          Arr.map(({ item, outcome }) => ({ id: item.id, outcome })),
        ),
      ),
    ),
  });
  return {
    provider: model.provider,
    model: model.id,
    label: model.label,
    choiceVia: model.choiceVia,
    index:
      Num.sumAll(
        pipe(
          results,
          Arr.map(({ test }) => test.skill),
        ),
      ) / results.length,
    costUsd: Num.sumAll(
      pipe(
        results,
        Arr.map(({ costUsd }) => costUsd),
      ),
    ),
    tasks: results,
  };
});

const loadTask = Effect.fn("loadTask")(function* loadTask(task: (typeof TASKS)[number]) {
  const items = yield* readJsonl(
    ItemSchema,
    yield* dataPath({ task: task.id, extension: "jsonl" }),
  );
  return { ...task, items };
});

const loadStats = Effect.fn("loadStats")(function* loadStats(task: (typeof TASKS)[number]) {
  const text = yield* readText(yield* dataPath({ task: task.id, extension: "stats.json" }));
  return yield* Schema.decodeEffect(Schema.fromJsonString(LabelStatsSchema))(text);
});

const updateReadme = Effect.fn("updateReadme")(function* updateReadme(summary: Summary) {
  const readme = yield* benchPath("..", "..", "README.md");
  const [head, rest = ""] = pipe(yield* readText(readme), Str.split(START));
  const [, tail = ""] = pipe(rest, Str.split(END));
  yield* writeText(readme, `${head}${START}\n\n${table(summary)}\n\n${END}${tail}`);
});

runBench(
  Effect.gen(function* runAll() {
    const tasks = yield* Effect.forEach(TASKS, (task) => loadTask(task), { discard: false });
    const summary: Summary = {
      generatedAt: DateTime.formatIso(yield* DateTime.now),
      models: yield* Effect.forEach(MODELS, (model) => runModel(model, tasks), {
        concurrency: "unbounded",
      }),
      labeling: yield* Effect.forEach(TASKS, (task) => loadStats(task), { discard: false }),
    };
    yield* writeJson(
      SummarySchema,
      yield* benchPath("..", "..", "libs", "bench-summary", "summary.json"),
      summary,
    );
    yield* updateReadme(summary);
  }),
);
