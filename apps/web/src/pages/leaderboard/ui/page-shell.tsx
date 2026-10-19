import { Clock } from "lucide-react";
import type { ReactNode } from "react";

import { summary } from "#/pages/leaderboard/model/summary";

import { ModelFilter } from "./model-filter";
import { TaskNav } from "./task-nav";

const updatedAt = summary.generatedAt.replace(/T(?<time>\d{2}:\d{2}).*$/u, " $<time> UTC");

const PageShell = ({
  header,
  children,
}: Readonly<{ header: ReactNode; children: ReactNode }>): ReactNode => (
  <main className="vt-match mx-auto flex max-w-4xl flex-col gap-12 px-4 py-8 sm:px-8">
    <header className="flex flex-col gap-3">
      <TaskNav />
      {header}
    </header>
    <ModelFilter />
    {children}
    <footer className="text-muted-foreground flex items-center gap-2 text-xs">
      <Clock aria-hidden="true" className="size-3" />
      <time dateTime={summary.generatedAt}>{updatedAt}</time>
    </footer>
  </main>
);

export { PageShell };
