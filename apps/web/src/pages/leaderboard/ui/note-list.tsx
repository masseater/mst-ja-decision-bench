import { Array as Arr, pipe } from "effect";
import type { ReactNode } from "react";

type Note = Readonly<{ icon: ReactNode; text: string }>;

const NoteList = ({ notes }: Readonly<{ notes: readonly Note[] }>): ReactNode => (
  <ul className="text-muted-foreground flex flex-col gap-1.5 text-sm">
    {pipe(
      notes,
      Arr.map(({ icon, text }) => (
        <li
          key={text}
          className="flex items-start gap-2 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0"
        >
          {icon}
          {text}
        </li>
      )),
    )}
  </ul>
);

export { NoteList };
export type { Note };
