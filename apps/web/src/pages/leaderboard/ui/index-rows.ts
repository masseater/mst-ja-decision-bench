import { Array as Arr, pipe } from "effect";

import { colorOf } from "#/pages/leaderboard/model/model-color";
import type { ModelResult } from "#/pages/leaderboard/model/summary";

import type { ChartRow } from "./charts/chart-row";
import { indexDetail } from "./charts/model-detail";

const rowsOf = (models: readonly ModelResult[]): readonly ChartRow[] =>
  pipe(
    models,
    Arr.map((model) => ({
      status: "point",
      key: model.model,
      label: model.label,
      color: colorOf(model.model),
      detail: indexDetail(model),
      ratio: model.index,
    })),
  );

export { rowsOf };
