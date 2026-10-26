import { Array as Arr, pipe } from "effect";

import { displayLabel } from "#/pages/leaderboard/model/display-label";
import { colorOf } from "#/pages/leaderboard/model/model-color";
import type { TaskEntry } from "#/pages/leaderboard/model/ranking";
import { toPercentPoints } from "#/pages/leaderboard/ui/format";

import { ORIGIN } from "./chart-style";
import { errorOf } from "./interval-bar";
import { placeLabels } from "./label-placement";
import type { LabelSpot } from "./label-placement";
import { taskDetail } from "./model-detail";
import type { Axis, ScatterPoint } from "./score-scatter-model";

const HEADROOM = 1.3;
const LATENCY_STEP = 100;
const MIN_COST_USD = 0.1;
const COST_PRECISION = 1000;
const COST_STEP = 10;

const UNIT = 1;
const PLOT_WIDTH = 330;
const PLOT_HEIGHT = 170;
const NO_SPOT: LabelSpot = { dx: ORIGIN, dy: ORIGIN, ring: "near" };

const LATENCY_AXIS: Axis = {
  name: "p50 ms",
  domain: [ORIGIN, (max) => Math.ceil((max * HEADROOM) / LATENCY_STEP) * LATENCY_STEP],
  format: String,
};

const COST_AXIS: Axis = {
  name: "USD",
  domain: [
    ORIGIN,
    (max) => Math.max(Math.ceil(max * HEADROOM * COST_STEP) / COST_STEP, MIN_COST_USD),
  ],
  format: (value) => `$${Math.round(Number(value) * COST_PRECISION) / COST_PRECISION}`,
};

const spotsOf = ({
  entries,
  axis,
  measureOf,
}: Readonly<{
  entries: readonly TaskEntry[];
  axis: Axis;
  measureOf: (entry: TaskEntry) => number;
}>): ReturnType<typeof placeLabels> => {
  const [, upperOf] = axis.domain;
  const measures = pipe(
    entries,
    Arr.map((entry) => measureOf(entry)),
  );
  const xMax = upperOf(Math.max(ORIGIN, ...measures));
  return placeLabels(
    pipe(
      entries,
      Arr.map((entry) => {
        const { lower, upper } = entry.result.test.skillInterval;
        return {
          across: (measureOf(entry) / xMax) * PLOT_WIDTH,
          down: (UNIT - entry.result.test.skill) * PLOT_HEIGHT,
          whiskerTop: (UNIT - upper) * PLOT_HEIGHT,
          whiskerBottom: (UNIT - lower) * PLOT_HEIGHT,
        };
      }),
    ),
  );
};

const scatterPoints = ({
  entries: all,
  axis,
  measureOf,
}: Readonly<{
  entries: readonly TaskEntry[];
  axis: Axis;
  measureOf: (entry: TaskEntry) => number;
}>): readonly ScatterPoint[] => {
  const entries = pipe(
    all,
    Arr.filter(({ result }) => result.support === "supported"),
  );
  const spots = spotsOf({ entries, axis, measureOf });
  return pipe(
    entries,
    Arr.map((entry, index) => {
      const skill = toPercentPoints(entry.result.test.skill);
      const { lower, upper } = entry.result.test.skillInterval;
      return {
        label: displayLabel(entry),
        color: colorOf(entry.model.model),
        detail: taskDetail(entry),
        mark: String(entry.mark),
        spot: spots[index] ?? NO_SPOT,
        measure: measureOf(entry),
        skill,
        error: errorOf({
          value: skill,
          lower: toPercentPoints(lower),
          upper: toPercentPoints(upper),
        }),
      };
    }),
  );
};

export { COST_AXIS, LATENCY_AXIS, scatterPoints };
