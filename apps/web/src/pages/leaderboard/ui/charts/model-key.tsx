import { Array as Arr, pipe } from "effect";
import type { ReactNode } from "react";

import { displayLabel } from "#/pages/leaderboard/model/display-label";
import { colorOf } from "#/pages/leaderboard/model/model-color";
import type { TaskEntry } from "#/pages/leaderboard/model/ranking";
import { ModelName } from "#/pages/leaderboard/ui/model-name";

const ModelKey = ({ entries }: Readonly<{ entries: readonly TaskEntry[] }>): ReactNode => (
  <ol className="text-muted-foreground grid grid-cols-2 content-start gap-x-4 gap-y-1 self-start text-xs sm:grid-cols-3">
    {pipe(
      entries,
      Arr.map((entry) => (
        <li key={entry.model.model} className="flex items-center gap-1.5">
          <span className="text-foreground w-5 text-right tabular-nums">{entry.mark}</span>
          <ModelName color={colorOf(entry.model.model)} label={displayLabel(entry)} />
        </li>
      )),
    )}
  </ol>
);

export { ModelKey };
