import type { TaskResult } from "bench-summary/schema";
import { Number as Num, Option, Array as Arr, pipe, Record as Rec } from "effect";
import { brierScore, calibrationCurve, expectedCalibrationError } from "forecast-calibration-kit";
import type { BinaryOutcome, Sample } from "forecast-calibration-kit";

import { NOUL_THRESHOLD } from "./item.ts";
import type { ChoiceItem, Decision, NoulItem, Scored } from "./item.ts";

const NONE = 0;
const FULL = 1;
const CALIBRATION_BINS = 10;

interface Forecast {
  readonly sample: Sample;
  readonly brier: number;
}

const PROBABILITY = "p";
const HIT: BinaryOutcome = 1;
const MISS: BinaryOutcome = 0;

const outcomeOf = (truth: boolean): BinaryOutcome => {
  if (truth) {
    return HIT;
  }
  return MISS;
};

const sampleOf = (probability: number, truth: boolean): Sample => ({
  [PROBABILITY]: probability,
  outcome: outcomeOf(truth),
});

const multiClassBrier = (classes: readonly Readonly<Sample>[]): number =>
  classes.length * brierScore(classes);

const choiceForecast = (item: ChoiceItem, decision: Decision): Option.Option<Forecast> => {
  if (decision.type !== "choice") {
    return Option.none();
  }
  return Option.map(Option.fromNullishOr(decision.probabilities), (probabilities) => {
    const labels = Rec.keys(item.options);
    const probabilityOf = (label: string): number => probabilities[label] ?? NONE;
    const confidence = Math.max(
      NONE,
      ...pipe(
        labels,
        Arr.map((label) => probabilityOf(label)),
      ),
    );
    return {
      sample: sampleOf(confidence, decision.choice === item.gold),
      brier: multiClassBrier(
        pipe(
          labels,
          Arr.map((label) => sampleOf(probabilityOf(label), label === item.gold)),
        ),
      ),
    };
  });
};

const noulForecast = (item: NoulItem, decision: Decision): Option.Option<Forecast> => {
  if (decision.type !== "noul") {
    return Option.none();
  }
  return Option.some({
    sample: sampleOf(
      Math.max(decision.noul, FULL - decision.noul),
      decision.noul >= NOUL_THRESHOLD === item.gold,
    ),
    brier: multiClassBrier([
      sampleOf(decision.noul, item.gold),
      sampleOf(FULL - decision.noul, !item.gold),
    ]),
  });
};

const forecastOf = ({ item, outcome }: Readonly<Scored>): Option.Option<Forecast> => {
  if (outcome.status === "failed") {
    return Option.none();
  }
  if (item.type === "choice") {
    return choiceForecast(item, outcome.decision);
  }
  if (item.type === "noul") {
    return noulForecast(item, outcome.decision);
  }
  return Option.none();
};

const calibrationOf = (rows: readonly Scored[]): TaskResult["test"]["calibration"] => {
  const forecasts = pipe(
    rows,
    Arr.flatMap((row) => Option.toArray(forecastOf(row))),
  );
  if (forecasts.length === NONE) {
    return { status: "unavailable" };
  }
  const samples = pipe(
    forecasts,
    Arr.map(({ sample }) => sample),
  );
  return {
    status: "measured",
    ece: expectedCalibrationError(samples, { bins: CALIBRATION_BINS }),
    brier:
      Num.sumAll(
        pipe(
          forecasts,
          Arr.map(({ brier }) => brier),
        ),
      ) / forecasts.length,
    forecasts: forecasts.length,
    curve: pipe(
      calibrationCurve(samples, { bins: CALIBRATION_BINS }),
      Arr.map(({ meanPredicted, observedFrequency, count }) => ({
        meanPredicted,
        observedFrequency,
        count,
      })),
    ),
  };
};

export { calibrationOf };
