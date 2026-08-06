"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

type PaymentMethod = "bank_transfer" | "mobile_money" | "cash" | "other";

const METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  cash: "Cash",
  other: "Other",
};

function money(amount: number, currency = "RWF"): string {
  return `${currency} ${amount.toLocaleString()}`;
}

interface TournamentFinanceProps {
  tournamentId: Id<"tournaments">;
  token: string;
  role: string;
}

export default function TournamentFinance({
  tournamentId,
  token,
  role,
}: TournamentFinanceProps) {
  return role === "admin" ? (
    <AdminFinance tournamentId={tournamentId} token={token} />
  ) : (
    <SchoolFinance tournamentId={tournamentId} token={token} />
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function AdminFinance({
  tournamentId,
  token,
}: {
  tournamentId: Id<"tournaments">;
  token: string;
}) {
  const finance = useQuery(api.functions.finance.getTournamentFinance, {
    token,
    tournament_id: tournamentId,
  });

  const [selected, setSelected] = useState<Id<"schools"> | null>(null);

  if (finance === undefined) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Expected" value={money(finance.expected)} />
        <SummaryCard label="Collected" value={money(finance.collected)} />
        <SummaryCard label="Outstanding" value={money(finance.outstanding)} />
        <SummaryCard label="Awaiting review" value={String(finance.pending_review)} />
      </div>

      {selected && (
        <SchoolPaymentReview
          tournamentId={tournamentId}
          token={token}
          schoolId={selected}
          onClose={() => setSelected(null)}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schools</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {finance.schools.length === 0 && (
            <p className="text-sm text-muted-foreground">No teams have registered yet.</p>
          )}

          {finance.schools.map((school) => (
            <div
              key={school.school_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{school.school_name}</p>
                <p className="text-xs text-muted-foreground">
                  {school.teams} {school.teams === 1 ? "team" : "teams"} ·{" "}
                  {money(school.amount_paid)} of {money(school.amount_due)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={school.settled ? "secondary" : "destructive"}>
                  {school.settled ? "Settled" : `${money(school.outstanding)} due`}
                </Badge>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelected(school.school_id)}
                >
                  Review
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SchoolPaymentReview({
  tournamentId,
  token,
  schoolId,
  onClose,
}: {
  tournamentId: Id<"tournaments">;
  token: string;
  schoolId: Id<"schools">;
  onClose: () => void;
}) {
  const status = useQuery(api.functions.finance.getSchoolPaymentStatus, {
    token,
    tournament_id: tournamentId,
    school_id: schoolId,
  });

  const review = useMutation(api.functions.finance.reviewPaymentClaim);
  const [working, setWorking] = useState<string | null>(null);

  const decide = async (paymentId: Id<"payments">, decision: "confirm" | "reject") => {
    setWorking(paymentId);

    try {
      const result = await review({ token, payment_id: paymentId, decision });

      toast.success(
        decision === "confirm"
          ? result.teams_marked_paid > 0
            ? `Confirmed. ${result.teams_marked_paid} teams marked paid.`
            : "Confirmed. The balance is not yet cleared."
          : "Payment rejected."
      );
    } catch (error: any) {
      toast.error(error?.message ?? "Could not update the payment.");
    } finally {
      setWorking(null);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Payments</DialogTitle>
          <DialogDescription>
            Confirm a payment once the money has arrived.
          </DialogDescription>
        </DialogHeader>

        {status === undefined ? (
          <Skeleton className="h-32 w-full" />
        ) : status.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {status.payments.map((payment) => (
              <div key={payment._id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {money(payment.amount, payment.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {METHOD_LABELS[payment.method as PaymentMethod] ?? payment.method}
                      {payment.reference_number && ` · ${payment.reference_number}`}
                    </p>
                  </div>

                  {payment.status === "pending" ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={working === payment._id}
                        onClick={() => decide(payment._id, "confirm")}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={working === payment._id}
                        onClick={() => decide(payment._id, "reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <Badge variant={payment.status === "completed" ? "secondary" : "destructive"}>
                      {payment.status === "completed" ? "Confirmed" : "Rejected"}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SchoolFinance({
  tournamentId,
  token,
}: {
  tournamentId: Id<"tournaments">;
  token: string;
}) {
  const status = useQuery(api.functions.finance.getSchoolPaymentStatus, {
    token,
    tournament_id: tournamentId,
  });

  const submitClaim = useMutation(api.functions.finance.submitPaymentClaim);

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  if (status === undefined) return <Skeleton className="h-64 w-full" />;

  const record = async () => {
    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter the amount you paid.");
      return;
    }

    setSaving(true);

    try {
      const result = await submitClaim({
        token,
        tournament_id: tournamentId,
        amount: value,
        method,
        reference_number: reference || undefined,
        notes: notes || undefined,
      });

      if (result.duplicate) {
        toast.info("That reference has already been recorded.");
      } else {
        toast.success("Recorded. An administrator will confirm it.");
      }

      setOpen(false);
      setAmount("");
      setReference("");
      setNotes("");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not record the payment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Amount due" value={money(status.amount_due)} />
        <SummaryCard label="Confirmed" value={money(status.amount_paid)} />
        <SummaryCard label="Outstanding" value={money(status.outstanding)} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Payments</CardTitle>
          <Button size="sm" onClick={() => setOpen(true)}>
            Record a payment
          </Button>
        </CardHeader>

        <CardContent className="space-y-2">
          {status.waived_teams > 0 && (
            <p className="text-xs text-muted-foreground">
              {status.waived_teams} {status.waived_teams === 1 ? "team is" : "teams are"} waived
              and not billed.
            </p>
          )}

          {status.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            status.payments.map((payment) => (
              <div
                key={payment._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {money(payment.amount, payment.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {METHOD_LABELS[payment.method as PaymentMethod] ?? payment.method}
                    {payment.reference_number && ` · ${payment.reference_number}`} ·{" "}
                    {new Date(payment.created_at).toLocaleDateString()}
                  </p>
                </div>

                <Badge
                  variant={
                    payment.status === "completed"
                      ? "secondary"
                      : payment.status === "pending"
                        ? "outline"
                        : "destructive"
                  }
                >
                  {payment.status === "completed"
                    ? "Confirmed"
                    : payment.status === "pending"
                      ? "Awaiting confirmation"
                      : "Rejected"}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a payment</DialogTitle>
            <DialogDescription>
              An administrator confirms this before it counts against your balance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={String(status.outstanding || 0)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="method">Method</Label>
              <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
                <SelectTrigger id="method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="reference">Reference</Label>
              <Input
                id="reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Transaction number"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={record} disabled={saving}>
              {saving ? "Recording…" : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
