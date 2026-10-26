import { Array as Arr, pipe, String as Str, Number as Num, Order } from "effect";

import { summary } from "./summary";
import type { ModelResult, TaskResult } from "./summary";

type TaskEntry = Readonly<{ model: ModelResult; result: TaskResult; mark: number }>;

const FIRST_MARK = 1;

const byIndexDescending = Order.mapInput(
  Order.flip(Num.Order),
  (model: ModelResult) => model.index,
);
const byLabel = Order.make((left: ModelResult, right: ModelResult) =>
  pipe(left.label, Str.localeCompare(right.label)),
);

const bySkillDescending = Order.mapInput(
  Order.flip(Num.Order),
  ({ result }: Readonly<{ result: TaskResult }>) => result.test.skill,
);

const rankedModels: readonly ModelResult[] = pipe(
  summary.models,
  Arr.sortBy(byIndexDescending, byLabel),
);

type TaskInfo = Readonly<
  Pick<TaskResult, "task" | "label" | "format" | "metric"> & { test: number; hard: number }
>;

const tasks: readonly TaskInfo[] = [
  ...new Map(
    pipe(
      summary.models,
      Arr.flatMap((model) =>
        pipe(
          model.tasks,
          Arr.map(
            (result) =>
              [
                result.task,
                {
                  task: result.task,
                  label: result.label,
                  format: result.format,
                  metric: result.metric,
                  test: result.test.total,
                  hard: result.hard.total,
                },
              ] as const,
          ),
        ),
      ),
    ),
  ).values(),
];

const entriesOf = (task: string): readonly TaskEntry[] =>
  pipe(
    rankedModels,
    Arr.flatMap((model) =>
      pipe(
        model.tasks,
        Arr.filter((result) => result.task === task),
        Arr.map((result) => ({ model, result })),
      ),
    ),
    Arr.sortBy(bySkillDescending),
    Arr.map(({ model, result }, index) => ({ model, result, mark: index + FIRST_MARK })),
  );

export { entriesOf, rankedModels, tasks };
export type { TaskEntry, TaskInfo };
