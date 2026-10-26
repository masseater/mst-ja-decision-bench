import { Effect, Number as Num, Schema, Array as Arr, pipe } from "effect";

import { NOUL_CRITERIA } from "./item.ts";
import type { Item, NoulItem } from "./item.ts";
import { askThrice, splitOf as splitByVotes, tally, writeLabeled } from "./label.ts";
import { Opus, runBench } from "./runtime.ts";

const TASK = "rules";
const PAIRS_PER_ROUND = 5;
const CONCURRENCY = 12;
const MIN_ARTICLES = 8;
const MAX_ARTICLES = 12;
const MAX_REGULATION_CHARS = 1500;
const FIRST_ARTICLE = 1;
const NO_EARLIER = 0;
const FIRST_ROUND = 0;
const SECOND_ROUND = 1;
const SOURCE = "Claude Opus 5.5 で生成した架空の社内規程と事例";
const LICENSE = "CC BY-SA 4.0";

const THEMES = [
  "経費精算",
  "出張旅費",
  "休暇取得",
  "勤怠と残業申請",
  "在宅勤務",
  "情報セキュリティ",
  "個人情報の取り扱い",
  "購買と発注承認",
  "接待と贈答",
  "契約書の締結権限",
  "社外への情報発信",
  "副業の届出",
  "備品の貸与と返却",
  "ハラスメント相談",
  "採用面接の運用",
  "顧客からの返品対応",
  "請求書の発行と支払期日",
  "社用車の利用",
  "ソフトウェアの導入申請",
  "安全衛生と事故報告",
  "研修の受講と費用負担",
  "社内システムのアカウント管理",
  "取引先の与信審査",
  "文書の保管と廃棄",
  "災害時の出社判断",
] as const;

const GENERATOR_SYSTEM =
  "あなたは日本企業の社内規程と、その運用で起きる判断事例を作る作成者です。指定の形式で返してください。";

const RegulationSchema = Schema.Struct({
  articles: Schema.Array(Schema.Struct({ title: Schema.String, body: Schema.String })),
});

const CasesSchema = Schema.Struct({
  pairs: Schema.Array(
    Schema.Struct({
      criterion: Schema.String,
      compliant: Schema.String,
      violating: Schema.String,
    }),
  ),
});

const regulationSchema = {
  type: "object",
  properties: {
    articles: {
      type: "array",
      minItems: MIN_ARTICLES,
      maxItems: MAX_ARTICLES,
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "条の見出し（例: 適用範囲）" },
          body: { type: "string", description: "条文（1〜4文）" },
        },
        required: ["title", "body"],
        additionalProperties: false,
      },
    },
  },
  required: ["articles"],
  additionalProperties: false,
};

const situationSchema = (answer: string): object => ({
  type: "string",
  description: `問いの答えが「${answer}」になる、社員や部署が実際に取った行動の事例（2〜5文）`,
});

const casesSchema = {
  type: "object",
  properties: {
    pairs: {
      type: "array",
      minItems: PAIRS_PER_ROUND,
      maxItems: PAIRS_PER_ROUND,
      items: {
        type: "object",
        properties: {
          criterion: {
            type: "string",
            description: "事例が規程に適合するかを問う、はい・いいえで答える問い",
          },
          compliant: situationSchema("はい"),
          violating: situationSchema("いいえ"),
        },
        required: ["criterion", "compliant", "violating"],
        additionalProperties: false,
      },
    },
  },
  required: ["pairs"],
  additionalProperties: false,
};

const regulationPrompt = (theme: string): string =>
  pipe(
    [
      `テーマ「${theme}」について、架空の会社の社内規程を${MIN_ARTICLES}〜${MAX_ARTICLES}条で作ってください。`,
      "第1条は目的、第2条は用語の定義にしてください。",
      "金額や日数の基準、例外、承認者、手続きの順序を含め、ある条が別の条を参照したり、別の条の例外を定めたりする箇所を複数入れてください。",
      `全体で${MAX_REGULATION_CHARS}字以内にしてください。`,
      "実在の企業名や個人名は使わないでください。",
    ],
    Arr.join("\n"),
  );

const avoidLines = (earlier: readonly string[]): readonly string[] => {
  if (earlier.length === NO_EARLIER) {
    return [];
  }
  return [
    "次の問いとは別の事例にし、同じ論点を繰り返さないでください。",
    ...pipe(
      earlier,
      Arr.map((criterion) => `- ${criterion}`),
    ),
  ];
};

