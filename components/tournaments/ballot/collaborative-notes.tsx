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

interface CollaborativeNotesProps {
  debate: EnrichedDebate;
  userId: Id<"users">;
  onUpdateNotes: (note: SharedNoteEntry) => void;
  token: string;
}

export function CollaborativeNotes({ debate, userId, onUpdateNotes, token }: CollaborativeNotesProps) {
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<"private" | "judges" | "all">("judges");
  const userNames = useNames(token, [userId]);

  const existingNotes = debate.shared_notes || [];

  const handleSaveNote = () => {
    if (!notes.trim()) return;
    const nameEntry = userNames?.find((entry) => entry.id === userId);
    const fullName = nameEntry?.name ?? "Judge";
    const userName = fullName.trim().split(" ")[0];

    const newNote = {
      content: notes,
      author: userId,
      name: userName,
      timestamp: Date.now(),
      visibility,
    };

    onUpdateNotes(newNote);
    setNotes("");
    toast.success("Note added successfully");
  };

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Collaborative Notes
          </h4>
          <Select value={visibility} onValueChange={(value: any) => setVisibility(value)}>
            <SelectTrigger className="w-20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="judges">Judges</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="h-32">
          <div className="space-y-2">
            {existingNotes.map((note: any, index: number) => (
              <div key={index} className="p-2 bg-muted rounded text-sm">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-sm">Judge {note.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {note.visibility}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(note.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
                <p className="text-xs">{note.content}</p>
              </div>
            ))}
            {existingNotes.length === 0 && (
              <div className="text-center text-muted-foreground text-xs py-4">
                No notes yet. Add the first note below.
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Textarea
              placeholder="Add a note..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="flex-1"
            />
            <Button
              onClick={handleSaveNote}
              size="sm"
              disabled={!notes.trim()}
              className="self-end"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

