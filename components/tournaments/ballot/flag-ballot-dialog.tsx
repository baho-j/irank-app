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

interface FlagBallotDialogProps {
  debate: EnrichedDebate | null;
  isOpen: boolean;
  onClose: () => void;
  onFlag: (debate: EnrichedDebate, reason: string, ballotIds: string[]) => Promise<void>;
  userRole: UserRole;
}

export function FlagBallotDialog({ debate, isOpen, onClose, onFlag, userRole }: FlagBallotDialogProps) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBallots, setSelectedBallots] = useState<string[]>([]);

  const availableBallots = useMemo(() => {
    if (userRole === "admin") {

      return debate?.judges_ballots
        ?.filter((jb: any) => jb.ballot?.submission_state === "submitted")
        ?.map((jb: any) => ({
          id: jb.ballot._id,
          judgeName: jb.judge_name || `Judge ${jb.judge_id.slice(-4)}`,
          isHeadJudge: debate.head_judge_id === jb.judge_id,
          isAlreadyFlagged: jb.ballot.flagged ?? false,
          ballot: jb.ballot
        })) || [];
    } else {

      return debate?.my_submission ? [{
        id: debate.my_submission._id,
        judgeName: "Your Ballot",
        isHeadJudge: debate.head_judge_id === debate.my_submission.judge_id,
        isAlreadyFlagged: debate.my_submission.notes?.includes("[FLAG:") || debate.my_submission.notes?.includes("[JUDGE FLAG:"),
        ballot: debate.my_submission
      }] : [];
    }
  }, [debate, userRole]);

  useEffect(() => {
    if (isOpen && availableBallots.length > 0) {
      if (userRole === "volunteer") {
        setSelectedBallots([availableBallots[0].id]);
      } else {

        const unflaggedBallots = availableBallots
          .filter((ballot: { isAlreadyFlagged: any; }) => !ballot.isAlreadyFlagged)
          .map((ballot: { id: any; }) => ballot.id);
        setSelectedBallots(unflaggedBallots);
      }
    }
  }, [isOpen, availableBallots, userRole]);

  const handleBallotToggle = (ballotId: string, checked: boolean) => {
    if (checked) {
      setSelectedBallots(prev => [...prev, ballotId]);
    } else {
      setSelectedBallots(prev => prev.filter(id => id !== ballotId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedBallots(availableBallots.map((ballot: { id: any; }) => ballot.id));
    } else {
      setSelectedBallots([]);
    }
  };

  const handleFlag = async () => {
    if (!reason.trim() || selectedBallots.length === 0) return;

    setIsSubmitting(true);
    try {
      if (!debate) return;
      await onFlag(debate, reason, selectedBallots);
      setReason("");
      setSelectedBallots([]);
      onClose();
    } catch (error) {
      console.error("Failed to flag ballot:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const flaggableBallots = availableBallots.filter((ballot: { isAlreadyFlagged: any; }) => !ballot.isAlreadyFlagged);
  const alreadyFlaggedCount = availableBallots.length - flaggableBallots.length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            Flag Ballot - {debate?.room_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {userRole === "admin" && availableBallots.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Select Ballots to Flag:</Label>
                {flaggableBallots.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectAll(selectedBallots.length !== flaggableBallots.length)}
                    className="h-auto p-1 text-xs"
                  >
                    {selectedBallots.length === flaggableBallots.length ? "Deselect All" : "Select All"}
                  </Button>
                )}
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto">
                {availableBallots.map((ballot: any) => (
                  <div
                    key={ballot.id}
                    className={`flex items-center space-x-3 p-2 border rounded ${
                      ballot.isAlreadyFlagged ? 'border-red-200 bg-red-50' : 'border-border'
                    }`}
                  >
                    <Checkbox
                      id={`ballot-${ballot.id}`}
                      checked={selectedBallots.includes(ballot.id)}
                      onCheckedChange={(checked) => handleBallotToggle(ballot.id, !!checked)}
                      disabled={ballot.isAlreadyFlagged}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor={`ballot-${ballot.id}`}
                          className={`text-sm font-medium cursor-pointer ${
                            ballot.isAlreadyFlagged ? 'text-muted-foreground' : ''
                          }`}
                        >
                          {ballot.judgeName}
                        </label>
                        {ballot.isHeadJudge && (
                          <Badge variant="default" className="gap-1">
                            <Crown className="h-3 w-3" />
                            Head
                          </Badge>
                        )}
                      </div>

                      {ballot.isAlreadyFlagged && (
                        <div className="text-xs text-red-600 mt-1">
                          Already flagged
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {alreadyFlaggedCount > 0 && (
                <div className="text-xs text-muted-foreground">
                  {alreadyFlaggedCount} ballot{alreadyFlaggedCount > 1 ? 's' : ''} already flagged
                </div>
              )}

              {flaggableBallots.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  <Flag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">All ballots are already flagged</p>
                </div>
              )}
            </div>
          )}


          {userRole === "volunteer" && availableBallots.length > 0 && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4" />
                <span className="text-sm font-medium">Flagging your ballot</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                This will flag your ballot for admin review
              </p>
            </div>
          )}


          {availableBallots.length === 0 && (
            <div className="text-center py-4 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No ballots available to flag</p>
              <p className="text-xs">
                {userRole === "admin"
                  ? "No submitted ballots found for this debate"
                  : "You haven't submitted a ballot for this debate yet"
                }
              </p>
            </div>
          )}

          <div>
            <Label>Reason for flagging:</Label>
            <Textarea
              placeholder="Describe the issue with the ballot(s)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              disabled={availableBallots.length === 0}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleFlag}
              disabled={
                !reason.trim() ||
                selectedBallots.length === 0 ||
                isSubmitting ||
                availableBallots.length === 0
              }
              variant="destructive"
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Flagging...
                </>
              ) : (
                <>
                  <Flag className="h-4 w-4 mr-2" />
                  Flag {selectedBallots.length > 1 ? `${selectedBallots.length} Ballots` : 'Ballot'}
                </>
              )}
            </Button>
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

