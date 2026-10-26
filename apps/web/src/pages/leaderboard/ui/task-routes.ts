import { Array as Arr, pipe } from "effect";

import { tasks } from "#/pages/leaderboard/model/ranking";
import type { TaskInfo } from "#/pages/leaderboard/model/ranking";

type TaskRoute = Readonly<{ info: TaskInfo; params: Readonly<{ task: string }> }>;

const taskRoutes: readonly TaskRoute[] = pipe(
  tasks,
  Arr.map((info) => ({
    info,
    params: { task: info.task },
  })),
);

export { taskRoutes };
