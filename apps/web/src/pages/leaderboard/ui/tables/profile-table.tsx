import { Array as Arr, pipe } from "effect";
import type { ReactNode } from "react";

import { displayLabel } from "#/pages/leaderboard/model/display-label";
import type { TaskEntry, TaskInfo } from "#/pages/leaderboard/model/ranking";
import type { TableColumn } from "#/pages/leaderboard/model/sorting";
import { decimal, usd } from "#/pages/leaderboard/ui/format";

import { SortableTable } from "./sortable-table";
import { taskEntryColor, taskEntryKey } from "./task-entry";

const CAPTION = "確信度・速度・費用";
const LABEL = "モデル";

const MISSING = "-";
const BOTTOM = -1;

type Calibration = "ece" | "brier";

const calibrationValue =
  (key: Calibration) =>
  ({ result }: TaskEntry): number => {
    if (result.test.calibration.status === "unavailable") {
      return BOTTOM;
    }
    return result.test.calibration[key];
  };

const calibrationText =
  (key: Calibration) =>
  ({ result }: TaskEntry): string => {
    if (result.test.calibration.status === "unavailable") {
      return MISSING;
    }
    return decimal(result.test.calibration[key]);
  };

const supportedOf = (entries: readonly TaskEntry[]): readonly TaskEntry[] =>
  pipe(
    entries,
    Arr.filter(({ result }) => result.support === "supported"),
  );

const COLUMNS: readonly TableColumn<TaskEntry>[] = [
  { id: "ece", header: "ECE", sortValue: calibrationValue("ece"), display: calibrationText("ece") },
  {
    id: "brier",
    header: "Brier",
    sortValue: calibrationValue("brier"),
    display: calibrationText("brier"),
  },
  {
    id: "latency",
    header: "p50 / p95 ms",
    sortValue: ({ result }) => result.p50Ms,
    display: ({ result }) => `${result.p50Ms} / ${result.p95Ms}`,
  },
  {
    id: "cost",
    header: "タスク全体の費用",
    sortValue: ({ result }) => result.costUsd,
    display: ({ result }) => usd(result.costUsd),
  },
];

const ProfileTable = ({
  task,
  entries,
}: Readonly<{ task: TaskInfo; entries: readonly TaskEntry[] }>): ReactNode => (
  <SortableTable
    id={`profile-${task.task}`}
    caption={CAPTION}
    label={LABEL}
    rows={supportedOf(entries)}
    keyOf={taskEntryKey}
    colorOf={taskEntryColor}
    labelOf={displayLabel}
    columns={COLUMNS}
  />
);

export { ProfileTable };
