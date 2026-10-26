import { Array as Arr, pipe } from "effect";

import { pointsOf } from "#/pages/leaderboard/ui/format";

import type { LabelSpot } from "./label-placement";
import type { Detail } from "./model-detail";

type ScatterPoint = Readonly<{
  label: string;
  mark: string;
  spot: LabelSpot;
  measure: number;
  skill: number;
  error: readonly [number, number];
  color: string;
  detail: Detail;
}>;

type Axis = Readonly<{
  name: string;
  domain: readonly [number, (dataMax: number) => number];
  format: (value: unknown) => string;
}>;

const describe = ({
  points,
  axis,
}: Readonly<{ points: readonly ScatterPoint[]; axis: Axis }>): string =>
  pipe(
    points,
    Arr.map(
      ({ label, measure, skill }) =>
        `${label} ${axis.name} ${axis.format(measure)}、skill ${pointsOf(skill)}`,
    ),
    Arr.join("。"),
  );

export { describe };
export type { Axis, ScatterPoint };
