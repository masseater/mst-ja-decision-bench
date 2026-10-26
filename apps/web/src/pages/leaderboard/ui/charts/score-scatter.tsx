"use client";

import type { ReactNode } from "react";
import { CartesianGrid, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer } from "#/shared/ui/chart";

import { AXIS_TICK, PERCENT_SCALE, SERIES_COLOR } from "./chart-style";
import { DetailTooltip } from "./detail-tooltip";
import { intervalBar } from "./interval-bar";
import { MarkedPoint } from "./marked-point";
import { describe } from "./score-scatter-model";
import type { Axis, ScatterPoint } from "./score-scatter-model";

const Y_LABEL = { value: "skill", angle: -90, position: "insideLeft", fontSize: 12 } as const;
const MARGIN = { top: 16, right: 24, bottom: 16, left: 0 } as const;

const xLabel = (name: string): Readonly<Record<string, number | string>> => ({
  value: name,
  position: "insideBottom",
  offset: -4,
  fontSize: 12,
});

const ScoreScatter = ({
  points,
  axis,
  title,
}: Readonly<{ points: readonly ScatterPoint[]; axis: Axis; title: string }>): ReactNode => (
  <ChartContainer>
    <ScatterChart desc={`${title}: ${describe({ points, axis })}`} margin={MARGIN}>
      <CartesianGrid />
      <XAxis
        type="number"
        dataKey="measure"
        name={axis.name}
        domain={axis.domain}
        tick={AXIS_TICK}
        tickFormatter={axis.format}
        label={xLabel(axis.name)}
      />
      <YAxis
        type="number"
        dataKey="skill"
        name="skill"
        domain={PERCENT_SCALE}
        tick={AXIS_TICK}
        label={Y_LABEL}
      />
      <Tooltip content={DetailTooltip} />
      <Scatter isAnimationActive={false} data={points} fill={SERIES_COLOR} shape={MarkedPoint}>
        {intervalBar("y")}
      </Scatter>
    </ScatterChart>
  </ChartContainer>
);

export { ScoreScatter };
