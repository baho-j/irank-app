"use client";

import { useCallback, useMemo, useState } from "react";
import {
  speechTotal,
  validateOutcome,
  validateSpeechScore,
  type SpeechScore,
} from "@/lib/scoring/wsdc";
import {
  EMPTY_SCORE,
  MIN_RFD_LENGTH,
  type BallotSpeaker,
  type BallotTeam,
} from "./types";

interface UseBallotStateArgs {
  speakers: BallotSpeaker[];
  propositionTeam: { id: string; name: string };
  oppositionTeam: { id: string; name: string };
  initial?: {
    winningTeamId?: string;
    rfd?: string;
    notes?: string;
  };
}

/**
 * Holds ballot entry state and derives everything the form needs to decide
 * whether submission is allowed. Validation comes from lib/scoring/wsdc, the
 * same module the server enforces, so the judge is never shown a ballot the
 * mutation will reject.
 */
export function useBallotState({
  speakers: initialSpeakers,
  propositionTeam,
  oppositionTeam,
  initial,
}: UseBallotStateArgs) {
  const [speakers, setSpeakers] = useState<BallotSpeaker[]>(initialSpeakers);
  const [winningTeamId, setWinningTeamId] = useState(initial?.winningTeamId ?? "");
  const [rfd, setRfd] = useState(initial?.rfd ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const updateScore = useCallback(
    (speakerId: string, field: keyof SpeechScore, value: number) => {
      setSpeakers((current) =>
        current.map((speaker) =>
          speaker.speaker_id === speakerId
            ? { ...speaker, score: { ...speaker.score, [field]: value } }
            : speaker
        )
      );
    },
    []
  );

  const updateComment = useCallback((speakerId: string, comments: string) => {
    setSpeakers((current) =>
      current.map((speaker) =>
        speaker.speaker_id === speakerId ? { ...speaker, comments } : speaker
      )
    );
  }, []);

  const scoresComplete = useMemo(
    () =>
      speakers.length > 0 &&
      speakers.every(
        (speaker) => validateSpeechScore(speaker.score, speaker.speech_type).length === 0
      ),
    [speakers]
  );

  const teams = useMemo<{ proposition: BallotTeam; opposition: BallotTeam }>(() => {
    const totalFor = (teamId: string) =>
      speakers
        .filter((speaker) => speaker.team_id === teamId)
        .reduce((sum, speaker) => sum + speechTotal(speaker.score, speaker.speech_type), 0);

    return {
      proposition: {
        id: propositionTeam.id,
        name: propositionTeam.name,
        side: "proposition",
        total: totalFor(propositionTeam.id),
      },
      opposition: {
        id: oppositionTeam.id,
        name: oppositionTeam.name,
        side: "opposition",
        total: totalFor(oppositionTeam.id),
      },
    };
  }, [speakers, propositionTeam, oppositionTeam]);

  const blockingReason = useMemo(() => {
    if (!scoresComplete) return "Every speaker needs a valid score.";
    if (!winningTeamId) return "Select the winning team.";
    if (rfd.trim().length < MIN_RFD_LENGTH) {
      return `The reason for decision needs at least ${MIN_RFD_LENGTH} characters.`;
    }

    const winner = winningTeamId === teams.proposition.id ? teams.proposition : teams.opposition;
    const loser = winningTeamId === teams.proposition.id ? teams.opposition : teams.proposition;
    const outcome = validateOutcome(winner.total, loser.total);

    return outcome.valid ? null : outcome.message ?? "The result is not valid.";
  }, [scoresComplete, winningTeamId, rfd, teams]);

  const toSubmission = useCallback(
    () => ({
      winning_team_id: winningTeamId,
      winning_position:
        winningTeamId === teams.proposition.id
          ? ("proposition" as const)
          : ("opposition" as const),
      speaker_scores: speakers.map((speaker) => ({
        speaker_id: speaker.speaker_id,
        team_id: speaker.team_id,
        position: speaker.position,
        speech_type: speaker.speech_type,
        style: speaker.score.style,
        content: speaker.score.content,
        strategy: speaker.score.strategy,
        poi_modifier: speaker.score.poi_modifier ?? 0,
        comments: speaker.comments,
      })),
      rfd,
      notes,
    }),
    [speakers, winningTeamId, teams, rfd, notes]
  );

  return {
    speakers,
    setSpeakers,
    teams,
    winningTeamId,
    setWinningTeamId,
    rfd,
    setRfd,
    notes,
    setNotes,
    updateScore,
    updateComment,
    scoresComplete,
    canSubmit: blockingReason === null,
    blockingReason,
    toSubmission,
  };
}

export { EMPTY_SCORE };
