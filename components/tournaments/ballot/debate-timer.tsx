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
import { useSpeechTimer } from "@/components/tournaments/ballot/use-speech-timer";

interface DebateTimerProps {
  debate: EnrichedDebate;
  token: string;
  tournament?: BallotTournament;
  position?: SpeakerPosition;
  onUpdateDebate?: (debate: EnrichedDebate) => void;
  onTimeUpdate?: (seconds: number) => void;
  compact?: boolean;
}

export function DebateTimer({ debate, token, tournament, position = "first", onUpdateDebate, compact = false }: DebateTimerProps) {
  const timer = useSpeechTimer({
    speakingTimes: tournament?.speaking_times,
    position,
  });
  const { elapsed: currentTime, isRunning } = timer;
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const getFileUrl = useMutation(api.files.getUrl);
  const updateDebateRecording = useMutation(api.functions.ballots.updateRecording);

  useEffect(() => {
    let recordingInterval: NodeJS.Timeout;
    if (isRecording) {
      recordingInterval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(recordingInterval);
  }, [isRecording]);

  useEffect(() => {
    const loadRecordingUrl = async () => {
      if (debate.recording && !audioUrl) {
        try {
          const url = await getFileUrl({ storageId: debate.recording });
          setAudioUrl(url);
        } catch (error) {
          console.error('Error loading recording:', error);
        }
      }
    };

    loadRecordingUrl();
  }, [debate.recording, audioUrl, getFileUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });

      // Held locally rather than in state: the buffer is only read when the
      // recorder stops, and state must not be mutated in place.
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: recorder.mimeType });
        await uploadRecording(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start(1000);
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingDuration(0);

      toast.success("Recording started");
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error("Failed to start recording. Please check microphone permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setIsRecording(false);
      toast.success("Recording stopped. Uploading...");
    }
  };

  const uploadRecording = async (audioBlob: Blob) => {
    setIsUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();

      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": audioBlob.type },
        body: audioBlob,
      });

      if (!result.ok) {
        throw new Error("Upload failed");
      }

      const { storageId } = await result.json();

      await updateDebateRecording({
        token,
        debate_id: debate._id,
        recording_id: storageId,
        duration: recordingDuration,
      });

      const url = await getFileUrl({ storageId });
      setAudioUrl(url);

      toast.success("Recording uploaded successfully!");

      if (onUpdateDebate) {
        onUpdateDebate({
          ...debate,
          recording: storageId,
          recording_duration: recordingDuration
        });
      }
    } catch (error) {
      console.error('Error uploading recording:', error);
      toast.error("Failed to upload recording");
    } finally {
      setIsUploading(false);
    }
  };

  const playRecording = () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play();
      setIsPlaying(true);

      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => {
        setIsPlaying(false);
        toast.error("Failed to play recording");
      };
    }
  };

  const downloadRecording = () => {
    if (audioUrl) {
      const link = document.createElement('a');
      link.href = audioUrl;
      link.download = `debate-${debate.room_name}-recording.webm`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "text-sm font-mono font-bold tabular-nums",
            timer.isOvertime && "text-destructive",
            timer.phase === "grace" && "text-amber-600"
          )}
        >
          {timer.display}
        </div>

        <div className="flex gap-1">
          <Button
            onClick={timer.toggle}
            variant={isRunning ? "destructive" : "default"}
            size="sm"
            className="h-5 w-5 p-0"
          >
            {isRunning ? <Pause className="h-2 w-2" /> : <Play className="h-2 w-2" />}
          </Button>

          <Button
            onClick={timer.reset}
            variant="outline"
            size="sm"
            className="h-5 w-5 p-0"
          >
            <Square className="h-2 w-2" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="p-4">
      <div className="text-center space-y-4">
        <div
          className={cn(
            "text-2xl md:text-3xl font-bold font-mono tabular-nums",
            timer.isOvertime && "text-destructive",
            timer.phase === "grace" && "text-amber-600"
          )}
        >
          {timer.display}
        </div>

        <div className="space-y-1">
          <Progress value={timer.progress} className="w-full" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{timer.phaseLabel}</span>
            <span className="tabular-nums">
              {timer.isOvertime ? "over" : `${timer.remainingDisplay} left`}
            </span>
          </div>
        </div>

        <div className="flex justify-center gap-2 flex-wrap">
          <Button
            onClick={timer.toggle}
            variant={isRunning ? "destructive" : "default"}
            size="sm"
          >
            {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>

          <Button
            onClick={timer.reset}
            variant="outline"
            size="sm"
          >
            <Square className="h-4 w-4" />
          </Button>

          <Button
            onClick={isRecording ? stopRecording : startRecording}
            variant={isRecording ? "destructive" : "outline"}
            disabled={isUploading}
            size="sm"
          >
            {isUploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="text-sm text-muted-foreground space-y-1">

          {isRecording && (
            <div className="text-red-600 font-medium flex items-center justify-center gap-1">
              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
              Recording: {formatClock(recordingDuration)}
            </div>
          )}

          {debate.recording && audioUrl && (
            <div className="text-green-600 text-xs space-y-2">
              <div className="flex items-center justify-center gap-1 text-sm">
                <CircleCheck className="h-3 w-3" />
                Recorded ({formatClock(debate.recording_duration || 0)})
              </div>

              <div className="flex justify-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={playRecording}
                  disabled={isPlaying}
                  className="h-6 px-2"
                >
                  {isPlaying ? (
                    <Pause className="h-3 w-3" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={downloadRecording}
                  className="h-6 px-2"
                >
                  <Download className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

