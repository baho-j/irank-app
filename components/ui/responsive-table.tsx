"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * A table on wide screens, a list of cards below `sm`.
 *
 * Every data table in the app is seven to nine columns wide, some with fixed
 * widths larger than a phone viewport. They scroll horizontally, which keeps
 * the layout intact but leaves a judge reading a 360px peephole. Cards give
 * each row the full width instead.
 *
 * Columns are declared once and rendered both ways, so the two presentations
 * cannot drift apart. Priority decides what a card leads with:
 *
 * - `primary`   — the card's title. Exactly one column.
 * - `secondary` — shown under the title, unlabelled.
 * - `summary`   — always visible as a labelled field.
 * - `detail`    — hidden until the card is expanded.
 */
export type ColumnPriority = "primary" | "secondary" | "summary" | "detail";

export interface ResponsiveColumn<Row> {
  /** Stable identity, also used as the React key. */
  id: string;
  header: React.ReactNode;
  cell: (row: Row) => React.ReactNode;
  priority?: ColumnPriority;
  /** Applied to the header and cells in table form only. */
  className?: string;
  /** Label shown beside the value on a card; defaults to the header. */
  cardLabel?: React.ReactNode;
}

interface ResponsiveTableProps<Row> {
  rows: Row[];
  columns: Array<ResponsiveColumn<Row>>;
  rowKey: (row: Row) => string;
  empty?: React.ReactNode;
  onRowClick?: (row: Row) => void;
  className?: string;
  /** Rendered on each card under the fields, for row actions. */
  cardFooter?: (row: Row) => React.ReactNode;
}

export function ResponsiveTable<Row>({
  rows,
  columns,
  rowKey,
  empty,
  onRowClick,
  className,
  cardFooter,
}: ResponsiveTableProps<Row>) {
  if (rows.length === 0 && empty) {
    return <>{empty}</>;
  }

  return (
    <>
      <div className={cn("hidden sm:block rounded-md border", className)}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.id} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? "cursor-pointer" : undefined}
              >
                {columns.map((column) => (
                  <TableCell key={column.id} className={column.className}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className={cn("space-y-2 sm:hidden", className)}>
        {rows.map((row) => (
          <ResponsiveCard
            key={rowKey(row)}
            row={row}
            columns={columns}
            onClick={onRowClick}
            footer={cardFooter}
          />
        ))}
      </div>
    </>
  );
}

function ResponsiveCard<Row>({
  row,
  columns,
  onClick,
  footer,
}: {
  row: Row;
  columns: Array<ResponsiveColumn<Row>>;
  onClick?: (row: Row) => void;
  footer?: (row: Row) => React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(false);

  const by = (priority: ColumnPriority) =>
    columns.filter((column) => (column.priority ?? "summary") === priority);

  const primary = by("primary");
  const secondary = by("secondary");
  const summary = by("summary");
  const detail = by("detail");

  return (
    <div className="rounded-md border p-3">
      <div
        className={cn("flex items-start justify-between gap-2", onClick && "cursor-pointer")}
        onClick={onClick ? () => onClick(row) : undefined}
      >
        <div className="min-w-0 flex-1 space-y-1">
          {primary.map((column) => (
            <div key={column.id} className="font-medium">
              {column.cell(row)}
            </div>
          ))}

          {secondary.map((column) => (
            <div key={column.id} className="text-sm text-muted-foreground">
              {column.cell(row)}
            </div>
          ))}
        </div>

        {detail.length > 0 && (
          <button
            type="button"
            aria-label={expanded ? "Hide details" : "Show details"}
            aria-expanded={expanded}
            // Meets the minimum tap target on a phone.
            className="-m-2 flex size-11 shrink-0 items-center justify-center"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((open) => !open);
            }}
          >
            <ChevronDown
              className={cn("size-4 transition-transform", expanded && "rotate-180")}
            />
          </button>
        )}
      </div>

      {summary.length > 0 && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          {summary.map((column) => (
            <div key={column.id} className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">{column.cardLabel ?? column.header}</dt>
              <dd className="min-w-0 truncate text-right">{column.cell(row)}</dd>
            </div>
          ))}
        </dl>
      )}

      {expanded && detail.length > 0 && (
        <dl className="mt-2 space-y-1 border-t pt-2 text-sm">
          {detail.map((column) => (
            <div key={column.id} className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">{column.cardLabel ?? column.header}</dt>
              <dd className="min-w-0 text-right">{column.cell(row)}</dd>
            </div>
          ))}
        </dl>
      )}

      {footer && <div className="mt-2 border-t pt-2">{footer(row)}</div>}
    </div>
  );
}
