import type { TaskResult } from "bench-summary/schema";
import { Array as Arr, Number as Num, Option, pipe, Record as Rec, String as Str } from "effect";
import seedrandom from "seedrandom";
import { quantile, sampleWithReplacement } from "simple-statistics";

import { calibrationOf } from "./calibration.ts";
import { FULL, NONE, balancedAccuracy, macroF1, macroF1Chance, mean } from "./classification.ts";
import { NOUL_THRESHOLD } from "./item.ts";
import type { ChoiceItem, Decision, Item, NoulItem, Outcome, Scored, ScoreItem } from "./item.ts";

const NOUL_OPTIONS = 2;
const P50 = 0.5;
const P95 = 0.95;
const LAST_OFFSET = 1;

const choiceCredit = (item: ChoiceItem, decision: Decision): number =>
  Number(decision.type === "choice" && decision.choice === item.gold);

const noulCredit = (item: NoulItem, decision: Decision): number =>
  Number(decision.type === "noul" && decision.noul >= NOUL_THRESHOLD === item.gold);

const scoreCredit = (item: ScoreItem, decision: Decision): number => {
  if (decision.type !== "score") {
    return NONE;
  }
  return FULL - Math.abs(decision.score - item.gold) / (item.options.length - LAST_OFFSET);
};

const decisionCredit = (item: Readonly<Item>, decision: Decision): number => {
  if (item.type === "choice") {
    return choiceCredit(item, decision);
  }
  if (item.type === "noul") {
    return noulCredit(item, decision);
  }
  return scoreCredit(item, decision);
};

const credit = ({ item, outcome }: Readonly<Scored>): number => {
  if (outcome.status === "failed") {
    return NONE;
  }
  return decisionCredit(item, outcome.decision);
};

const chanceOf = (item: Readonly<Item>): number => {
  if (item.type === "noul") {
    return FULL / NOUL_OPTIONS;
  }
  if (item.type === "choice") {
    return FULL / Rec.keys(item.options).length;
  }
  const last = item.options.length - LAST_OFFSET;
  return mean(
    Arr.makeBy(item.options.length, (guess) => FULL - Math.abs(guess - item.gold) / last),
  );
};

const rawScore = (rows: readonly Scored[]): Readonly<{ raw: number; chance: number }> => {
  if (
    pipe(
      rows,
      Arr.some(({ item }) => item.type === "noul"),
    )
  ) {
    return { raw: balancedAccuracy(rows), chance: FULL / NOUL_OPTIONS };
  }
  if (
    pipe(
      rows,
      Arr.some(({ item }) => item.type === "choice"),
    )
  ) {
    return { raw: macroF1(rows), chance: macroF1Chance(rows) };
  }
  return {
    raw: mean(
      pipe(
        rows,
        Arr.map((row) => credit(row)),
      ),
    ),
    chance: mean(
      pipe(
        rows,
        Arr.map(({ item }) => chanceOf(item)),
      ),
    ),
  };
};

const skillOf = (raw: number, chance: number): number => {
  if (chance >= FULL) {
    return NONE;
  }
  return Num.clamp((raw - chance) / (FULL - chance), { minimum: NONE, maximum: FULL });
};

const PAIR_MEMBER = /-\d+[ab]$/u;
const PAIR_SIZE = 2;
const SIDE_LENGTH = 1;

const pairOf = ({ item }: Readonly<Scored>): string => pipe(item.id, Str.slice(NONE, -SIDE_LENGTH));

const RESAMPLES = 1000;
const SEED = "ja-decision-bench";
const LOWER = 0.025;
const UPPER = 0.975;

type Cluster = readonly Scored[];
type Interval = Readonly<{ lower: number; upper: number }>;

const clusterKey = (row: Readonly<Scored>): string => {
  if (PAIR_MEMBER.test(row.item.id)) {
    return pairOf(row);
  }
  return row.item.id;
};

const intervalOf = (values: readonly number[]): Interval => {
  if (values.length === NONE) {
    return { lower: NONE, upper: NONE };
  }
  return { lower: quantile([...values], LOWER), upper: quantile([...values], UPPER) };
};

const isSolvedPair = (cluster: Cluster): boolean =>
  cluster.length === PAIR_SIZE &&
  pipe(
    cluster,
    Arr.every((row) => credit(row) === FULL),
  );

const pairRate = (clusters: readonly Cluster[]): number => {
  const pairs = pipe(
    clusters,
    Arr.filter((cluster) => cluster.length === PAIR_SIZE),
  );
  return (
    pipe(
      pairs,
      Arr.filter((pair) => isSolvedPair(pair)),
    ).length / Math.max(FULL, pairs.length)
  );
};

const skillOfRows = (rows: readonly Scored[]): number => {
  const { raw, chance } = rawScore(rows);
  return skillOf(raw, chance);
};

const resample = (clusters: readonly Cluster[]): readonly (readonly Cluster[])[] => {
  const random = seedrandom(SEED);
  return Arr.makeBy(RESAMPLES, () =>
    sampleWithReplacement([...clusters], clusters.length, () => random()),
  );
};

const pairAccuracyOf = (
  clusters: readonly Cluster[],
  samples: readonly (readonly Cluster[])[],
): TaskResult["test"]["pairs"] => {
  const count = pipe(
    clusters,
    Arr.filter((cluster) => cluster.length === PAIR_SIZE),
  ).length;
  if (count === NONE) {
    return { status: "unavailable" };
  }
  return {
    status: "measured",
    accuracy: pairRate(clusters),
    count,
    interval: intervalOf(
      pipe(
        samples,
        Arr.map((sample) => pairRate(sample)),
      ),
    ),
  };
};

const metric = (rows: readonly Scored[]): TaskResult["test"] => {
  const { raw, chance } = rawScore(rows);
  const clusters = Rec.values(Arr.groupBy(rows, clusterKey));
  const samples = resample(clusters);
  const failed = pipe(
    rows,
    Arr.filter(({ outcome }) => outcome.status === "failed"),
  ).length;
  return {
    total: rows.length,
    failed,
    coverage: (rows.length - failed) / Math.max(FULL, rows.length),
    raw,
    accuracy: mean(
      pipe(
        rows,
        Arr.map((row) => credit(row)),
      ),
    ),
    chance,
    skill: skillOf(raw, chance),
    skillInterval: intervalOf(
      pipe(
        samples,
        Arr.map((sample) => skillOfRows(sample.flat())),
      ),
    ),
    calibration: calibrationOf(rows),
    pairs: pairAccuracyOf(clusters, samples),
  };
};

const costOf = (outcome: Readonly<Outcome>): number => {
  if (outcome.status === "answered") {
    return outcome.costUsd;
  }
  return NONE;
};

const percentile = (values: readonly number[], rank: number): number => {
  const position = Math.max(NONE, Math.ceil(rank * values.length) - LAST_OFFSET);
  return pipe(
    values,
    Arr.sortBy(Num.Order),
    Arr.get(position),
    Option.getOrElse(() => NONE),
  );
};

const usage = (rows: readonly Scored[]): Pick<TaskResult, "p50Ms" | "p95Ms" | "costUsd"> => {
  const latencies = pipe(
    rows,
    Arr.map(({ outcome }) => outcome.latencyMs),
  );
  const costUsd = Num.sumAll(
    pipe(
      rows,
      Arr.map(({ outcome }) => costOf(outcome)),
    ),
  );
  return {
    p50Ms: percentile(latencies, P50),
    p95Ms: percentile(latencies, P95),
    costUsd,
  };
};

export { metric, usage };
