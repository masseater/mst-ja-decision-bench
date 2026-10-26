import { Link } from "@tanstack/react-router";
import { Array as Arr, pipe } from "effect";
import type { ReactNode } from "react";

import { NoteList } from "./note-list";
import { Section } from "./section";
import { notesOf } from "./task-notes";
import { taskRoutes } from "./task-routes";

const TaskLinks = (): ReactNode => (
  <Section id="tasks" title="タスク">
    {pipe(
      taskRoutes,
      Arr.map(({ info, params }) => (
        <article key={info.task} className="flex flex-col gap-2">
          <Link to="/tasks/$task" params={params} className="text-primary font-medium underline">
            {info.label}
          </Link>
          <NoteList notes={notesOf(info)} />
        </article>
      )),
    )}
  </Section>
);

export { TaskLinks };
