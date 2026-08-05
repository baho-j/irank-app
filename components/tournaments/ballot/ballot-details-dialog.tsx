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
import { clearDraft, loadDraft, saveDraft } from "@/lib/offline/drafts";
import { formatClock } from "@/lib/scoring/speech-timing";
import { cn } from "@/lib/utils";
import { useOffline } from "@/hooks/use-offline";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounce } from "@/hooks/use-debounce";

import { SCORING_CATEGORIES } from "@/components/tournaments/ballot/scoring-categories";
import { useNames } from "@/components/tournaments/ballot/use-names";
import { debateStatusColor, debateStatusIcon } from "@/components/tournaments/ballot/debate-status";

interface BallotDetailsDialogProps {
  debate: EnrichedDebate | null;
  isOpen: boolean;
  onClose: () => void;
  token: string;
  userRole?: UserRole;
}

export function BallotDetailsDialog({ debate, isOpen, onClose, token }: BallotDetailsDialogProps) {
  const [selectedJudge, setSelectedJudge] = useState<string>("all");
  const [expandedJudge, setExpandedJudge] = useState<string | null>(null);
  const [expandedSpeaker, setExpandedSpeaker] = useState<string | null>(null);

  const allUserIds = useMemo(() => {
    const userIds = new Set<string>();

    if (debate?.judges) {
      debate.judges.forEach((judge: any) => {
        const judgeId = judge._id || judge;
        userIds.add(judgeId);
      });
    }

    if (debate?.judges_ballots) {
      debate.judges_ballots.forEach((judgeBallot: any) => {
        if (judgeBallot.ballot?.speaker_scores) {
          judgeBallot.ballot.speaker_scores.forEach((score: any) => {
            userIds.add(score.speaker_id);
          });
        }
      });
    }

    if (debate?.proposition_team?.members) {
      debate.proposition_team.members.forEach((memberId: string) => {
        userIds.add(memberId);
      });
    }
    if (debate?.opposition_team?.members) {
      debate.opposition_team.members.forEach((memberId: string) => {
        userIds.add(memberId);
      });
    }

    return Array.from(userIds);
  }, [debate]);

  const userNamesQuery = useNames(token, allUserIds);

  const getUserName = (userId: string) => {
    const user = userNamesQuery?.find((u: any) => u.id === userId);
    return user?.name || `User ${userId.slice(-4)}`;
  };

  const getJudgeName = (judgeId: string) => {
    const judge = debate?.judges?.find(
      (j) => (typeof j === "string" ? j : j._id) === judgeId
    );

    if (judge && typeof judge !== "string" && judge.name) return judge.name;

    return getUserName(judgeId);
  };

  const ballotDetails = useMemo(() => {
    if (!debate?.judges_ballots) return [];

    return debate.judges_ballots.map((judgeBallot: any) => {
      if (!judgeBallot.ballot) return null;

      return {
        ...judgeBallot.ballot,
        judge_id: judgeBallot.judge_id,
        judge_name: getJudgeName(judgeBallot.judge_id),
        is_head_judge: debate.head_judge_id === judgeBallot.judge_id,
        is_flagged: judgeBallot.ballot.flagged ?? false,
      };
    }).filter(Boolean);
  }, [debate, userNamesQuery]);

  if (!debate) return null;

  const filteredBallots = selectedJudge === "all"
    ? ballotDetails
    : ballotDetails.filter((b: any) => b.judge_id === selectedJudge);

  const getWinningTeamName = () => {
    if (debate?.winning_team_id === debate?.proposition_team?._id) {
      return debate.proposition_team?.name;
    } else if (debate?.winning_team_id === debate?.opposition_team?._id) {
      return debate.opposition_team?.name;
    }
    return "Unknown";
  };

  const getWinningPosition = () => {
    if (debate?.winning_team_id === debate?.proposition_team?._id) {
      return "proposition";
    } else if (debate?.winning_team_id === debate?.opposition_team?._id) {
      return "opposition";
    }
    return "unknown";
  };

  const groupSpeakerScoresByTeam = (speakerScores: any[]) => {
    const propTeamScores = speakerScores.filter(score =>
      score.team_id === debate?.proposition_team?._id
    );
    const oppTeamScores = speakerScores.filter(score =>
      score.team_id === debate?.opposition_team?._id
    );

    return {
      proposition: propTeamScores,
      opposition: oppTeamScores
    };
  };

  const handleJudgeToggle = (judgeId: string) => {
    if (expandedJudge === judgeId) {
      setExpandedJudge(null);
    } else {
      setExpandedJudge(judgeId);
      setExpandedSpeaker(null); // Reset speaker expansion when changing judges
    }
  };

  const handleSpeakerToggle = (speakerId: string) => {
    if (expandedSpeaker === speakerId) {
      setExpandedSpeaker(null);
    } else {
      setExpandedSpeaker(speakerId);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0 border-b pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg md:text-xl">
            <FileText className="h-4 w-4 md:h-5 md:w-5" />
            <span className="truncate">Ballot Details - {debate?.room_name || "Unknown Debate"}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-4 md:space-y-6 p-4">
            
            {ballotDetails.length > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Label className="text-sm md:text-base flex-shrink-0">View Judge:</Label>
                <Select value={selectedJudge} onValueChange={setSelectedJudge}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Judges</SelectItem>
                    {ballotDetails.map((ballot: any) => (
                      <SelectItem key={ballot.judge_id} value={ballot.judge_id}>
                        {ballot.judge_name}
                        {ballot.is_head_judge && " (Head)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 p-3 md:p-4 bg-muted rounded-lg">
              <div className="text-center">
                <h3 className="font-semibold text-green-700 text-sm md:text-base truncate">{debate?.proposition_team?.name}</h3>
                <p className="text-xs md:text-sm text-muted-foreground">Proposition</p>
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {debate?.proposition_team?.school?.name}
                </div>
                {getWinningPosition() === "proposition" && (
                  <Badge variant="default" className="mt-2 text-xs">
                    <Crown className="h-3 w-3 mr-1" />
                    Winner
                  </Badge>
                )}
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-red-700 text-sm md:text-base truncate">{debate?.opposition_team?.name}</h3>
                <p className="text-xs md:text-sm text-muted-foreground">Opposition</p>
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {debate?.opposition_team?.school?.name}
                </div>
                {getWinningPosition() === "opposition" && (
                  <Badge variant="default" className="mt-2 text-xs">
                    <Crown className="h-3 w-3 mr-1" />
                    Winner
                  </Badge>
                )}
              </div>
            </div>

            
            {(debate?.fact_checks?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base md:text-lg flex items-center gap-2">
                    <Search className="h-4 w-4 md:h-5 md:w-5" />
                    Fact Checks ({(debate.fact_checks?.length ?? 0)})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(debate.fact_checks ?? []).map((check: any, idx: number) => (
                      <div key={idx} className={`p-3 rounded border ${
                        check.result === 'true' ? 'bg-green-50 border-green-200' :
                          check.result === 'false' ? 'bg-red-50 border-red-200' :
                            check.result === 'partially_true' ? 'bg-yellow-50 border-yellow-200' :
                              'bg-gray-50 border-gray-200'
                      }`}>
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
                          <Badge variant="outline" className="capitalize text-xs w-fit">
                            {check.result.replace('_', ' ')}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(check.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm font-medium mb-1 break-words">&#34;{check.claim}&#34;</p>
                        {check.explanation && (
                          <p className="text-sm text-muted-foreground break-words">{check.explanation}</p>
                        )}
                        {check.sources?.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium">Sources:</p>
                            <ul className="text-xs list-disc list-inside">
                              {check.sources.map((source: string, i: number) => (
                                <li key={i} className="break-words">{source}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            
            {(debate?.argument_flow?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base md:text-lg flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 md:h-5 md:w-5" />
                    Argument Flow ({(debate.argument_flow?.length ?? 0)})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(debate.argument_flow ?? []).map((arg: any, idx: number) => (
                      <div key={idx} className={`p-3 rounded border ${
                        arg.type === 'main' ? 'bg-blue-50 border-blue-200' :
                          arg.type === 'rebuttal' ? 'bg-red-50 border-red-200' :
                            'bg-yellow-50 border-yellow-200'
                      }`}>
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
                          <Badge variant="outline" className="capitalize text-xs w-fit">
                            {arg.type} #{idx + 1}
                          </Badge>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            {arg.strength && (
                              <div className="flex">
                                {Array.from({ length: 5 }, (_, i) => (
                                  <div
                                    key={i}
                                    className={`w-2 h-2 rounded-full mx-px ${
                                      i < arg.strength ? 'bg-sky-500' : 'bg-gray-300'
                                    }`}
                                  />
                                ))}
                              </div>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {new Date(arg.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm break-words">{arg.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Speaker {getUserName(arg.speaker)}
                        </p>
                        {arg.rebutted_by?.length > 0 && (
                          <div className="mt-2 pt-2 border-t">
                            <span className="text-xs text-muted-foreground">Links to:</span>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {arg.rebutted_by.map((rebuttal: string, i: number) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  #{parseInt(rebuttal) + 1}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            
            {filteredBallots.map((ballot: any, index: number) => (
              <Collapsible
                key={ballot.judge_id || index}
                open={expandedJudge === ballot.judge_id}
                onOpenChange={() => handleJudgeToggle(ballot.judge_id)}
              >
                <Card>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full p-3 md:p-4 h-auto justify-between hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {expandedJudge === ballot.judge_id ? (
                          <ChevronDown className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 flex-shrink-0" />
                        )}
                        <div className="text-left min-w-0 flex-1">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="font-medium text-sm md:text-base truncate">{ballot.judge_name}</span>
                            <div className="flex flex-wrap gap-1">
                              {ballot.is_head_judge && (
                                <Badge variant="default" className="text-xs">
                                  <Crown className="h-3 w-3 mr-1" />
                                  Head
                                </Badge>
                              )}
                              {ballot.submission_state === "submitted" && (
                                <Badge variant="outline" className="text-green-600 text-xs">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Final
                                </Badge>
                              )}
                              {ballot.is_flagged && (
                                <Badge variant="destructive" className="text-xs">
                                  <Flag className="h-3 w-3 mr-1" />
                                  Flagged
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right min-w-0 flex-shrink-0 ml-2">
                        <div className="text-xs md:text-sm font-medium truncate">
                          {ballot.winning_team_id === debate?.proposition_team?._id
                            ? debate?.proposition_team?.name
                            : ballot.winning_team_id === debate?.opposition_team?._id
                              ? debate?.opposition_team?.name
                              : "No decision"
                          }
                        </div>
                      </div>
                    </Button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-3 md:px-4 pb-3 md:pb-4 space-y-4 border-t">
                      
                      <div className="p-3 bg-muted rounded-lg mt-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <span className="font-medium text-sm md:text-base">Decision:</span>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="font-semibold text-sm md:text-base">
                              {ballot.winning_team_id === debate?.proposition_team?._id
                                ? debate?.proposition_team?.name
                                : ballot.winning_team_id === debate?.opposition_team?._id
                                  ? debate?.opposition_team?.name
                                  : "No decision recorded"
                              }
                            </span>
                            {ballot.winning_position && (
                              <Badge variant="outline" className={`text-xs ${
                                ballot.winning_position === "proposition"
                                  ? "text-green-700 border-green-700"
                                  : "text-red-700 border-red-700"
                              }`}>
                                {ballot.winning_position}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      
                      {ballot.speaker_scores?.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-3 text-sm md:text-base">Speaker Scores</h4>

                          
                          {(() => {
                            const { proposition, opposition } = groupSpeakerScoresByTeam(ballot.speaker_scores);

                            return (
                              <div className="space-y-4">
                                
                                {proposition.length > 0 && (
                                  <div>
                                    <h5 className="font-medium text-green-700 mb-2 flex flex-col sm:flex-row sm:items-center gap-2">
                                      <Badge variant="outline" className="text-green-700 border-green-700 text-xs w-fit">Prop</Badge>
                                      <span className="text-sm md:text-base">{debate?.proposition_team?.name}</span>
                                    </h5>
                                    <div className="space-y-3">
                                      {proposition.map((score: any, scoreIndex: number) => (
                                        <Collapsible
                                          key={`prop-${score.speaker_id}`}
                                          open={expandedSpeaker === score.speaker_id}
                                          onOpenChange={() => handleSpeakerToggle(score.speaker_id)}
                                        >
                                          <Card className="border-green-200">
                                            <CollapsibleTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                className="w-full p-3 md:p-4 h-auto justify-between hover:bg-green-50"
                                              >
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                  {expandedSpeaker === score.speaker_id ? (
                                                    <ChevronDown className="h-4 w-4 flex-shrink-0" />
                                                  ) : (
                                                    <ChevronRight className="h-4 w-4 flex-shrink-0" />
                                                  )}
                                                  <div className="text-left min-w-0 flex-1">
                                                    <h6 className="font-medium text-sm md:text-base truncate">{getUserName(score.speaker_id)}</h6>
                                                    <p className="text-xs md:text-sm text-muted-foreground">{score.position}</p>
                                                  </div>
                                                </div>
                                                <div className="text-right flex-shrink-0 ml-2">
                                                  <div className="text-xl md:text-2xl font-bold text-primary">{score.score}</div>
                                                  <div className="text-xs md:text-sm text-muted-foreground">out of 30</div>
                                                </div>
                                              </Button>
                                            </CollapsibleTrigger>

                                            <CollapsibleContent>
                                              <div className="px-3 md:px-4 pb-3 md:pb-4 space-y-3 border-t">
                                                
                                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                                                  {SCORING_CATEGORIES.map((category) => {
                                                    const CategoryIcon = category.icon;
                                                    const categoryScore = score[category.key] || 0;
                                                    return (
                                                      <div key={category.key} className="text-center">
                                                        <div className="flex items-center justify-center gap-1 mb-1">
                                                          <CategoryIcon className={`h-3 w-3 ${category.color}`} />
                                                          <span className="text-xs font-medium truncate">{category.label.split(' ')[0]}</span>
                                                        </div>
                                                        <div className="text-sm font-bold tabular-nums">{categoryScore}</div>
                                                        <Progress value={(categoryScore / 25) * 100} className="h-1 mt-1" />
                                                      </div>
                                                    );
                                                  })}
                                                </div>

                                                
                                                {score.comments && (
                                                  <div className="pt-3 border-t">
                                                    <Label className="text-xs font-medium">Judge Feedback:</Label>
                                                    <p className="text-sm mt-1 p-2 bg-muted rounded break-words">{score.comments}</p>
                                                  </div>
                                                )}

                                                
                                                {score.bias_detected && (
                                                  <div className="pt-3 border-t">
                                                    <Alert variant="destructive">
                                                      <AlertCircle className="h-4 w-4" />
                                                      <AlertDescription>
                                                        <p className="font-medium">Bias Detected</p>
                                                        {score.bias_explanation && (
                                                          <p className="text-sm mt-1 break-words">{score.bias_explanation}</p>
                                                        )}
                                                      </AlertDescription>
                                                    </Alert>
                                                  </div>
                                                )}
                                              </div>
                                            </CollapsibleContent>
                                          </Card>
                                        </Collapsible>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                
                                {opposition.length > 0 && (
                                  <div>
                                    <h5 className="font-medium text-red-700 mb-2 flex flex-col sm:flex-row sm:items-center gap-2">
                                      <Badge variant="outline" className="text-red-700 border-red-700 text-xs w-fit">Opp</Badge>
                                      <span className="text-sm md:text-base">{debate?.opposition_team?.name}</span>
                                    </h5>
                                    <div className="space-y-3">
                                      {opposition.map((score: any, scoreIndex: number) => (
                                        <Collapsible
                                          key={`opp-${score.speaker_id}`}
                                          open={expandedSpeaker === score.speaker_id}
                                          onOpenChange={() => handleSpeakerToggle(score.speaker_id)}
                                        >
                                          <Card className="border-red-200">
                                            <CollapsibleTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                className="w-full p-3 md:p-4 h-auto justify-between hover:bg-red-50"
                                              >
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                  {expandedSpeaker === score.speaker_id ? (
                                                    <ChevronDown className="h-4 w-4 flex-shrink-0" />
                                                  ) : (
                                                    <ChevronRight className="h-4 w-4 flex-shrink-0" />
                                                  )}
                                                  <div className="text-left min-w-0 flex-1">
                                                    <h6 className="font-medium text-sm md:text-base truncate">{getUserName(score.speaker_id)}</h6>
                                                    <p className="text-xs md:text-sm text-muted-foreground">{score.position}</p>
                                                  </div>
                                                </div>
                                                <div className="text-right flex-shrink-0 ml-2">
                                                  <div className="text-xl md:text-2xl font-bold text-primary">{score.score}</div>
                                                  <div className="text-xs md:text-sm text-muted-foreground">out of 30</div>
                                                </div>
                                              </Button>
                                            </CollapsibleTrigger>

                                            <CollapsibleContent>
                                              <div className="px-3 md:px-4 pb-3 md:pb-4 space-y-3 border-t">
                                                
                                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                                                  {SCORING_CATEGORIES.map((category) => {
                                                    const CategoryIcon = category.icon;
                                                    const categoryScore = score[category.key] || 0;
                                                    return (
                                                      <div key={category.key} className="text-center">
                                                        <div className="flex items-center justify-center gap-1 mb-1">
                                                          <CategoryIcon className={`h-3 w-3 ${category.color}`} />
                                                          <span className="text-xs font-medium truncate">{category.label.split(' ')[0]}</span>
                                                        </div>
                                                        <div className="text-sm font-bold tabular-nums">{categoryScore}</div>
                                                        <Progress value={(categoryScore / 25) * 100} className="h-1 mt-1" />
                                                      </div>
                                                    );
                                                  })}
                                                </div>

                                                
                                                {score.comments && (
                                                  <div className="pt-3 border-t">
                                                    <Label className="text-xs font-medium">Judge Feedback:</Label>
                                                    <p className="text-sm mt-1 p-2 bg-muted rounded break-words">{score.comments}</p>
                                                  </div>
                                                )}

                                                
                                                {score.bias_detected && (
                                                  <div className="pt-3 border-t">
                                                    <Alert variant="destructive">
                                                      <AlertCircle className="h-4 w-4" />
                                                      <AlertDescription>
                                                        <p className="font-medium">Bias Detected</p>
                                                        {score.bias_explanation && (
                                                          <p className="text-sm mt-1 break-words">{score.bias_explanation}</p>
                                                        )}
                                                      </AlertDescription>
                                                    </Alert>
                                                  </div>
                                                )}
                                              </div>
                                            </CollapsibleContent>
                                          </Card>
                                        </Collapsible>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      
                      {ballot.notes && (
                        <div className="pt-3 border-t">
                          <Label className="text-sm font-medium">Judge Notes:</Label>
                          <p className="text-sm mt-1 p-3 bg-muted rounded break-words">{ballot.notes}</p>
                        </div>
                      )}

                      
                      <div className="text-xs text-muted-foreground pt-2 border-t flex flex-col sm:flex-row sm:justify-between gap-2">
                        <span>
                          Submitted: {ballot.submitted_at ? new Date(ballot.submitted_at).toLocaleString() : "Not submitted"}
                        </span>
                        {ballot.submission_state === "submitted" && (
                          <span className="text-green-600 font-medium">Final Submission</span>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}

            
            {filteredBallots.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No ballot details available</p>
                {selectedJudge !== "all" && (
                  <p className="text-sm">This judge hasn&#39;t submitted a ballot yet</p>
                )}
              </div>
            )}

            
            {(debate?.shared_notes?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base md:text-lg flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 md:h-5 md:w-5" />
                    Shared Notes ({debate.shared_notes?.length ?? 0})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(debate.shared_notes ?? []).map((note: any, idx: number) => (
                      <div key={idx} className="p-3 bg-muted rounded-lg">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
                          <span className="font-medium text-sm">{getUserName(note.author)}</span>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <Badge variant="outline" className="text-xs w-fit">
                              {note.visibility}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(note.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm break-words">{note.content}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


