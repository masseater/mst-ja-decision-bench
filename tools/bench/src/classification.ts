import { Array as Arr, Number as Num, Record as Rec, pipe } from "effect";
import { ConfusionMatrix } from "ml-confusion-matrix";

import { NOUL_THRESHOLD } from "./item.ts";
import type { Item, Scored } from "./item.ts";

const NONE = 0;
const FULL = 1;
const TWO = 2;

const mean = (values: readonly number[]): number => {
  if (values.length === NONE) {
    return NONE;
  }
  return Num.sumAll(values) / values.length;
};

const UNANSWERED = "unanswered";

const predictedChoice = ({ outcome }: Readonly<Scored>): string => {
  if (outcome.status === "answered" && outcome.decision.type === "choice") {
    return outcome.decision.choice;
  }
  return UNANSWERED;
};

const predictedNoul = ({ outcome }: Readonly<Scored>): string => {
  if (outcome.status === "answered" && outcome.decision.type === "noul") {
    return String(outcome.decision.noul >= NOUL_THRESHOLD);
  }
  return UNANSWERED;
};

const goldOf = ({ item }: Readonly<Scored>): string => String(item.gold);

const optionKeys = (item: Readonly<Item>): readonly string[] => {
  if (item.type === "choice") {
    return Rec.keys(item.options);
  }
  return [];
};

const choiceClasses = (rows: readonly Scored[]): readonly string[] => [
  ...new Set(
    pipe(
      rows,
      Arr.flatMap(({ item }) => optionKeys(item)),
    ),
  ),
];

const confusionOf = (
  rows: readonly Scored[],
  classes: readonly string[],
  predicted: (row: Readonly<Scored>) => string,
): ConfusionMatrix<string> =>
  ConfusionMatrix.fromLabels(
    pipe(
      rows,
      Arr.map((row) => goldOf(row)),
    ),
    pipe(
      rows,
      Arr.map((row) => predicted(row)),
    ),
    { labels: [...classes, UNANSWERED] },
  );

const finiteOrZero = (value: number): number => {
  if (Number.isFinite(value)) {
    return value;
  }
  return NONE;
};

const balancedAccuracy = (rows: readonly Scored[]): number => {
  const classes = [String(true), String(false)];
  const confusion = confusionOf(rows, classes, predictedNoul);
  return mean(
    pipe(
      classes,
      Arr.filter((label) => confusion.getPositiveCount(label) > NONE),
      Arr.map((label) => confusion.getTruePositiveRate(label)),
    ),
  );
};

const macroF1 = (rows: readonly Scored[]): number => {
  const classes = choiceClasses(rows);
  const confusion = confusionOf(rows, classes, predictedChoice);
  return mean(
    pipe(
      classes,
      Arr.map((label) => finiteOrZero(confusion.getF1Score(label))),
    ),
  );
};

const macroF1Chance = (rows: readonly Scored[]): number => {
  const classes = choiceClasses(rows);
  const guess = FULL / Math.max(FULL, classes.length);
  return mean(
    pipe(
      classes,
      Arr.map((label) => {
        const prevalence =
          pipe(
            rows,
            Arr.filter((row) => goldOf(row) === label),
          ).length / Math.max(FULL, rows.length);
        return (TWO * prevalence * guess) / Math.max(Number.EPSILON, prevalence + guess);
      }),
    ),
  );
};

export { FULL, NONE, balancedAccuracy, macroF1, macroF1Chance, mean };
