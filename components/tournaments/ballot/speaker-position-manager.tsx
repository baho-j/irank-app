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

interface SpeakerPositionManagerProps {
  speakers: Array<{ id: string; name: string }>;
  positions: PositionsBySpeaker;
  onUpdatePositions: (positions: PositionsBySpeaker) => void;
  tournament: BallotTournament;
  debate: EnrichedDebate;
  teamId: string;
  teamName: string;
}

export function SpeakerPositionManager({ speakers, positions, onUpdatePositions, tournament, debate, teamId, teamName }: SpeakerPositionManagerProps) {
  const [speakerPositions, setSpeakerPositions] = useState<PositionsBySpeaker>(positions || {});

  const availablePositions = useMemo(() => {

    const wsdcPositions: Array<{ id: SpeakerPosition; label: string }> = [
      { id: "first", label: "1st Speaker" },
      { id: "second", label: "2nd Speaker" },
      { id: "third", label: "3rd Speaker" },
      { id: "reply", label: "Reply Speaker" },
    ];

    return wsdcPositions.slice(0, Math.max(speakers.length, tournament?.team_size ?? 3));
  }, [speakers.length, tournament?.team_size]);

  const handlePositionChange = (speakerId: string, newPosition: SpeakerPosition) => {
    const newPositions: PositionsBySpeaker = { ...speakerPositions };

    const currentSpeakerWithPosition = Object.keys(newPositions).find(
      id => newPositions[id] === newPosition && speakers.some((s) => s.id === id)
    );

    if (currentSpeakerWithPosition) {
      const displaced = speakerPositions[speakerId];
      if (displaced) {
        newPositions[currentSpeakerWithPosition] = displaced;
      } else {
        delete newPositions[currentSpeakerWithPosition];
      }
    }

    newPositions[speakerId] = newPosition;
    setSpeakerPositions(newPositions);
    onUpdatePositions(newPositions);
  };

  return (
    <Card className="p-3">
      <div className="space-y-3">
        <h4 className="font-medium text-sm">{teamName} - Speaker Positions</h4>

        <div className="space-y-2">
          {speakers.map((speaker: any) => (
            <div key={speaker.id} className="flex items-center gap-2 p-2 border rounded text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{speaker.name}</p>
                <p className="text-xs text-muted-foreground">
                  {availablePositions.find(p => p.id === speakerPositions[speaker.id])?.label || "Unassigned"}
                </p>
              </div>

              <Select
                value={speakerPositions[speaker.id] || ""}
                onValueChange={(value) => handlePositionChange(speaker.id, value as SpeakerPosition)}
              >
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Position" />
                </SelectTrigger>
                <SelectContent>
                  {availablePositions.map((position) => (
                    <SelectItem key={position.id} value={position.id}>
                      {position.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

