import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { String as Str, pipe, Array as Arr } from "effect";
import { Atom } from "effect/reactivity";

import { entriesOf, rankedModels } from "./ranking";
import type { TaskEntry } from "./ranking";
import type { ModelResult } from "./summary";

type Scope = "top" | "all";

type QueryEvent = Readonly<{ target: Readonly<{ value: string }> }>;

const TOP_COUNT = 10;
const FIRST = 0;

const scopeAtom = Atom.make<Scope>("top");
const queryAtom = Atom.make("");

const useScope = (): Scope => useAtomValue(scopeAtom);
const useScopeChange = (): ((value: string) => void) => {
  const set = useAtomSet(scopeAtom);
  return (value) => {
    if (value === "top" || value === "all") {
      set(value);
    }
  };
};
const useQuery = (): string => useAtomValue(queryAtom);
const useQueryChange = (): ((event: QueryEvent) => void) => {
  const set = useAtomSet(queryAtom);
  return (event) => {
    set(event.target.value);
  };
};

const narrow = <Item>({
  items,
  labelOf,
  scope,
  query,
}: Readonly<{
  items: readonly Item[];
  labelOf: (item: Item) => string;
  scope: Scope;
  query: string;
}>): readonly Item[] => {
  const needle = Str.toLowerCase(Str.trim(query));
  const matches = pipe(
    items,
    Arr.filter((item) => pipe(Str.toLowerCase(labelOf(item)), Str.includes(needle))),
  );
  if (scope === "all") {
    return matches;
  }
  return matches.slice(FIRST, TOP_COUNT);
};

const useVisibleEntries = (task: string): readonly TaskEntry[] =>
  narrow({
    items: entriesOf(task),
    labelOf: ({ model }) => model.label,
    scope: useScope(),
    query: useQuery(),
  });

const useVisibleModels = (): readonly ModelResult[] =>
  narrow({
    items: rankedModels,
    labelOf: ({ label }) => label,
    scope: useScope(),
    query: useQuery(),
  });

export {
  TOP_COUNT,
  useQuery,
  useScope,
  useQueryChange,
  useScopeChange,
  useVisibleEntries,
  useVisibleModels,
};
export type { Scope };
