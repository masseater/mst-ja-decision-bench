import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Array, Order, pipe } from "effect";
import { Atom } from "effect/reactivity";

type SortDirection = "asc" | "desc" | "none";

type TableColumn<Row> = Readonly<{
  id: string;
  header: string;
  sortValue: (row: Row) => number;
  display: (row: Row) => string;
}>;

const LABEL_ID = "label";

type Sort =
  | Readonly<{ status: "default" }>
  | Readonly<{ status: "sorted"; column: string; direction: "asc" | "desc" }>;

const DEFAULT_SORT: Sort = { status: "default" };

const sortAtom = Atom.family((_table: string) => Atom.make<Sort>(DEFAULT_SORT));

const nextSort = ({ current, column }: Readonly<{ current: Sort; column: string }>): Sort => {
  if (current.status === "default" || current.column !== column) {
    return { status: "sorted", column, direction: "desc" };
  }
  if (current.direction === "desc") {
    return { status: "sorted", column, direction: "asc" };
  }
  return DEFAULT_SORT;
};

const directionOf = ({ sort, column }: Readonly<{ sort: Sort; column: string }>): SortDirection => {
  if (sort.status === "default" || sort.column !== column) {
    return "none";
  }
  return sort.direction;
};

const useSort = (table: string): Sort => useAtomValue(sortAtom(table));

type SortEvent = Readonly<{ currentTarget: Readonly<{ value: string }> }>;

const useSortClick = (table: string): ((event: SortEvent) => void) => {
  const current = useSort(table);
  const set = useAtomSet(sortAtom(table));
  return (event) => {
    set(nextSort({ current, column: event.currentTarget.value }));
  };
};

const orderOf = <Row>({
  column,
  columns,
  labelOf,
}: Readonly<{
  column: string;
  columns: readonly TableColumn<Row>[];
  labelOf: (row: Row) => string;
}>): Order.Order<Row> => {
  if (column === LABEL_ID) {
    return Order.mapInput(Order.String, labelOf);
  }
  return Order.combineAll(
    pipe(
      columns,
      Array.filter(({ id }) => id === column),
      Array.map(({ sortValue }) => Order.mapInput(Order.Number, sortValue)),
    ),
  );
};

const sortRows = <Row>({
  rows,
  sort,
  columns,
  labelOf,
}: Readonly<{
  rows: readonly Row[];
  sort: Sort;
  columns: readonly TableColumn<Row>[];
  labelOf: (row: Row) => string;
}>): readonly Row[] => {
  if (sort.status === "default") {
    return rows;
  }
  const order = orderOf({ column: sort.column, columns, labelOf });
  if (sort.direction === "asc") {
    return Array.sort(rows, order);
  }
  return Array.sort(rows, Order.flip(order));
};

export { directionOf, LABEL_ID, sortRows, useSort, useSortClick };
export type { Sort, SortDirection, TableColumn };
