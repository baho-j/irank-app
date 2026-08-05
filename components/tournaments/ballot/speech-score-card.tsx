"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  SCORING_CRITERIA,
  averageFor,
  rangesFor,
  speechTotal,
  validateSpeechScore,
  type SpeechScore,
  type SpeechType,
} from "@/lib/scoring/wsdc";

export interface SpeakerEntry {
  speaker_id: string;
  speaker_name: string;
  position: "first" | "second" | "third" | "reply";
  speech_type: SpeechType;
  score: SpeechScore;
  comments?: string;
}

interface SpeechScoreCardProps {
  entry: SpeakerEntry;
  disabled?: boolean;
  onScoreChange: (field: keyof SpeechScore, value: number) => void;
  onCommentChange: (comment: string) => void;
}

const POSITION_LABELS: Record<SpeakerEntry["position"], string> = {
  first: "1st Speaker",
  second: "2nd Speaker",
  third: "3rd Speaker",
  reply: "Reply Speaker",
};

export function SpeechScoreCard({
  entry,
  disabled = false,
  onScoreChange,
  onCommentChange,
}: SpeechScoreCardProps) {
  const ranges = rangesFor(entry.speech_type);
  const average = averageFor(entry.speech_type);
  const issues = useMemo(
    () => validateSpeechScore(entry.score, entry.speech_type),
    [entry.score, entry.speech_type]
  );

  const total = speechTotal(entry.score, entry.speech_type);
  const issueFor = (field: string) => issues.find((issue) => issue.field === field);
  const hasScores = SCORING_CRITERIA.every((c) => Number.isFinite(entry.score[c.key]));

  return (
    <Card className="p-3 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{entry.speaker_name}</p>
          <p className="text-xs text-muted-foreground">
            {POSITION_LABELS[entry.position]}
            {entry.speech_type === "reply" && " — marks are halved"}
          </p>
        </div>

        <div className="text-right">
          <p
            className={cn(
              "text-2xl font-semibold tabular-nums",
              issues.length > 0 && "text-destructive"
            )}
          >
            {hasScores ? total : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            of {ranges.total.min}–{ranges.total.max}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {SCORING_CRITERIA.map((criterion) => {
          const range = ranges[criterion.key];
          const issue = issueFor(criterion.key);

          return (
            <div key={criterion.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={`${entry.speaker_id}-${criterion.key}`} className="text-sm">
                  {criterion.label}
                </Label>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {criterion.weight}
                </span>
              </div>

              <Input
                id={`${entry.speaker_id}-${criterion.key}`}
                type="number"
                inputMode="decimal"
                step={0.5}
                min={range.min}
                max={range.max}
                disabled={disabled}
                value={Number.isFinite(entry.score[criterion.key]) ? entry.score[criterion.key] : ""}
                onChange={(event) =>
                  onScoreChange(criterion.key, Number.parseFloat(event.target.value))
                }
                aria-invalid={!!issue}
                aria-describedby={`${entry.speaker_id}-${criterion.key}-hint`}
                className={cn("tabular-nums", issue && "border-destructive")}
              />

              <p
                id={`${entry.speaker_id}-${criterion.key}-hint`}
                className={cn(
                  "text-[11px]",
                  issue ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {issue
                  ? issue.message
                  : `${range.min}–${range.max}, average ${average[criterion.key]}`}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${entry.speaker_id}-poi`} className="text-sm">
            POI adjustment
          </Label>
          <Input
            id={`${entry.speaker_id}-poi`}
            type="number"
            inputMode="decimal"
            step={0.5}
            min={-2}
            max={2}
            disabled={disabled}
            value={entry.score.poi_modifier ?? 0}
            onChange={(event) =>
              onScoreChange("poi_modifier", Number.parseFloat(event.target.value))
            }
            aria-invalid={!!issueFor("poi_modifier")}
            className={cn("tabular-nums", issueFor("poi_modifier") && "border-destructive")}
          />
          <p
            className={cn(
              "text-[11px]",
              issueFor("poi_modifier") ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {issueFor("poi_modifier")?.message ?? "±2, kept inside the band"}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${entry.speaker_id}-comments`} className="text-sm">
            Comments <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id={`${entry.speaker_id}-comments`}
            rows={2}
            disabled={disabled}
            value={entry.comments ?? ""}
            onChange={(event) => onCommentChange(event.target.value)}
            placeholder="Feedback for this speaker"
          />
        </div>
      </div>

      {entry.speech_type === "reply" && (
        <Badge variant="secondary" className="text-[11px]">
          Reply speech — score it like a substantive speech, then halve
        </Badge>
      )}
    </Card>
  );
}
