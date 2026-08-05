"use client";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MARGIN_BAND_LABELS,
  marginBand,
  validateOutcome,
} from "@/lib/scoring/wsdc";
import { MIN_RFD_LENGTH, type BallotTeam } from "./types";

interface DecisionPanelProps {
  proposition: BallotTeam;
  opposition: BallotTeam;
  winningTeamId: string;
  rfd: string;
  disabled?: boolean;
  scoresComplete: boolean;
  onSelectWinner: (teamId: string) => void;
  onRfdChange: (rfd: string) => void;
}

export function DecisionPanel({
  proposition,
  opposition,
  winningTeamId,
  rfd,
  disabled = false,
  scoresComplete,
  onSelectWinner,
  onRfdChange,
}: DecisionPanelProps) {
  const winner = winningTeamId === proposition.id ? proposition : opposition;
  const loser = winningTeamId === proposition.id ? opposition : proposition;

  const outcome = winningTeamId && scoresComplete
    ? validateOutcome(winner.total, loser.total)
    : null;

  const rfdRemaining = MIN_RFD_LENGTH - rfd.trim().length;

  return (
    <Card className="p-3 sm:p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[proposition, opposition].map((team) => {
          const isWinner = winningTeamId === team.id;

          return (
            <Button
              key={team.id}
              type="button"
              variant={isWinner ? "default" : "outline"}
              disabled={disabled}
              onClick={() => onSelectWinner(team.id)}
              className="h-auto flex-col items-start gap-1 p-3 text-left whitespace-normal"
            >
              <span className="flex items-center gap-1.5 text-xs opacity-80">
                {team.side === "proposition" ? "Proposition" : "Opposition"}
                {isWinner && <Trophy className="h-3 w-3" />}
              </span>
              <span className="font-medium break-words">{team.name}</span>
              <span className="text-lg font-semibold tabular-nums">
                {scoresComplete ? team.total : "—"}
              </span>
            </Button>
          );
        })}
      </div>

      {outcome && !outcome.valid && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{outcome.message}</AlertDescription>
        </Alert>
      )}

      {outcome?.valid && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary" className="tabular-nums">
            Margin {outcome.margin}
          </Badge>
          <span className="text-muted-foreground">
            {MARGIN_BAND_LABELS[marginBand(outcome.margin)]}
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="rfd">Reason for decision</Label>
        <Textarea
          id="rfd"
          rows={5}
          disabled={disabled}
          value={rfd}
          onChange={(event) => onRfdChange(event.target.value)}
          placeholder="Explain the decision: the main clash, which team won it, and why."
          aria-describedby="rfd-hint"
        />
        <p
          id="rfd-hint"
          className={cn(
            "text-[11px]",
            rfdRemaining > 0 ? "text-muted-foreground" : "text-muted-foreground"
          )}
        >
          {rfdRemaining > 0
            ? `${rfdRemaining} more characters needed before you can submit`
            : "Required before submitting"}
        </p>
      </div>
    </Card>
  );
}
