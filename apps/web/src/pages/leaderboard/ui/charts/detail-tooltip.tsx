import { Schema, Array as Arr, pipe } from "effect";
import type { ReactNode } from "react";
import type { TooltipContentProps } from "recharts";

const RowSchema = Schema.Struct({ name: Schema.String, value: Schema.String });

const InnerSchema = Schema.Struct({ title: Schema.String, rows: Schema.Array(RowSchema) });

const DetailSchema = Schema.Struct({ detail: InnerSchema });

const hasDetail = Schema.is(DetailSchema);

const DetailTooltip = ({
  active,
  payload,
}: Readonly<Pick<TooltipContentProps, "active" | "payload">>): ReactNode => {
  const [point] = pipe(
    payload,
    Arr.map(({ payload: inner }): unknown => inner),
  );
  if (!active || !hasDetail(point)) {
    return "";
  }
  const { title, rows } = point.detail;
  return (
    <div className="bg-popover text-popover-foreground flex min-w-56 flex-col gap-0.5 rounded-md border px-3 py-2 text-xs shadow-md">
      <p className="mb-1 text-sm font-medium">{title}</p>
      {pipe(
        rows,
        Arr.map(({ name, value }) => (
          <p key={name} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{name}</span>
            <span className="tabular-nums">{value}</span>
          </p>
        )),
      )}
    </div>
  );
};

export { DetailTooltip };