const casesPrompt = (regulation: string, earlier: readonly string[]): string =>
  pipe(
    [
      "次の社内規程について、規程全体を読まないと判断できない事例の対と問いを作ってください。",
      "",
      regulation,
      "",
      `対を${PAIRS_PER_ROUND}組作ってください。各組は、事例が規程に適合するかを問う1つの問いと、答えが「はい」になる事例と「いいえ」になる事例の2つからなります。`,
      "対の2つの事例はほぼ同じ文にし、金額、日付、役職、手続きの順序、例外の条件のどれか1か所だけを変えて答えが逆になるようにしてください。",
      "どの事例も、判断に2つ以上の条を組み合わせる必要があるようにしてください。定義、例外、参照先の条を読み落とすと間違える対を半分以上含めてください。",
      "問いは「適合しているか」のように肯定の形で書き、条番号は書かず、どの条が関係するかは読み手が規程から探すようにしてください。",
      "実在の企業名や個人名は使わないでください。",
      ...avoidLines(earlier),
    ],
    Arr.join("\n"),
  );

const renderRegulation = (regulation: typeof RegulationSchema.Type): string =>
  pipe(
    regulation.articles,
    Arr.map(({ title, body }, index) => `第${index + FIRST_ARTICLE}条（${title}）${body}`),
    Arr.join("\n"),
  );

const generateRegulation = Effect.fn("generateRegulation")(function* generateRegulation(
  theme: string,
) {
  const opus = yield* Opus;
  const { output, costUsd } = yield* opus.ask({
    system: GENERATOR_SYSTEM,
    prompt: regulationPrompt(theme),
    schema: RegulationSchema,
    jsonSchema: regulationSchema,
    sample: FIRST_ROUND,
  });
  return { regulation: renderRegulation(output), costUsd };
});

const generateCases = Effect.fn("generateCases")(function* generateCases(
  regulation: string,
  earlier: readonly string[],
  round: number,
) {
  const opus = yield* Opus;
  return yield* opus.ask({
    system: GENERATOR_SYSTEM,
    prompt: casesPrompt(regulation, earlier),
    schema: CasesSchema,
    jsonSchema: casesSchema,
    sample: round,
  });
});

const splitOf = (agreement: number, asIntended: boolean): Item["split"] => {
  if (asIntended) {
    return splitByVotes(agreement);
  }
  return "hard";
};

const toDrafts = (
  pair: (typeof CasesSchema.Type)["pairs"][number],
  index: number,
): readonly Readonly<{
  key: string;
  situation: string;
  criterion: string;
  intended: boolean;
}>[] => [
  { key: `${index}a`, situation: pair.compliant, criterion: pair.criterion, intended: true },
  { key: `${index}b`, situation: pair.violating, criterion: pair.criterion, intended: false },
];

const generateTheme = Effect.fn("generateTheme")(function* generateTheme(
  theme: string,
  themeIndex: number,
) {
  const { regulation, costUsd } = yield* generateRegulation(theme);
  const first = yield* generateCases(regulation, [], FIRST_ROUND);
  const second = yield* generateCases(
    regulation,
    pipe(
      first.output.pairs,
      Arr.map(({ criterion }) => criterion),
    ),
    SECOND_ROUND,
  );
  return {
    theme,
    themeIndex,
    regulation,
    drafts: pipe(
      [...first.output.pairs, ...second.output.pairs],
      Arr.flatMap((pair, index) => toDrafts(pair, index)),
    ),
    costUsd: costUsd + first.costUsd + second.costUsd,
  };
});

const labelDraft = Effect.fn("labelDraft")(function* labelDraft(
  draft: Readonly<{
    theme: string;
    themeIndex: number;
    key: string;
    regulation: string;
    situation: string;
    criterion: string;
    intended: boolean;
  }>,
) {
  const question = {
    type: "noul" as const,
    text: `規程:\n${draft.regulation}\n\n事例:\n${draft.situation}`,
    criteria: draft.criterion,
    options: NOUL_CRITERIA,
  };
  const { answers, costUsd } = yield* askThrice(question);
  const { mode, agreement } = tally(answers);
  const item: NoulItem = {
    id: `${TASK}-${draft.themeIndex}-${draft.key}`,
    ...question,
    gold: mode === "true",
    gold_source: "llm",
    agreement,
    source: `${SOURCE}（テーマ: ${draft.theme}）`,
    license: LICENSE,
    split: splitOf(agreement, mode === String(draft.intended)),
  };
  return { item, costUsd };
});

runBench(
  Effect.gen(function* buildRules() {
    const generated = yield* Effect.forEach(THEMES, generateTheme, {
      concurrency: CONCURRENCY,
    });
    const drafts = pipe(
      generated,
      Arr.flatMap(({ theme, themeIndex, regulation, drafts: themeDrafts }) =>
        pipe(
          themeDrafts,
          Arr.map((draft) => ({ theme, themeIndex, regulation, ...draft })),
        ),
      ),
    );
    const labeled = yield* Effect.forEach(drafts, labelDraft, { concurrency: CONCURRENCY });
    const items = pipe(
      labeled,
      Arr.map(({ item }) => item),
    );
    const costs = pipe(
      [...generated, ...labeled],
      Arr.map(({ costUsd }) => costUsd),
    );
    yield* writeLabeled(TASK, items, { opusCostUsd: Num.sumAll(costs) });
  }),
);
