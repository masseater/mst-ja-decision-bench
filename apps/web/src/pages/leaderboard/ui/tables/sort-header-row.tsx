"use client";

import { Array as Arr, pipe } from "effect";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";

import { directionOf, LABEL_ID, useSort, useSortClick } from "#/pages/leaderboard/model/sorting";
import type { TableColumn } from "#/pages/leaderboard/model/sorting";
import { Button } from "#/shared/ui/button";
import { TableHead } from "#/shared/ui/table-head";
import { TableRow } from "#/shared/ui/table-row";

const ARIA_SORT = { asc: "ascending", desc: "descending", none: "none" } as const;

const ICONS = {
  asc: <ArrowUp data-icon="inline-end" aria-hidden="true" />,
  desc: <ArrowDown data-icon="inline-end" aria-hidden="true" />,
  none: <ArrowUpDown data-icon="inline-end" aria-hidden="true" />,
} as const;

const SortHeaderRow = <Row,>({
  table,
  label,
  columns,
}: Readonly<{ table: string; label: string; columns: readonly TableColumn<Row>[] }>): ReactNode => {
  const sort = useSort(table);
  const handleSort = useSortClick(table);
  const labelDirection = directionOf({ sort, column: LABEL_ID });
  return (
    <TableRow>
      <TableHead scope="col" aria-sort={ARIA_SORT[labelDirection]}>
        <Button variant="ghost" size="xs" value={LABEL_ID} onClick={handleSort}>
          {label}
          {ICONS[labelDirection]}
        </Button>
      </TableHead>
      {pipe(
        columns,
        Arr.map(({ id, header }) => {
          const direction = directionOf({ sort, column: id });
          return (
            <TableHead key={id} scope="col" aria-sort={ARIA_SORT[direction]} className="text-right">
              <Button variant="ghost" size="xs" value={id} onClick={handleSort}>
                {header}
                {ICONS[direction]}
              </Button>
            </TableHead>
          );
        }),
      )}
    </TableRow>
  );
};

export { SortHeaderRow };
