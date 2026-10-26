"use client";

import { Array as Arr, pipe } from "effect";
import type { ReactNode } from "react";

import { sortRows, useSort } from "#/pages/leaderboard/model/sorting";
import type { TableColumn } from "#/pages/leaderboard/model/sorting";
import { Table } from "#/shared/ui/table";
import { TableBody } from "#/shared/ui/table-body";
import { TableCaption } from "#/shared/ui/table-caption";
import { TableHeader } from "#/shared/ui/table-header";

import { SortBodyRow } from "./sort-body-row";
import { SortHeaderRow } from "./sort-header-row";

const SortableTable = <Row,>({
  id,
  caption,
  label,
  rows,
  keyOf,
  labelOf,
  colorOf,
  columns,
}: Readonly<{
  id: string;
  caption: string;
  label: string;
  rows: readonly Row[];
  keyOf: (row: Row) => string;
  labelOf: (row: Row) => string;
  colorOf: (row: Row) => string;
  columns: readonly TableColumn<Row>[];
}>): ReactNode => {
  const sorted = sortRows({ rows, sort: useSort(id), columns, labelOf });
  return (
    <Table>
      <TableCaption className="mt-0 mb-2 caption-top text-left">{caption}</TableCaption>
      <TableHeader>
        <SortHeaderRow table={id} label={label} columns={columns} />
      </TableHeader>
      <TableBody>
        {pipe(
          sorted,
          Arr.map((row) => (
            <SortBodyRow
              key={keyOf(row)}
              row={row}
              label={labelOf(row)}
              color={colorOf(row)}
              columns={columns}
            />
          )),
        )}
      </TableBody>
    </Table>
  );
};

export { SortableTable };
