import { Array as Arr, pipe } from "effect";

import { displayLabel } from "#/pages/leaderboard/model/display-label";
import { colorOf } from "#/pages/leaderboard/model/model-color";
import type { TaskEntry } from "#/pages/leaderboard/model/ranking";

import type { ChartRow } from "./chart-row";
import { taskDetail } from "./model-detail";

const skillRows = (entries: readonly TaskEntry[]): readonly ChartRow[] =>
  pipe(
    entries,
    Arr.map((entry): ChartRow => {
      const label = displayLabel(entry);
      if (entry.result.support === "unsupported") {
        return { status: "unsupported", key: entry.model.model, label };
      }
      return {
        status: "interval",
        key: entry.model.model,
        label,
        color: colorOf(entry.model.model),
        detail: taskDetail(entry),
        ratio: entry.result.test.skill,
        interval: entry.result.test.skillInterval,
      };
    }),
  );

export { skillRows };
