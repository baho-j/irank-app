"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { BundleEntityType, ReviewItem } from "@/lib/offline/bundle";

const TYPE_LABELS: Record<BundleEntityType, string> = {
  tournament: "Tournament",
  team: "Teams",
  pairing: "Pairings",
  ballot: "Ballots",
  draft: "Ballot drafts",
  lineup: "Team lineups",
  ranking: "Rankings",
  payment: "Payments",
};

const STATUS_LABELS: Record<ReviewItem["status"], string> = {
  new: "New",
  newer: "Newer than yours",
  older: "Older than yours",
  identical: "Same as yours",
};

function statusVariant(status: ReviewItem["status"]) {
  if (status === "newer" || status === "new") return "default" as const;
  if (status === "older") return "destructive" as const;
  return "secondary" as const;
}

function preview(value: unknown): string {
  if (value === null || value === undefined) return "—";

  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);

  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

function when(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

interface TransferReviewProps {
  items: ReviewItem[];
  onApply: (accepted: ReviewItem[]) => void;
  onCancel: () => void;
  applying?: boolean;
}

/**
 * The receiver decides what to take.
 *
 * Nothing is applied until Apply is pressed, and each item can be accepted or
 * declined on its own — a coordinator collecting one judge's ballots should
 * not have to take that device's view of the draw as well. Items that would
 * replace something newer are left unchecked by default, so overwriting more
 * recent work is always a deliberate act.
 */
export function TransferReview({ items, onApply, onCancel, applying }: TransferReviewProps) {
  const [accepted, setAccepted] = useState<Set<string>>(() => {
    const defaults = items
      .filter((item) => item.status === "new" || item.status === "newer")
      .map((item) => item.entity.id);

    return new Set(defaults);
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const groups = new Map<BundleEntityType, ReviewItem[]>();

    for (const item of items) {
      const existing = groups.get(item.entity.type) ?? [];
      existing.push(item);
      groups.set(item.entity.type, existing);
    }

    return [...groups.entries()];
  }, [items]);

  const toggle = (id: string) => {
    setAccepted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (group: ReviewItem[], take: boolean) => {
    setAccepted((current) => {
      const next = new Set(current);

      for (const item of group) {
        if (take) next.add(item.entity.id);
        else next.delete(item.entity.id);
      }

      return next;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const replacingNewer = items.filter(
    (item) => accepted.has(item.entity.id) && item.status === "older"
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {accepted.size} of {items.length} selected
          </p>
          {replacingNewer > 0 && (
            <p className="text-xs text-destructive">
              {replacingNewer} would replace something newer on this device.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAccepted(new Set(items.map((item) => item.entity.id)))}
          >
            Accept all
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAccepted(new Set())}>
            Decline all
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[min(60vh,32rem)] rounded-md border">
        <div className="divide-y">
          {grouped.map(([type, group]) => {
            const takenInGroup = group.filter((item) => accepted.has(item.entity.id)).length;

            return (
              <section key={type}>
                <header className="flex items-center justify-between gap-2 bg-muted/50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{TYPE_LABELS[type]}</span>
                    <Badge variant="secondary">
                      {takenInGroup}/{group.length}
                    </Badge>
                  </div>

                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => toggleGroup(group, true)}>
                      All
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleGroup(group, false)}>
                      None
                    </Button>
                  </div>
                </header>

                {group.map((item) => {
                  const id = item.entity.id;
                  const isOpen = expanded.has(id);

                  return (
                    <article key={id} className="px-3 py-2">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={accepted.has(id)}
                          onCheckedChange={() => toggle(id)}
                          aria-label={`Accept ${item.entity.label}`}
                          className="mt-1"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm">{item.entity.label}</span>
                            <Badge variant={statusVariant(item.status)}>
                              {STATUS_LABELS[item.status]}
                            </Badge>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Theirs: {when(item.entity.updated_at)}
                            {item.mine && ` · Yours: ${when(item.mine.updated_at)}`}
                          </p>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExpanded(id)}
                          aria-label={isOpen ? "Hide comparison" : "Show comparison"}
                        >
                          {isOpen ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </Button>
                      </div>

                      {isOpen && (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <div className="min-w-0">
                            <p className="mb-1 text-xs font-medium text-muted-foreground">Yours</p>
                            <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                              {item.mine ? preview(item.mine.payload) : "Not on this device"}
                            </pre>
                          </div>

                          <div className="min-w-0">
                            <p className="mb-1 text-xs font-medium text-muted-foreground">Theirs</p>
                            <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                              {preview(item.entity.payload)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      </ScrollArea>

      <Separator />

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={applying}>
          Cancel
        </Button>
        <Button
          onClick={() => onApply(items.filter((item) => accepted.has(item.entity.id)))}
          disabled={applying || accepted.size === 0}
        >
          {applying ? "Applying…" : `Apply ${accepted.size}`}
        </Button>
      </div>
    </div>
  );
}
