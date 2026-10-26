"use client";

import { Array as Arr, pipe } from "effect";
import type { ReactNode } from "react";
import { Legend, Scatter, ScatterChart } from "recharts";

import { displayLabel } from "#/pages/leaderboard/model/display-label";
import { colorOf } from "#/pages/leaderboard/model/model-color";
import type { TaskEntry } from "#/pages/leaderboard/model/ranking";
import { pointsOf, toPercentPoints } from "#/pages/leaderboard/ui/format";
import { ChartContainer } from "#/shared/ui/chart";

import { ReliabilityAxes } from "./reliability-axes";
import { useLegendHandlers, useSeriesState } from "./reliability-state";
import type { SeriesState } from "./reliability-state";

type Point = Readonly<{ label: string; confidence: number; accuracy: number; count: number }>;

type Series = Readonly<{ model: string; name: string; color: string; points: readonly Point[] }>;

type Line = Readonly<{ stroke: string; strokeWidth: number; strokeOpacity: number }>;

const MARGIN = { top: 16, right: 24, bottom: 16, left: 0 } as const;
const LEGEND_STYLE = { fontSize: 12, paddingTop: 16, cursor: "pointer" } as const;
const EMPHASIS = {
  plain: { width: 2, opacity: 1 },
  focused: { width: 3, opacity: 1 },
  faded: { width: 2, opacity: 0.15 },
} as const;

const RADIX = 10;
const FULL_PERCENT = 100;

const lowestOf = (series: readonly Series[]): number =>
  Math.min(
    FULL_PERCENT,
    ...pipe(
      series,
      Arr.flatMap(({ points }) =>
        pipe(
          points,
          Arr.map(({ confidence }) => confidence),
        ),
      ),
    ),
  );

const rankOf = ({ value }: Readonly<{ value: string | undefined }>): number =>
  Number.parseInt(value ?? "", RADIX);

const legendText = (value: unknown): ReactNode => (
  <span className="text-foreground">{String(value)}</span>
);

const seriesOf = (entries: readonly TaskEntry[]): readonly Series[] =>
  pipe(
    entries,
    Arr.flatMap((entry) => {
      const { calibration } = entry.result.test;
      if (calibration.status === "unavailable") {
        return [];
      }
      const label = displayLabel(entry);
      return [
        {
          model: entry.model.model,
          name: `${entry.mark} ${label}`,
          color: colorOf(entry.model.model),
          points: pipe(
            calibration.curve,
            Arr.map((bin) => ({
              label,
              confidence: toPercentPoints(bin.meanPredicted),
              accuracy: toPercentPoints(bin.observedFrequency),
              count: bin.count,
            })),
          ),
        },
      ];
    }),
  );

const describe = (series: readonly Series[]): string =>
  pipe(
    series,
    Arr.map(
      ({ name, points }) =>
        `${name}: ${pipe(
          points,
          Arr.map(
            ({ confidence, accuracy, count }) =>
              `確信度 ${pointsOf(confidence)}% で正解率 ${pointsOf(accuracy)}%（${count} 件）`,
          ),
          Arr.join("、"),
        )}`,
    ),
    Arr.join("。"),
  );

const lineOf = ({
  color,
  state,
}: Readonly<{ color: string; state: SeriesState }>): Readonly<{ opacity: number; line: Line }> => {
  const { width, opacity } = EMPHASIS[state.focus];
  return { opacity, line: { stroke: color, strokeWidth: width, strokeOpacity: opacity } };
};

const ReliabilityChart = ({
  task,
  entries,
  title,
}: Readonly<{ task: string; entries: readonly TaskEntry[]; title: string }>): ReactNode => {
  const plain = seriesOf(entries);
  const stateOf = useSeriesState({ task });
  const legend = useLegendHandlers({ task, series: plain });
  return (
    <ChartContainer>
      <ScatterChart desc={`${title}: ${describe(plain)}`} margin={MARGIN}>
        <ReliabilityAxes lowest={lowestOf(plain)} />
        <Legend
          wrapperStyle={LEGEND_STYLE}
          itemSorter={rankOf}
          formatter={legendText}
          onClick={legend.handleClick}
          onMouseEnter={legend.handleMouseEnter}
          onMouseLeave={legend.handleMouseLeave}
        />
        {pipe(
          plain,
          Arr.map(({ model, name, color, points }) => {
            const state = stateOf(model);
            const { opacity, line } = lineOf({ color, state });
            return (
              <Scatter
                key={model}
                name={name}
                isAnimationActive={false}
                data={points}
                fill={color}
                fillOpacity={opacity}
                line={line}
                hide={state.hidden}
                onMouseEnter={state.handleMouseEnter}
                onMouseLeave={state.handleMouseLeave}
              />
            );
          }),
        )}
      </ScatterChart>
    </ChartContainer>
  );
};

export { ReliabilityChart };
