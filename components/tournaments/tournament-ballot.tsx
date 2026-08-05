"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle,
  CheckSquare, CircleCheck,
  Clock,
  Crown,
  Download,
  Edit3,
  Eye,
  FileText,
  Flag,
  Grid,
  Link2,
  List,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Minus,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  Shield,
  Square,
  Target,
  Timer,
  Users2,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";
import { useGemini } from "@/hooks/use-gemini";
import { speechTotal, rangesFor, validateSpeechScore, validateOutcome, type SpeechScore } from "@/lib/scoring/wsdc";
import { EMPTY_SCORE, MIN_RFD_LENGTH } from "@/components/tournaments/ballot/types";
import { isSupportedFormat } from "@/lib/tournament-formats";
import type {
  ArgumentFlowEntry,
  BallotRecord,
  BallotTournament,
  EnrichedDebate,
  FactCheckEntry,
  PositionsBySpeaker,
  SharedNoteEntry,
  UserRole,
} from "@/components/tournaments/ballot/ballot-types";
import type { BallotSubmission } from "@/components/tournaments/ballot/submission";
import type { SpeakerPosition } from "@/components/tournaments/ballot/types";
import { useAutosave } from "@/components/tournaments/ballot/use-autosave";
import { SaveIndicator } from "@/components/tournaments/ballot/save-indicator";
import { useSpeechTimer } from "@/components/tournaments/ballot/use-speech-timer";
import { clearDraft, loadDraft, saveDraft } from "@/lib/offline/drafts";
import { formatClock } from "@/lib/scoring/speech-timing";
import { cn } from "@/lib/utils";
import { DebateTimer } from "@/components/tournaments/ballot/debate-timer";
import { ArgumentFlow } from "@/components/tournaments/ballot/argument-flow";
import { FactCheckingInterface } from "@/components/tournaments/ballot/fact-checking";
import { CollaborativeNotes } from "@/components/tournaments/ballot/collaborative-notes";
import { SpeakerPositionManager } from "@/components/tournaments/ballot/speaker-position-manager";
import { BallotSkeleton } from "@/components/tournaments/ballot/ballot-skeleton";
import { BallotRow, BallotCard } from "@/components/tournaments/ballot/ballot-list-items";
import { BallotDetailsDialog } from "@/components/tournaments/ballot/ballot-details-dialog";
import { FlagBallotDialog } from "@/components/tournaments/ballot/flag-ballot-dialog";
import { debateStatusColor, debateStatusIcon } from "@/components/tournaments/ballot/debate-status";
import { SCORING_CATEGORIES } from "@/components/tournaments/ballot/scoring-categories";
import { useNames } from "@/components/tournaments/ballot/use-names";
import { useOffline } from "@/hooks/use-offline";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounce } from "@/hooks/use-debounce";

interface TournamentBallotsProps {
  tournament: BallotTournament;
  userRole: UserRole;
  token: string;
  userId?: Id<"users">;
  schoolId?: Id<"schools">;
}






interface JudgingInterfaceProps {
  debate: EnrichedDebate;
  ballot: BallotRecord | null;
  userId: Id<"users">;
  onSubmitBallot: (payload: BallotSubmission) => Promise<void>;
  tournament: BallotTournament;
  token: string;
  userRole: UserRole;
}

