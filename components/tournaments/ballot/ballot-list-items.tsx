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

interface BallotListItemProps {
  debate: EnrichedDebate;
  userRole: UserRole;
  userId?: Id<"users">;
  onViewDetails: (debate: EnrichedDebate) => void;
  onEditBallot: (debate: EnrichedDebate) => void;
  onFlagBallot: (debate: EnrichedDebate) => void;
  onUnflagBallot: (debate: EnrichedDebate) => void;
}

export function BallotRow({ debate, userRole, userId, onViewDetails, onEditBallot, onFlagBallot, onUnflagBallot }: BallotListItemProps) {
  const StatusIcon = debateStatusIcon(debate.status);
  const canEdit = userRole === "admin" || (userRole === "volunteer" && debate.judges?.some((j: any) => j._id === userId));
  const canSeeDetails = debate.can_see_full_details || userRole === "admin" || userRole === "volunteer";
  const canFlag = userRole === "admin" || (userRole === "volunteer" && debate.judges?.some((j: any) => j._id === userId));
  const hasFlaggedBallots = debate.has_flagged_ballots || debate.judges?.some((j: any) => j.is_flagged);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth < 768);
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  const handleEditClick = () => {
    if (isMobile) {
      onEditBallot(debate);
    } else {
      onEditBallot(debate);
    }
  };

  return (
    <TableRow className="hover:bg-muted/50">
      <TableCell>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{debate.room_name}</span>
            <Badge variant="secondary" className={debateStatusColor(debate.status)}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {debate.status}
            </Badge>
            {hasFlaggedBallots && (
              <Badge variant="destructive" className="gap-1">
                <Flag className="h-3 w-3" />
                Flagged
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            Round {debate.round?.round_number} • {debate.round?.type}
          </div>
        </div>
      </TableCell>

      <TableCell>
        <div className="space-y-2">
          {debate.proposition_team && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-green-700 border-green-700 text-xs">Prop</Badge>
              <span className="text-sm">{debate.proposition_team.name}</span>
              {debate.winning_team_id === debate.proposition_team._id && (
                <Crown className="h-3 w-3 text-yellow-500" />
              )}
            </div>
          )}
          {debate.opposition_team && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-red-700 border-red-700 text-xs">Opp</Badge>
              <span className="text-sm">{debate.opposition_team.name}</span>
              {debate.winning_team_id === debate.opposition_team._id && (
                <Crown className="h-3 w-3 text-yellow-500" />
              )}
            </div>
          )}
        </div>
      </TableCell>

      <TableCell>
        <div className="flex flex-wrap gap-1">
          {debate.judges?.slice(0, 3).map((judge: any) => (
            <Badge
              key={judge._id}
              variant={judge.is_head_judge ? "default" : "outline"}
              className={`text-xs ${judge.is_flagged ? 'border-red-500 text-red-600' : ''}`}
            >
              {judge.name?.split(' ')[0] || `J${judge._id.slice(-3)}`}
              {judge.is_head_judge && <Crown className="h-2 w-2 ml-1" />}
              {userRole === "admin" && (
                <div className="ml-1">
                  {judge.is_final ? (
                    <CheckCircle className="h-2 w-2 text-green-500" />
                  ) : judge.has_submitted ? (
                    <Clock className="h-2 w-2 text-yellow-500" />
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-gray-300" />
                  )}
                </div>
              )}
            </Badge>
          ))}
          {debate.judges?.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{debate.judges.length - 3}
            </Badge>
          )}
        </div>
      </TableCell>

      <TableCell>
        {userRole === "admin" && debate.judges?.length > 0 && (
          <div className="space-y-1">
            <div className="text-sm">
              {debate.final_submissions_count || 0}/{debate.judges.length}
            </div>
            <Progress
              value={debate.judges.length > 0 ? (debate.final_submissions_count || 0) / debate.judges.length * 100 : 0}
              className="w-16 h-1"
            />
          </div>
        )}
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-1">
          {debate.recording && (
            <Button variant="ghost" size="sm" title="Download Recording" className="h-6 w-6 p-0">
              <Download className="h-3 w-3" />
            </Button>
          )}
          {canFlag && debate.status !== "pending" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFlagBallot(debate)}
              title="Flag Ballot"
              className={`h-6 w-6 p-0 ${hasFlaggedBallots ? "text-red-600" : ""}`}
            >
              <Flag className="h-3 w-3" />
            </Button>
          )}
          {userRole === "admin" && hasFlaggedBallots && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUnflagBallot(debate)}
              title="Unflag Ballot"
              className="h-6 w-6 p-0 text-green-600"
            >
              <CheckCircle className="h-3 w-3" />
            </Button>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEditClick}
              title="Edit Ballot"
              className="h-6 w-6 p-0"
            >
              <Edit3 className="h-3 w-3" />
            </Button>
          )}
          {canSeeDetails && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewDetails(debate)}
              title="View Details"
              className="h-6 w-6 p-0"
            >
              <Eye className="h-3 w-3" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function BallotCard({ debate, userRole, userId, onViewDetails, onEditBallot, onFlagBallot, onUnflagBallot }: BallotListItemProps) {
  const StatusIcon = debateStatusIcon(debate.status);
  const canEdit = userRole === "admin" || (userRole === "volunteer" && debate.judges?.some((j: any) => j._id === userId));
  const canSeeDetails = debate.can_see_full_details || userRole === "admin" || userRole === "volunteer";
  const canFlag = userRole === "admin" || (userRole === "volunteer" && debate.judges?.some((j: any) => j._id === userId));
  const hasFlaggedBallots = debate.has_flagged_ballots || debate.judges?.some((j: any) => j.is_flagged);
  const submissionProgress = debate.judges?.length > 0 ? (debate.final_submissions_count || 0) / debate.judges.length * 100 : 0;
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth < 768);
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  const handleEditClick = () => {
    if (isMobile) {
      onEditBallot(debate);
    } else {
      onEditBallot(debate);
    }
  };

  return (
    <Card className="hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">{debate.room_name}</CardTitle>
            <Badge variant="secondary" className={debateStatusColor(debate.status)}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {debate.status}
            </Badge>
            {hasFlaggedBallots && (
              <Badge variant="destructive" className="gap-1">
                <Flag className="h-3 w-3" />
                Flagged
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {debate.recording && (
              <Button variant="ghost" size="sm" title="Download Recording">
                <Download className="h-4 w-4" />
              </Button>
            )}
            {canFlag && debate.status !== "pending" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onFlagBallot(debate)}
                title="Flag Ballot"
                className={hasFlaggedBallots ? "text-red-600" : ""}
              >
                <Flag className="h-4 w-4" />
              </Button>
            )}
            {userRole === "admin" && hasFlaggedBallots && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onUnflagBallot(debate)}
                title="Unflag Ballot"
                className="text-green-600"
              >
                <CheckCircle className="h-4 w-4" />
              </Button>
            )}
            {canEdit && (
              <Button variant="ghost" size="sm" onClick={handleEditClick} title="Edit Ballot">
                <Edit3 className="h-4 w-4" />
              </Button>
            )}
            {canSeeDetails && (
              <Button variant="ghost" size="sm" onClick={() => onViewDetails(debate)} title="View Details">
                <Eye className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {debate.proposition_team && (
            <div className="flex items-center gap-2">
              {debate.winning_team_id === debate.proposition_team._id && (
                <Crown className="h-4 w-4 text-yellow-500" />
              )}
              <Badge variant="outline" className="text-green-700 border-green-700">Prop</Badge>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{debate.proposition_team.name}</p>
                {debate.proposition_team.school && (
                  <p className="text-xs text-muted-foreground truncate">
                    {debate.proposition_team.school.name}
                  </p>
                )}
              </div>
            </div>
          )}

          {debate.opposition_team && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-red-700 border-red-700">Opp</Badge>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{debate.opposition_team.name}</p>
                {debate.opposition_team.school && (
                  <p className="text-xs text-muted-foreground truncate">
                    {debate.opposition_team.school.name}
                  </p>
                )}
              </div>
              {debate.winning_team_id === debate.opposition_team._id && (
                <Crown className="h-4 w-4 text-yellow-500" />
              )}
            </div>
          )}
        </div>

        <Separator />


        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Judges ({debate.judges?.length || 0})
            </span>
            {userRole === "admin" && (
              <div className="text-xs text-muted-foreground">
                {submissionProgress.toFixed(0)}% submitted
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {debate.judges?.map((judge: any) => (
              <Badge
                key={judge._id}
                variant={judge.is_head_judge ? "default" : "outline"}
                className={`gap-1 ${judge.is_flagged ? 'border-red-500 text-red-600' : ''}`}
              >
                {judge.name?.split(' ')[0] || `Judge ${judge._id.slice(-3)}`}
                {judge.is_head_judge && <Crown className="h-3 w-3" />}
                {judge.is_flagged && <Flag className="h-3 w-3" />}
                {userRole === "admin" && (
                  <div className="ml-1">
                    {judge.is_final ? (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    ) : judge.has_submitted ? (
                      <Clock className="h-3 w-3 text-yellow-500" />
                    ) : (
                      <div className="h-3 w-3 rounded-full bg-gray-300" />
                    )}
                  </div>
                )}
              </Badge>
            ))}
          </div>
        </div>


        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Round {debate.round?.round_number}</span>
          <span>{debate.round?.type}</span>
        </div>


        {userRole === "admin" && debate.judges?.length > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>Submission Progress</span>
              <span>{debate.final_submissions_count || 0}/{debate.judges.length}</span>
            </div>
            <Progress value={submissionProgress} className="w-full h-2" />
          </div>
        )}


        {debate.winning_team_id && canSeeDetails && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Result:</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {debate.winning_team_id === debate.proposition_team?._id
                    ? debate.proposition_team.name
                    : debate.opposition_team?.name
                  } wins
                </span>
              </div>
            </div>
          </div>
        )}


        {((debate.fact_checks?.length ?? 0) > 0 || (debate.argument_flow?.length ?? 0) > 0) && canSeeDetails && (
          <div className="pt-2 border-t">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {(debate.fact_checks?.length ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <Search className="h-3 w-3" />
                  {(debate.fact_checks?.length ?? 0)} fact checks
                </span>
              )}
              {(debate.argument_flow?.length ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <BarChart3 className="h-3 w-3" />
                  {(debate.argument_flow?.length ?? 0)} arguments
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

