import type { ReactNode } from "react";

import { useVisibleModels } from "#/pages/leaderboard/model/view";

import { BarChart } from "./charts/bar-chart";
import { ChartFigure } from "./charts/chart-figure";
import { rowsOf } from "./index-rows";
import { Section } from "./section";
import { IndexTable } from "./tables/index-table";

const CHART_TITLE = "指数";

const IndexSection = (): ReactNode => {
  const models = useVisibleModels();
  return (
    <Section id="index" title="総合指数（参考）">
      <ChartFigure title={CHART_TITLE}>
        <BarChart title={CHART_TITLE} rows={rowsOf(models)} />
      </ChartFigure>
      <IndexTable models={models} />
    </Section>
  );
};

export { IndexSection };