function JudgingInterface({ debate, ballot, userId, onSubmitBallot, tournament, token, userRole }: JudgingInterfaceProps) {
  const { validateFeedback, checkBias, isValidating, isBiasChecking } = useGemini();
  const [scores, setScores] = useState<Record<string, SpeechScore>>({});
  const [teamWinner, setTeamWinner] = useState<string>("");
  const [winningPosition, setWinningPosition] = useState<"proposition" | "opposition" | "">("");
  const [notes, setNotes] = useState("");
  const [rfd, setRfd] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [speakerComments, setSpeakerComments] = useState<Record<string, string>>({});
  const [teamComments, setTeamComments] = useState<Record<string, string>>({});
  const [speakerPositions, setSpeakerPositions] = useState<PositionsBySpeaker>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [biasCheckResults, setBiasCheckResults] = useState<Record<string, any>>({});
  const [isMobile, setIsMobile] = useState(false);
  const [argumentFlow, setArgumentFlow] = useState<any[]>(debate.argument_flow || []);
  const [factChecks, setFactChecks] = useState<any[]>(debate.fact_checks || []);
  const [sharedNotes, setSharedNotes] = useState<any[]>(debate.shared_notes || []);
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [selectedJudgeId, setSelectedJudgeId] = useState<string>("");
  const [expandedSpeaker, setExpandedSpeaker] = useState<string | null>(null);

  useEffect(() => {
    if (userRole === "admin" && debate.judges?.length > 0 && !selectedJudgeId) {
      const firstJudge = debate.judges[0];
      setSelectedJudgeId(
        typeof firstJudge === "string" ? firstJudge : firstJudge._id as Id<"users">
      );
    }
  }, [userRole, debate.judges, selectedJudgeId]);

  useEffect(() => {
    if (userRole === "admin" && selectedJudgeId && debate.judges_ballots) {
      const selectedJudgeBallot = debate.judges_ballots.find(
        (jb: any) => jb.judge_id === selectedJudgeId
      )?.ballot;

      if (selectedJudgeBallot) {
        const loadedScores: Record<string, SpeechScore> = {};

        selectedJudgeBallot.speaker_scores?.forEach((score: any) => {
          loadedScores[score.speaker_id] = {
            style: score.style ?? Number.NaN,
            content: score.content ?? Number.NaN,
            strategy: score.strategy ?? Number.NaN,
            poi_modifier: score.poi_modifier ?? 0,
          };
        });

        setScores(loadedScores);
        setTeamWinner(selectedJudgeBallot.winning_team_id || "");
        setWinningPosition(selectedJudgeBallot.winning_position || "");
        setNotes(selectedJudgeBallot.notes || "");
      } else {
        setScores({});
        setSpeakerComments({});
        setTeamWinner("");
        setWinningPosition("");
        setNotes("");
      }
    }
  }, [userRole, selectedJudgeId, debate.judges_ballots]);

  const isHeadJudge = debate.head_judge_id === debate.my_submission?.judge_id;
  const canEdit = ballot?.submission_state !== "submitted";

  const allSpeakers = [
    ...(debate.proposition_team?.members || []),
    ...(debate.opposition_team?.members || [])
  ];

  const speakerNamesQuery = useNames(token, allSpeakers);
  const speakerNamesMap = useMemo(() => {
    if (!speakerNamesQuery) return {};
    const map: Record<string, string> = {};
    speakerNamesQuery.forEach((speaker: any) => {
      map[speaker.id] = speaker.name || `Speaker ${speaker.id.slice(-4)}`;
    });
    return map;
  }, [speakerNamesQuery]);

  const getSpeakerName = (speakerId: string) => {
    return speakerNamesMap[speakerId] || `Speaker ${speakerId.slice(-4)}`;
  };

  const getSelectedTeamSpeakers = () => {
    if (!selectedTeam) return [];
    if (selectedTeam === debate.proposition_team?._id) {
      return debate.proposition_team?.members || [];
    } else if (selectedTeam === debate.opposition_team?._id) {
      return debate.opposition_team?.members || [];
    }
    return [];
  };

  useEffect(() => {
    if (!selectedTeam && debate.proposition_team) {
      setSelectedTeam(debate.proposition_team._id);
    }
  }, [debate, selectedTeam]);

  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth < 768);
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  useEffect(() => {
    if (ballot) {
      const loadedScores: Record<string, SpeechScore> = {};
      ballot.speaker_scores?.forEach((score: any) => {
        loadedScores[score.speaker_id] = {
          style: score.style ?? Number.NaN,
          content: score.content ?? Number.NaN,
          strategy: score.strategy ?? Number.NaN,
          poi_modifier: score.poi_modifier ?? 0,
        };
        setSpeakerComments(prev => ({
          ...prev,
          [score.speaker_id]: score.comments || ""
        }));
      });
      setScores(loadedScores);
      setTeamWinner(ballot.winning_team_id || "");
      setWinningPosition(ballot.winning_position || "");
      setNotes(ballot.notes || "");
    }
  }, [ballot]);

  const updateScore = (speakerId: string, category: keyof SpeechScore, value: number) => {
    if (!canEdit) return;
    setScores(prev => ({
      ...prev,
      [speakerId]: {
        ...(prev[speakerId] ?? EMPTY_SCORE),
        [category]: value,
      }
    }));
  };

  const unsupportedFormat = tournament?.format && !isSupportedFormat(tournament.format)
    ? tournament.format
    : null;

  const submissionBlockedReason = useMemo(() => {
    if (unsupportedFormat) {
      return `Ballots are only available for World Schools tournaments. ${unsupportedFormat} support is coming soon.`;
    }

    const scored = Object.entries(scores);
    if (scored.length === 0) return "Score every speaker before submitting.";

    for (const [speakerId, score] of scored) {
      const speechType = (speakerPositions[speakerId] ?? "first") === "reply"
        ? ("reply" as const)
        : ("substantive" as const);
      const issues = validateSpeechScore(score, speechType);
      if (issues.length > 0) return issues[0].message;
    }

    if (!teamWinner) return "Select the winning team.";
    if (rfd.trim().length < MIN_RFD_LENGTH) {
      return `The reason for decision needs at least ${MIN_RFD_LENGTH} characters.`;
    }

    const totals = new Map<string, number>();
    scored.forEach(([speakerId, score]) => {
      const teamId = debate.proposition_team?.members?.includes(speakerId as Id<"users">)
        ? debate.proposition_team._id
        : debate.opposition_team?._id;
      const speechType = (speakerPositions[speakerId] ?? "first") === "reply"
        ? ("reply" as const)
        : ("substantive" as const);
      if (teamId) totals.set(teamId, (totals.get(teamId) ?? 0) + speechTotal(score, speechType));
    });

    const winnerTotal = totals.get(teamWinner);
    const loserTotal = Array.from(totals.entries()).find(([id]) => id !== teamWinner)?.[1];
    if (winnerTotal === undefined || loserTotal === undefined) return null;

    const outcome = validateOutcome(winnerTotal, loserTotal);
    return outcome.valid ? null : outcome.message ?? null;
  }, [scores, speakerPositions, teamWinner, rfd, debate, unsupportedFormat]);

  const draftPayload = useMemo(
    () => ({
      scores, speakerComments, speakerPositions, teamWinner, rfd, notes,
      argumentFlow, factChecks,
    }),
    [scores, speakerComments, speakerPositions, teamWinner, rfd, notes,
      argumentFlow, factChecks]
  );

  const autosave = useAutosave({
    value: draftPayload,
    enabled: canEdit && (Object.keys(scores).length > 0 || argumentFlow.length > 0),
    onSave: async (payload) => {
      if (userId) {
        await saveDraft(debate._id, userId, payload as Record<string, unknown>);
      }

      await handleSubmit(false, { silent: true });
    },
  });

  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current || !userId || ballot) return;

    restoredRef.current = true;

    void loadDraft(debate._id, userId).then((draft) => {
      if (!draft) return;

      const restored = draft as typeof draftPayload;

      if (restored.scores) setScores(restored.scores);
      if (restored.speakerComments) setSpeakerComments(restored.speakerComments);
      if (restored.speakerPositions) setSpeakerPositions(restored.speakerPositions);
      if (restored.teamWinner) setTeamWinner(restored.teamWinner);
      if (restored.rfd) setRfd(restored.rfd);
      if (restored.notes) setNotes(restored.notes);
      if (restored.argumentFlow?.length) setArgumentFlow(restored.argumentFlow);
      if (restored.factChecks?.length) setFactChecks(restored.factChecks);

      toast.info("Restored your in-progress ballot");
    });
  }, [debate._id, userId, ballot]);

  const speechTypeFor = (speakerId: string) =>
    (speakerPositions[speakerId] ?? "first") === "reply"
      ? ("reply" as const)
      : ("substantive" as const);

  const updateSpeakerComment = (speakerId: string, comment: string) => {
    if (!canEdit) return;
    setSpeakerComments(prev => ({
      ...prev,
      [speakerId]: comment
    }));
  };

  const updateTeamComment = (teamId: string, comment: string) => {
    if (!canEdit) return;
    setTeamComments(prev => ({
      ...prev,
      [teamId]: comment
    }));
  };

  const handleBiasCheck = async (speakerId: string) => {
    const comment = speakerComments[speakerId];
    if (!comment?.trim()) return;

    const result = await checkBias(comment, 'comment');
    setBiasCheckResults(prev => ({
      ...prev,
      [speakerId]: result
    }));
  };

  const handleValidation = async () => {
    const allComments = Object.values(speakerComments).join(" ");
    const result = await validateFeedback(allComments, speakerComments, notes);
    setValidationResult(result);
    return result;
  };

  const handleAddArgument = (argument: any) => {
    setArgumentFlow(prev => [...prev, argument]);
  };

  const handleUpdateArgumentFlow = (newFlow: any[]) => {
    setArgumentFlow(newFlow);
  };

  const handleAddFactCheck = (factCheck: any) => {
    setFactChecks(prev => [...prev, factCheck]);
  };

  const handleUpdateNotes = (note: any) => {
    setSharedNotes(prev => [...prev, note]);
  };

  const handleSubmit = async (isFinal: boolean = false, options: { silent?: boolean } = {}) => {
    if (userRole === "volunteer") {
      const isAssignedJudge = debate.judges?.some((j: any) => (j._id || j) === userId);
      if (!isAssignedJudge) {
        toast.error("You are not assigned to judge this debate");
        return;
      }

      if (ballot?.submission_state === "submitted") {
        toast.error("You have already submitted a final ballot for this debate");
        return;
      }
    } else if (userRole !== "admin") {
      toast.error("You don't have permission to submit ballots");
      return;
    }

    setIsSubmitting(true);

    try {
      const validation = await handleValidation();

      if (!validation.isAppropriate) {
        toast.error("Please review your feedback before submitting", {
          description: validation.issues?.[0] || "Inappropriate content detected",
        });
        setIsSubmitting(false);
        return;
      }

      const speakerScores = Object.entries(scores).map(([speakerId, speechScore]) => {
        const position = speakerPositions[speakerId] ?? "first";
        const biasResult = biasCheckResults[speakerId];

        const teamId = debate.proposition_team?.members.includes(speakerId as Id<"users">)
          ? debate.proposition_team._id
          : debate.opposition_team?._id;

        if (!teamId) {
          throw new Error("Could not determine which team this speaker belongs to.");
        }

        return {
          speaker_id: speakerId as Id<"users">,
          team_id: teamId,
          position,
          speech_type: position === "reply" ? ("reply" as const) : ("substantive" as const),
          style: speechScore.style,
          content: speechScore.content,
          strategy: speechScore.strategy,
          poi_modifier: speechScore.poi_modifier ?? 0,
          comments: speakerComments[speakerId] || "",
          bias_detected: biasResult?.hasBias || false,
          bias_explanation: biasResult?.suggestions?.join("; ") || "",
        };
      });

      if (userRole === "admin") {
        const existingBallot = debate.judges_ballots?.find(
          (jb: any) => jb.judge_id === selectedJudgeId
        )?.ballot;

        if (existingBallot) {

          await onSubmitBallot({
            type: "admin_update",
            ballot_id: existingBallot._id,
            reason: correctionReason.trim() || "Ballot corrected by coordinator",
            updates: {
              winning_team_id: teamWinner as Id<"teams">,
              winning_position: winningPosition as "proposition" | "opposition",
              speaker_scores: speakerScores,
              rfd,
              notes,
            }
          });
        } else {

          await onSubmitBallot({
            type: "admin_submit",
            token,
            debate_id: debate._id,
            judge_id: selectedJudgeId as Id<"users">,
            winning_team_id: teamWinner as Id<"teams">,
            winning_position: winningPosition as "proposition" | "opposition",
            speaker_scores: speakerScores,
            rfd,
            notes,
            is_final_submission: isFinal,
          });
        }
      } else {

        await onSubmitBallot({
          type: "volunteer_submit",
          token,
          debate_id: debate._id,
          winning_team_id: teamWinner as Id<"teams">,
          winning_position: winningPosition as "proposition" | "opposition",
          speaker_scores: speakerScores,
          rfd,
          notes,
          is_final_submission: isFinal,
          fact_checks: factChecks.length > 0 ? factChecks : undefined,
          argument_flow: argumentFlow.length > 0 ? argumentFlow : undefined,
        });
      }

      if (isFinal && userId) {
        await clearDraft(debate._id, userId);
      }

      if (!options.silent) {
        toast.success(isFinal ? "Ballot submitted successfully!" : "Ballot draft saved!");
      }

    } catch (error: any) {
      if (!options.silent) {
        toast.error(error.message || "Failed to submit ballot");
      }
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAvailableTeams = () => {
    const teams = [];
    if (debate.proposition_team && (!debate.is_public_speaking || debate.proposition_team?.members?.length > 0)) {
      teams.push({
        id: debate.proposition_team._id,
        name: debate.proposition_team.name,
        position: "proposition"
      });
    }
    if (debate.opposition_team && (!debate.is_public_speaking || debate.opposition_team?.members?.length > 0)) {
      teams.push({
        id: debate.opposition_team._id,
        name: debate.opposition_team.name,
        position: "opposition"
      });
    }
    return teams;
  };

  const availableTeams = getAvailableTeams();
  const selectedTeamSpeakers = getSelectedTeamSpeakers();
  const selectedTeamData = availableTeams.find(t => t.id === selectedTeam);

  if (isMobile) {
    return (
      <DrawerContent>
        <div className="flex flex-col h-[80vh]">
          <DrawerHeader>
            <DrawerTitle className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                <span className="text-sm">Ballot - {debate.room_name}</span>
                {isHeadJudge && (
                  <Badge variant="default" className="ml-2">
                    <Crown className="h-3 w-3 mr-1" />
                    Head Judge
                  </Badge>
                )}
              </div>
              <DebateTimer debate={debate} token={token} tournament={tournament} onTimeUpdate={() => {}} compact={true} />
            </DrawerTitle>
          </DrawerHeader>

          <div className="flex-1 overflow-hidden">
            <Tabs defaultValue="scoring" className="w-full h-full flex flex-col">
              <div className="px-4 pb-2">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="scoring">Scoring</TabsTrigger>
                  <TabsTrigger value="arguments">Arguments</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                  <TabsTrigger value="winner">Winner</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto px-4">
                <TabsContent value="scoring" className="space-y-4 mt-4">

                  <div className="grid grid-cols-2 gap-2">
                    {availableTeams.map((team) => (
                      <Button
                        key={team.id}
                        variant={selectedTeam === team.id ? "default" : "outline"}
                        onClick={() => setSelectedTeam(team.id)}
                        className="p-3 h-auto"
                      >
                        <div className="text-center">
                          <h4 className="font-medium text-xs mb-1">
                            {team.position === "proposition" ? "Proposition" : "Opposition"}
                          </h4>
                          <p className="font-semibold text-sm">{team.name}</p>
                        </div>
                      </Button>
                    ))}
                  </div>


                  {selectedTeam && selectedTeamData && (
                    <>

                      <SpeakerPositionManager
                        speakers={selectedTeamSpeakers.map((id: string) => ({ id, name: getSpeakerName(id) }))}
                        positions={speakerPositions}
                        onUpdatePositions={setSpeakerPositions}
                        tournament={tournament}
                        debate={debate}
                        teamId={selectedTeam}
                        teamName={selectedTeamData.name}
                      />


                      <Card className="p-3">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Team Feedback - {selectedTeamData.name}</Label>
                          <Textarea
                            placeholder="Overall team performance feedback..."
                            value={teamComments[selectedTeam] || ""}
                            onChange={(e) => updateTeamComment(selectedTeam, e.target.value)}
                            disabled={!canEdit}
                            rows={2}
                            className="text-sm"
                          />
                        </div>
                      </Card>


                      {selectedTeamSpeakers.map((speakerId: string) => {
                        const speakerScores = scores[speakerId] || EMPTY_SCORE;
                        const speechType = (speakerPositions[speakerId] ?? "first") === "reply"
                          ? "reply" as const
                          : "substantive" as const;
                        const finalScore = speechTotal(speakerScores, speechType);
                        const biasResult = biasCheckResults[speakerId];

                        return (
                          <Card key={speakerId} className="p-3">
                            <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                <div>
                                  <h4 className="font-medium text-sm">{getSpeakerName(speakerId)}</h4>
                                  <p className="text-xs text-muted-foreground">{selectedTeamData.name}</p>
                                </div>
                                <div className="text-right">
                                  <div className="font-bold text-primary">{finalScore}</div>
                                  <div className="text-xs text-muted-foreground">out of 30</div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                {SCORING_CATEGORIES.map((category) => {
                                  const CategoryIcon = category.icon;
                                  return (
                                    <div key={category.key} className="space-y-2">
                                      <Label className="text-xs flex items-center gap-1">
                                        <CategoryIcon className={`h-3 w-3 ${category.color}`} />
                                        {category.label.split(' ')[0]}
                                      </Label>
                                      <div className="flex items-center gap-2">
                                        <Input
                                          type="number"
                                          inputMode="decimal"
                                          step={0.5}
                                          min={rangesFor(speechTypeFor(speakerId))[category.key].min}
                                          max={rangesFor(speechTypeFor(speakerId))[category.key].max}
                                          value={Number.isFinite(speakerScores[category.key]) ? speakerScores[category.key] : ""}
                                          onChange={(e) => updateScore(speakerId, category.key, Number.parseFloat(e.target.value))}
                                          disabled={!canEdit}
                                          className="w-20 text-center tabular-nums"
                                        />
                                        <span className="text-xs text-muted-foreground">
                                          /{rangesFor(speechTypeFor(speakerId))[category.key].max}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs">Individual Feedback</Label>
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleBiasCheck(speakerId)}
                                      disabled={!speakerComments[speakerId]?.trim() || isBiasChecking}
                                      className="h-6 px-2"
                                    >
                                      {isBiasChecking ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Shield className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                                <Textarea
                                  placeholder="Individual speaker feedback..."
                                  value={speakerComments[speakerId] || ""}
                                  onChange={(e) => updateSpeakerComment(speakerId, e.target.value)}
                                  disabled={!canEdit}
                                  rows={2}
                                  className="text-sm"
                                />
                                {biasResult && biasResult.hasBias && (
                                  <Alert variant="destructive" className="p-2">
                                    <AlertCircle className="h-3 w-3" />
                                    <AlertDescription className="text-xs">
                                      Potential bias detected. {biasResult.suggestions?.[0]}
                                    </AlertDescription>
                                  </Alert>
                                )}
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="arguments" className="space-y-4 mt-4">
                  <div className="grid gap-4">
                    <ArgumentFlow
                      debate={{ ...debate, argument_flow: argumentFlow }}
                      onAddArgument={handleAddArgument}
                      onUpdateArgumentFlow={handleUpdateArgumentFlow}
                    />
                    <FactCheckingInterface
                      debate={{ ...debate, fact_checks: factChecks }}
                      onAddFactCheck={handleAddFactCheck}
                      userId={userId}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="notes" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <CollaborativeNotes
                      debate={{ ...debate, shared_notes: sharedNotes }}
                      userId={userId}
                      onUpdateNotes={handleUpdateNotes}
                      token={token}
                    />

                    <div className="space-y-2">
                      <Label className="text-base font-medium">Personal Judge Notes</Label>
                      <Textarea
                        placeholder="Additional notes about the debate..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        disabled={!canEdit}
                        rows={4}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="winner" className="space-y-4 mt-4">
                  {userRole === "admin" && debate.judges?.length > 0 && (
                    <Card className="p-4">
                      <div className="space-y-3">
                        <Label className="text-base font-medium">Submitting as Judge</Label>
                        <Select value={selectedJudgeId} onValueChange={setSelectedJudgeId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select judge" />
                          </SelectTrigger>
                          <SelectContent>
                            {debate.judges.map((judge: any) => {
                              const existingBallot = debate.judges_ballots?.find(
                                (jb: any) => jb.judge_id === (judge._id || judge)
                              )?.ballot;
                              return (
                                <SelectItem key={judge._id || judge} value={judge._id || judge}>
                                  <div className="flex items-center gap-2">
                                    <span>{judge.name || `Judge ${(judge._id || judge).slice(-4)}`}</span>
                                    {judge.is_head_judge && <Crown className="h-3 w-3" />}
                                    {existingBallot && (
                                      <Badge variant={existingBallot.submission_state === "submitted" ? "default" : "secondary"} className="text-xs">
                                        {existingBallot.submission_state === "submitted" ? "Final" : "Draft"}
                                      </Badge>
                                    )}
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        {(() => {
                          const selectedJudgeBallot = debate.judges_ballots?.find(
                            (jb: any) => jb.judge_id === selectedJudgeId
                          )?.ballot;
                          return selectedJudgeBallot ? (
                            <Alert>
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription className="text-xs">
                                {selectedJudgeBallot.submission_state === "submitted"
                                  ? "This judge has a final ballot. You can update it."
                                  : "This judge has a draft ballot. You can update it."
                                }
                              </AlertDescription>
                            </Alert>
                          ) : (
                            <Alert>
                              <Plus className="h-4 w-4" />
                              <AlertDescription className="text-xs">
                                No ballot exists for this judge. You can create a new one.
                              </AlertDescription>
                            </Alert>
                          );
                        })()}
                      </div>
                    </Card>
                  )}
                  {canEdit && availableTeams.length > 0 && (
                    <div className="space-y-4">
                      <Label className="text-base font-medium">Select Winning Team</Label>
                      <div className="space-y-3">
                        {availableTeams.map((team) => (
                          <Button
                            key={team.id}
                            variant={teamWinner === team.id ? "default" : "outline"}
                            onClick={() => {
                              setTeamWinner(team.id);
                              setWinningPosition(team.position as "proposition" | "opposition");
                            }}
                            className="w-full p-4 h-auto"
                          >
                            <div className="text-center">
                              <div className="font-medium">{team.name}</div>
                              <div className="text-sm opacity-75 capitalize">{team.position}</div>
                            </div>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  {availableTeams.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                      <p>No teams available for selection</p>
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </div>


          <div className="border-t bg-background p-4 space-y-3">
            {validationResult && !validationResult.isAppropriate && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {validationResult.issues?.[0] || "Please review your feedback for appropriateness"}
                </AlertDescription>
              </Alert>
            )}

            {ballot?.submission_state === "submitted" ? (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Ballot has been submitted and cannot be edited.
                </AlertDescription>
              </Alert>
            ) : canEdit ? (
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => handleSubmit(false)}
                  variant="outline"
                  disabled={isSubmitting || isValidating}
                  className="w-full"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Validating...
                    </>
                  ) : (
                    "Save Draft"
                  )}
                </Button>
                <SaveIndicator status={autosave.status} className="justify-center" />
                <Button
                  onClick={() => handleSubmit(true)}
                  disabled={
                    isSubmitting ||
                    !!submissionBlockedReason ||
                    isValidating ||
                    availableTeams.length === 0 ||
                    (userRole === "volunteer" && !canEdit) ||
                    (userRole === "admin" && !selectedJudgeId)
                  }
                  className="w-full"
                >
                  {isSubmitting ? "Submitting..." : "Submit Final Ballot"}
                </Button>
                {submissionBlockedReason && canEdit && (
                  <p className="text-xs text-muted-foreground text-center">
                    {submissionBlockedReason}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </DrawerContent>
    );
  }
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Ballot - {debate.room_name}
          </CardTitle>
          {isHeadJudge && (
            <Badge variant="default" className="w-fit">
              <Crown className="h-3 w-3 mr-1" />
              Head Judge
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <div className="lg:col-span-2 space-y-6">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableTeams.map((team) => (
                  <Button
                    key={team.id}
                    variant={selectedTeam === team.id ? "default" : "outline"}
                    onClick={() => setSelectedTeam(team.id)}
                    className="p-4 h-auto"
                  >
                    <div className="text-center">
                      <h4 className="font-medium mb-2">
                        {team.position === "proposition" ? "Proposition" : "Opposition"}
                      </h4>
                      <p className="font-semibold">{team.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {team.position === "proposition" ? debate.proposition_team?.school?.name : debate.opposition_team?.school?.name}
                      </p>
                    </div>
                  </Button>
                ))}
              </div>


              {selectedTeam && selectedTeamData && (
                <>

                  <Card className="p-4">
                    <div className="space-y-3">
                      <Label className="text-base font-medium">Team Feedback - {selectedTeamData.name}</Label>
                      <Textarea
                        placeholder="Overall team performance, strategy, and coordination..."
                        value={teamComments[selectedTeam] || ""}
                        onChange={(e) => updateTeamComment(selectedTeam, e.target.value)}
                        disabled={!canEdit}
                        rows={3}
                      />
                    </div>
                  </Card>


                  <div className="space-y-4">
                    <Label className="text-base font-medium">Individual Speaker Scores - {selectedTeamData.name}</Label>

                    {selectedTeamSpeakers.map((speakerId: string) => {
                      const speakerScores = scores[speakerId] || EMPTY_SCORE;
                      const speechType = (speakerPositions[speakerId] ?? "first") === "reply"
                        ? "reply" as const
                        : "substantive" as const;
                      const finalScore = speechTotal(speakerScores, speechType);
                      const biasResult = biasCheckResults[speakerId];
                      const isExpanded = expandedSpeaker === speakerId;

                      return (
                        <Collapsible
                          key={speakerId}
                          open={isExpanded}
                          onOpenChange={(open) => {
                            setExpandedSpeaker(open ? speakerId : null);
                          }}
                        >
                          <Card className="overflow-hidden">
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="ghost"
                                className="w-full p-6 h-auto justify-between hover:bg-muted/50"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-foreground" />
                                )}
                                <div className="flex justify-between items-center w-full">

                                  <div className="text-left">
                                    <h4 className="font-medium">{getSpeakerName(speakerId)}</h4>
                                    <p className="text-sm text-muted-foreground">{selectedTeamData.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Position: {speakerPositions[speakerId] || "Unassigned"}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <div className="text-right">
                                      <div className="text-2xl font-bold text-primary">{finalScore}</div>
                                      <div className="text-sm text-muted-foreground">out of 30</div>
                                      <Progress value={(finalScore / 30) * 100} className="w-16 mt-1" />
                                    </div>
                                  </div>
                                </div>
                              </Button>
                            </CollapsibleTrigger>

                            <CollapsibleContent>
                              <div className="px-6 pb-6 space-y-4 border-t">

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                                  {SCORING_CATEGORIES.map((category) => {
                                    const CategoryIcon = category.icon;
                                    const score = speakerScores[category.key];
                                    return (
                                      <div key={category.key} className="space-y-2">
                                        <Label className="text-sm flex items-center gap-2">
                                          <CategoryIcon className={`h-4 w-4 ${category.color}`} />
                                          {category.label}
                                        </Label>
                                        <div className="space-y-2">
                                          <div className="flex items-center gap-2">
                                            <Input
                                              type="number"
                                              inputMode="decimal"
                                              step={0.5}
                                              min={rangesFor(speechTypeFor(speakerId))[category.key].min}
                                              max={rangesFor(speechTypeFor(speakerId))[category.key].max}
                                              value={Number.isFinite(score) ? score : ""}
                                              onChange={(e) => updateScore(speakerId, category.key, Number.parseFloat(e.target.value))}
                                              disabled={!canEdit}
                                              className="w-20 tabular-nums"
                                            />
                                            <span className="text-sm text-muted-foreground">
                                              / {rangesFor(speechTypeFor(speakerId))[category.key].max}
                                            </span>
                                          </div>
                                          <Progress
                                            value={Number.isFinite(score)
                                              ? (score / rangesFor(speechTypeFor(speakerId))[category.key].max) * 100
                                              : 0}
                                            className="w-full"
                                          />
                                        </div>
                                        <p className="text-xs text-muted-foreground">{category.description}</p>
                                      </div>
                                    );
                                  })}
                                </div>


                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-sm">Individual Speaker Feedback</Label>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleBiasCheck(speakerId)}
                                        disabled={!speakerComments[speakerId]?.trim() || isBiasChecking}
                                        title="Check for bias"
                                      >
                                        {isBiasChecking ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Shield className="h-3 w-3" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                  <Textarea
                                    placeholder="Specific feedback for this speaker's performance..."
                                    value={speakerComments[speakerId] || ""}
                                    onChange={(e) => updateSpeakerComment(speakerId, e.target.value)}
                                    disabled={!canEdit}
                                    rows={3}
                                  />
                                  {biasResult && biasResult.hasBias && (
                                    <Alert variant="destructive">
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertDescription>
                                        <div className="space-y-1">
                                          <p>Potential bias detected</p>
                                          {biasResult.suggestions && (
                                            <ul className="text-sm list-disc list-inside">
                                              {biasResult.suggestions.map((suggestion: string, idx: number) => (
                                                <li key={idx}>{suggestion}</li>
                                              ))}
                                            </ul>
                                          )}
                                        </div>
                                      </AlertDescription>
                                    </Alert>
                                  )}
                                </div>
                              </div>
                            </CollapsibleContent>
                          </Card>
                        </Collapsible>
                      );
                    })}
                  </div>
                </>
              )}


              {canEdit && availableTeams.length > 0 && (
                <div className="space-y-4">
                  <Label className="text-base font-medium">Winning Team</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {availableTeams.map((team) => (
                      <Button
                        key={team.id}
                        variant={teamWinner === team.id ? "default" : "outline"}
                        onClick={() => {
                          setTeamWinner(team.id);
                          setWinningPosition(team.position as "proposition" | "opposition");
                        }}
                        className="p-4 h-auto"
                      >
                        <div className="text-center">
                          <div className="font-medium">{team.name}</div>
                          <div className="text-sm opacity-75 capitalize">{team.position}</div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              )}


              <div className="space-y-2">
                <Label htmlFor="ballot-rfd" className="text-base font-medium">
                  Reason for Decision <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="ballot-rfd"
                  placeholder="Explain the decision: the main clash, which team won it, and why."
                  value={rfd}
                  onChange={(e) => setRfd(e.target.value)}
                  disabled={!canEdit}
                  rows={5}
                  aria-describedby="ballot-rfd-hint"
                />
                <p id="ballot-rfd-hint" className="text-xs text-muted-foreground">
                  {rfd.trim().length >= MIN_RFD_LENGTH
                    ? "Required before submitting"
                    : `${MIN_RFD_LENGTH - rfd.trim().length} more characters needed before you can submit`}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-base font-medium">General Judge Notes</Label>
                <Textarea
                  placeholder="Overall observations about the debate, flow, and general comments..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!canEdit}
                  rows={4}
                />
              </div>
            </div>


            <div className="space-y-4">
              <DebateTimer debate={debate} token={token} tournament={tournament} onTimeUpdate={() => {}} />

              {userRole === "admin" && debate.judges?.length > 0 && (
                <Card className="p-4">
                  <div className="space-y-3">
                    <Label className="text-base font-medium">Submitting as Judge</Label>
                    <Select value={selectedJudgeId} onValueChange={setSelectedJudgeId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select judge" />
                      </SelectTrigger>
                      <SelectContent>
                        {debate.judges.map((judge: any) => {
                          const existingBallot = debate.judges_ballots?.find(
                            (jb: any) => jb.judge_id === (judge._id || judge)
                          )?.ballot;
                          return (
                            <SelectItem key={judge._id || judge} value={judge._id || judge}>
                              <div className="flex items-center gap-2">
                                <span>{judge.name || `Judge ${(judge._id || judge).slice(-4)}`}</span>
                                {judge.is_head_judge && <Crown className="h-3 w-3" />}
                                {existingBallot && (
                                  <Badge variant={existingBallot.submission_state === "submitted" ? "default" : "secondary"} className="text-xs">
                                    {existingBallot.submission_state === "submitted" ? "Final" : "Draft"}
                                  </Badge>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const selectedJudgeBallot = debate.judges_ballots?.find(
                        (jb: any) => jb.judge_id === selectedJudgeId
                      )?.ballot;
                      return selectedJudgeBallot ? (
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            {selectedJudgeBallot.submission_state === "submitted"
                              ? "This judge has a final ballot. You can update it."
                              : "This judge has a draft ballot. You can update it."
                            }
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <Alert>
                          <Plus className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            No ballot exists for this judge. You can create a new one.
                          </AlertDescription>
                        </Alert>
                      );
                    })()}
                  </div>
                </Card>
              )}

              {selectedTeam && selectedTeamData && (
                <SpeakerPositionManager
                  speakers={selectedTeamSpeakers.map((id: string) => ({ id, name: getSpeakerName(id) }))}
                  positions={speakerPositions}
                  onUpdatePositions={setSpeakerPositions}
                  tournament={tournament}
                  debate={debate}
                  teamId={selectedTeam}
                  teamName={selectedTeamData.name}
                />
              )}

              <ArgumentFlow
                debate={{ ...debate, argument_flow: argumentFlow }}
                onAddArgument={handleAddArgument}
                onUpdateArgumentFlow={handleUpdateArgumentFlow}
              />

              <FactCheckingInterface
                debate={{ ...debate, fact_checks: factChecks }}
                onAddFactCheck={handleAddFactCheck}
                userId={userId}
              />

              <CollaborativeNotes
                debate={{ ...debate, shared_notes: sharedNotes }}
                userId={userId}
                onUpdateNotes={handleUpdateNotes}
                token={token}
              />
            </div>
          </div>


          {validationResult && (
            <div className="mt-6">
              {validationResult.isAppropriate ? (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Feedback validation passed. Confidence: {(validationResult.confidence * 100).toFixed(0)}%
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p>Please review your feedback:</p>
                      <ul className="list-disc list-inside text-sm">
                        {validationResult.issues?.map((issue: string, index: number) => (
                          <li key={index}>{issue}</li>
                        ))}
                      </ul>
                      {validationResult.suggestions && validationResult.suggestions.length > 0 && (
                        <div>
                          <p className="font-medium">Suggestions:</p>
                          <ul className="list-disc list-inside text-sm">
                            {validationResult.suggestions.map((suggestion: string, index: number) => (
                              <li key={index}>{suggestion}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}


          {canEdit && (
            <div className="flex gap-2 pt-6 border-t">
              <Button
                onClick={() => handleSubmit(false)}
                variant="outline"
                disabled={isSubmitting || isValidating}
              >
                {isValidating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Validating...
                  </>
                ) : (
                  "Save Draft"
                )}
              </Button>
              <Button
                onClick={() => handleSubmit(true)}
                disabled={
                  isSubmitting ||
                  !!submissionBlockedReason ||
                  isValidating ||
                  availableTeams.length === 0 ||
                  (userRole === "volunteer" && !canEdit) ||
                  (userRole === "admin" && !selectedJudgeId)
                }
                className="w-full"
              >
                {isSubmitting ? "Submitting..." : "Submit Final Ballot"}
              </Button>
              {submissionBlockedReason && canEdit && (
                <p className="text-xs text-muted-foreground text-center">
                  {submissionBlockedReason}
                </p>
              )}
              <Button
                onClick={handleValidation}
                variant="outline"
                disabled={isValidating}
                className="ml-auto"
              >
                <Shield className="h-4 w-4 mr-2" />
                Validate Feedback
              </Button>
            </div>
          )}

          {ballot?.submission_state === "submitted" && (
            <Alert className="mt-6">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Ballot has been submitted and cannot be edited.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function TournamentBallots({
                                            tournament,
                                            userRole,
                                            token,
                                            userId,
                                            schoolId
                                          }: TournamentBallotsProps) {
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedDebate, setSelectedDebate] = useState<any>(null);
  const [showJudgingInterface, setShowJudgingInterface] = useState(false);
  const [judgingDebate, setJudgingDebate] = useState<any>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showFlagDialog, setShowFlagDialog] = useState(false);
  const [flaggingDebate, setFlaggingDebate] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [isMobile, setIsMobile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  let queryFn: any;
  let queryArgs: any;

  if (userRole === "admin") {
    queryFn = api.functions.admin.ballots.getAllTournamentBallots;
    queryArgs = {
      token,
      tournament_id: tournament._id,
      round_number: selectedRound || undefined,
      status_filter: statusFilter !== "all" ? statusFilter as any : undefined,
      search: debouncedSearchQuery || undefined,
    };
  } else if (userRole === "volunteer") {
    queryFn = api.functions.volunteers.ballots.getJudgeAssignedDebates;
    queryArgs = {
      token,
      tournament_id: tournament._id,
      round_number: selectedRound || undefined,
      search: debouncedSearchQuery || undefined,
    };
  } else {
    queryFn = api.functions.ballots.getTournamentBallots;
    queryArgs = {
      token,
      tournament_id: tournament._id,
      round_number: selectedRound || undefined,
      search: debouncedSearchQuery || undefined,
    };
  }

  const {
    results: ballots,
    status,
    loadMore
  } = usePaginatedQuery(
    queryFn,
    queryArgs,
    { initialNumItems: 20 }
  );

  const isLoading = status === "LoadingFirstPage";

  const submitBallot = useMutation(api.functions.volunteers.ballots.submitBallot);
  const submitBallotAdmin = useMutation(api.functions.admin.ballots.submitBallot);
  const updateBallot = useMutation(api.functions.admin.ballots.updateBallot);
  const flagBallotAdmin = useMutation(api.functions.admin.ballots.flagBallotForReview);
  const flagBallotVolunteer = useMutation(api.functions.volunteers.ballots.flagBallot);
  const unflagBallot = useMutation(api.functions.admin.ballots.unflagBallot);

  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth < 768);
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  useEffect(() => {
    if (!isMobile && ballots && ballots.length > 20) {
      setViewMode("table");
    }
  }, [isMobile, ballots]);

  const availableRounds = useMemo(() => {
    const totalRounds = tournament.prelim_rounds + tournament.elimination_rounds;

    return Array.from({ length: totalRounds }, (_, i) => {
      const roundNumber = i + 1;
      const isElim = roundNumber > tournament.prelim_rounds;

      let label = `Round ${roundNumber}`;

      if (isElim) {
        const elimNames = [
          "Round of 64",
          "Round of 32",
          "Round of 16",
          "Octofinals",
          "Quarterfinals",
          "Semifinals",
          "Finals"
        ];

        const elimIndex = roundNumber - tournament.prelim_rounds - 1;
        const nameStartIndex = elimNames.length - tournament.elimination_rounds;

        label = elimNames[nameStartIndex + elimIndex] ?? `Elim Round ${elimIndex + 1}`;
      }

      return {
        value: roundNumber,
        label: label
      };
    });
  }, [tournament.prelim_rounds, tournament.elimination_rounds]);

  const filteredBallots = useMemo(() => {
    if (!ballots) return [];

    let filtered = ballots;

    if (statusFilter !== "all") {
      filtered = filtered.filter((b: any) => b.status === statusFilter);
    }

    return filtered.sort((a: any, b: any) => {
      if (!a.round || !b.round) return 0;
      return a.round.round_number - b.round.round_number;
    });
  }, [ballots, statusFilter]);

  const handleViewDetails = (debate: any) => {
    setSelectedDebate(debate);
    setShowDetailsDialog(true);
  };

  const handleEditBallot = async (debate: any) => {
    if (window.innerWidth < 768) {
      setJudgingDebate(debate);
      setShowJudgingInterface(true);
    } else {
      setJudgingDebate(debate);
      setShowJudgingInterface(true);
    }
  };

  const handleFlagBallot = (debate: any) => {
    setFlaggingDebate(debate);
    setShowFlagDialog(true);
  };

  const handleSubmitFlag = async (debate: any, reason: string, selectedBallotIds: string[]) => {
    try {
      if (userRole === "admin") {
        for (const ballotId of selectedBallotIds) {
          await flagBallotAdmin({
            token,
            ballot_id: ballotId as Id<"judging_scores">,
            reason,
          });
        }

        toast.success(
          selectedBallotIds.length > 1
            ? `${selectedBallotIds.length} ballots flagged successfully`
            : "Ballot flagged successfully"
        );
      } else if (userRole === "volunteer") {
        const ballotId = selectedBallotIds[0];
        if (!ballotId) {
          toast.error("No ballot found to flag");
          return;
        }

        await flagBallotVolunteer({
          token,
          ballot_id: ballotId as Id<"judging_scores">,
          reason,
        });

        toast.success("Ballot flagged successfully");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to flag ballot");
    }
  };

  const handleUnflagBallot = async (debate: any) => {
    try {
      if (userRole !== "admin") {
        toast.error("Only admins can unflag ballots");
        return;
      }

      const flaggedBallots = debate.judges_ballots
        ?.filter((jb: any) =>
          jb.ballot?.notes?.includes("[FLAG:") ||
          jb.ballot?.notes?.includes("[JUDGE FLAG:")
        )
        ?.map((jb: any) => jb.ballot);

      if (!flaggedBallots || flaggedBallots.length === 0) {
        toast.error("No flagged ballots found");
        return;
      }

      if (flaggedBallots.length > 1) {
        const confirmed = window.confirm(
          `Are you sure you want to unflag ${flaggedBallots.length} ballots?`
        );
        if (!confirmed) return;
      }

      for (const ballot of flaggedBallots) {
        await unflagBallot({
          token,
          ballot_id: ballot._id,
        });
      }

      toast.success(
        flaggedBallots.length > 1
          ? `${flaggedBallots.length} ballots unflagged successfully`
          : "Ballot unflagged successfully"
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to unflag ballot");
    }
  };

  const handleSubmitBallot = async (ballotData: any) => {
    try {
      if (ballotData.type === "volunteer_submit") {
        const { type, ...cleanBallot } = ballotData;
        await submitBallot(cleanBallot);
      } else if (ballotData.type === "admin_update") {
        await updateBallot({
          token,
          ballot_id: ballotData.ballot_id,
          reason: ballotData.reason,
          updates: ballotData.updates,
        });
      } else if (ballotData.type === "admin_submit") {
        const { type, ...cleanBallot } = ballotData;
        await submitBallotAdmin(cleanBallot);
      }
      setShowJudgingInterface(false);
      setJudgingDebate(null);
    } catch (error: any) {
      throw error;
    }
  };

  const getStats = () => {
    const total = filteredBallots.length;
    const completed = filteredBallots.filter((b: any) => b.status === "completed").length;
    const inProgress = filteredBallots.filter((b: any) => b.status === "inProgress").length;
    const pending = filteredBallots.filter((b: any) => b.status === "pending").length;
    const flagged = filteredBallots.filter((b: any) => b.has_flagged_ballots).length;

    return { total, completed, inProgress, pending, flagged };
  };

  const stats = getStats();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <BallotSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex bg-brown rounded-t-md flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-3">
          <div>
            <h2 className="text-xl text-white font-bold">Tournament Ballots</h2>
            <div className="flex items-center gap-4 text-xs text-gray-300 flex-wrap">
              <span>{filteredBallots.length} debates</span>
              {userRole === "volunteer" && <span>Your judging assignments</span>}
              {userRole === "admin" && (
                <>
                  <span>
                    {stats.completed} completed • {stats.inProgress} in progress • {stats.pending} pending
                  </span>
                  {stats.flagged > 0 && (
                    <span className="text-red-300 flex items-center gap-1">
                      <Flag className="h-3 w-3" />
                      {stats.flagged} flagged
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {!isMobile && (
              <div className="flex border rounded-md bg-background">
                <Button
                  variant={viewMode === "cards" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("cards")}
                  className="h-8 px-3 rounded-r-none"
                >
                  <Grid className="h-3 w-3" />
                </Button>
                <Button
                  variant={viewMode === "table" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("table")}
                  className="h-8 px-3 rounded-l-none"
                >
                  <List className="h-3 w-3" />
                </Button>
              </div>
            )}

            <Select value={selectedRound?.toString() || "all"} onValueChange={(value) => setSelectedRound(value === "all" ? null : Number(value))}>
              <SelectTrigger className="w-32 h-8 bg-background">
                <SelectValue placeholder="All Rounds" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Rounds</SelectItem>
                {availableRounds.map((round) => (
                  <SelectItem key={round.value} value={round.value.toString()}>
                    {round.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-8 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="inProgress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="noShow">No Show</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search by room, team, or judge..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {filteredBallots.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-2">No ballots found</h3>
              <p className="text-muted-foreground text-center text-sm max-w-sm mx-auto">
                {selectedRound || statusFilter !== "all" || searchQuery
                  ? "Try adjusting your filters to see more results"
                  : userRole === "volunteer"
                    ? "You don't have any judging assignments yet"
                    : "No debates have been created for this tournament yet"
                }
              </p>
            </div>
          ) : (
            <>
              {viewMode === "table" && !isMobile ? (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Debate</TableHead>
                        <TableHead>Teams</TableHead>
                        <TableHead>Judges</TableHead>
                        {userRole === "admin" && <TableHead>Progress</TableHead>}
                        <TableHead className="w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBallots.map((debate: any) => (
                        <BallotRow
                          key={debate._id}
                          debate={debate}
                          userRole={userRole}
                          userId={userId}
                          onViewDetails={handleViewDetails}
                          onEditBallot={handleEditBallot}
                          onFlagBallot={handleFlagBallot}
                          onUnflagBallot={handleUnflagBallot}
                        />
                      ))}
                      {status === "LoadingMore" && (
                        <TableRow>
                          <TableCell colSpan={userRole === "admin" ? 5 : 4} className="text-center py-4">
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Loading more ballots...</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  {status === "CanLoadMore" && (
                    <div className="p-4 text-center border-t">
                      <Button onClick={() => loadMore(20)} variant="outline">
                        <ChevronDown className="h-4 w-4 mr-2" />
                        Load More
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    {filteredBallots.map((debate: any) => (
                      <BallotCard
                        key={debate._id}
                        debate={debate}
                        userRole={userRole}
                        userId={userId}
                        onViewDetails={handleViewDetails}
                        onEditBallot={handleEditBallot}
                        onFlagBallot={handleFlagBallot}
                        onUnflagBallot={handleUnflagBallot}
                      />
                    ))}
                  </div>
                  {status === "LoadingMore" && (
                    <div className="text-center py-4">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading more ballots...</span>
                      </div>
                    </div>
                  )}
                  {status === "CanLoadMore" && (
                    <div className="text-center py-4">
                      <Button onClick={() => loadMore(20)} variant="outline">
                        <ChevronDown className="h-4 w-4 mr-2" />
                        Load More
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {showJudgingInterface && judgingDebate && userId && (
        <>
          {window.innerWidth < 768 ? (
            <Drawer open={showJudgingInterface} onOpenChange={setShowJudgingInterface}>
              <JudgingInterface
                debate={judgingDebate}
                ballot={judgingDebate.my_submission}
                userRole={userRole}
                token={token}
                onSubmitBallot={handleSubmitBallot}
                userId={userId}
                tournament={tournament}
              />
            </Drawer>
          ) : (
            <Dialog open={showJudgingInterface} onOpenChange={setShowJudgingInterface}>
              <DialogContent className="max-w-7xl max-h-[95vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Edit3 className="h-5 w-5" />
                    Judging Interface
                  </DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto max-h-[85vh]">
                  <JudgingInterface
                    debate={judgingDebate}
                    ballot={judgingDebate.my_submission}
                    userRole={userRole}
                    token={token}
                    onSubmitBallot={handleSubmitBallot}
                    userId={userId}
                    tournament={tournament}
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}
        </>
      )}

      <BallotDetailsDialog
        debate={selectedDebate}
        isOpen={showDetailsDialog}
        onClose={() => setShowDetailsDialog(false)}
        userRole={userRole}
        token={token}
      />

      <FlagBallotDialog
        debate={flaggingDebate}
        isOpen={showFlagDialog}
        onClose={() => setShowFlagDialog(false)}
        onFlag={handleSubmitFlag}
        userRole={userRole}
      />
    </div>
  );
}