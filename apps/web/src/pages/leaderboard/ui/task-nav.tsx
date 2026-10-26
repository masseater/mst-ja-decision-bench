import { Link } from "@tanstack/react-router";
import { Array as Arr, pipe } from "effect";
import type { ReactNode } from "react";

import { taskRoutes } from "./task-routes";

const OVERVIEW = "概要";
const LINK_CLASS = "text-muted-foreground hover:text-foreground";
const ACTIVE_PROPS = { className: "text-foreground font-semibold" } as const;
const EXACT = { exact: true } as const;

const TaskNav = (): ReactNode => (
  <nav aria-label="ページ" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
    <Link to="/" activeOptions={EXACT} className={LINK_CLASS} activeProps={ACTIVE_PROPS}>
      {OVERVIEW}
    </Link>
    {pipe(
      taskRoutes,
      Arr.map(({ info, params }) => (
        <Link
          key={info.task}
          to="/tasks/$task"
          params={params}
          className={LINK_CLASS}
          activeProps={ACTIVE_PROPS}
        >
          {info.label}
        </Link>
      )),
    )}
  </nav>
);

export { TaskNav };
