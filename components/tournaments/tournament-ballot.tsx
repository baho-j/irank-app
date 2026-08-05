"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import { useOffline } from "@/hooks/use-offline";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounce } from "@/hooks/use-debounce";

interface TournamentBallotsProps {
  tournament: any;
  userRole: "admin" | "school_admin" | "volunteer" | "student";
  token: string;
  userId?: string;
  schoolId?: string;
}

const SCORING_CATEGORIES = [
  {
    key: "style" as const,
    label: "Style",
    icon: Users2,
    description: "Delivery, clarity, pace, volume, and engagement",
    color: "text-blue-600",
    weight: "40%",
  },
  {
    key: "content" as const,
    label: "Content",
    icon: Brain,
    description: "Arguments, evidence, analysis, and rebuttal",
    color: "text-green-600",
    weight: "40%",
  },
  {
    key: "strategy" as const,
    label: "Strategy",
    icon: Target,
    description: "Structure, prioritisation, timing, and role fulfilment",
    color: "text-purple-600",
    weight: "20%",
  },
];

function BallotSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center bg-brown rounded-t-md lg:justify-between gap-4 p-3">
        <div>
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-18" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>

      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg">
          <Skeleton className="h-12 w-12 rounded" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-[250px]" />
            <Skeleton className="h-4 w-[200px]" />
          </div>
          <div className="flex space-x-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

function getDebateStatusColor(status: string) {
  switch (status) {
    case "completed": return "bg-green-100 text-green-800";
    case "inProgress": return "bg-blue-100 text-blue-800";
    case "pending": return "bg-yellow-100 text-yellow-800";
    case "noShow": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

function getDebateStatusIcon(status: string) {
  switch (status) {
    case "completed": return CheckCircle;
    case "inProgress": return Timer;
    case "pending": return Clock;
    case "noShow": return AlertTriangle;
    default: return Clock;
  }
}


function DebateTimer({ debate, token, onUpdateDebate, compact = false }: any) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [, setAudioChunks] = useState<Blob[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const getFileUrl = useMutation(api.files.getUrl);
  const updateDebateRecording = useMutation(api.functions.ballots.updateRecording);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        setCurrentTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

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

      const chunks: Blob[] = [];
      setAudioChunks(chunks);

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="text-sm font-mono font-bold">
          {formatTime(currentTime)}
        </div>

        <div className="flex gap-1">
          <Button
            onClick={() => setIsRunning(!isRunning)}
            variant={isRunning ? "destructive" : "default"}
            size="sm"
            className="h-5 w-5 p-0"
          >
            {isRunning ? <Pause className="h-2 w-2" /> : <Play className="h-2 w-2" />}
          </Button>

          <Button
            onClick={() => {
              setCurrentTime(0);
              setIsRunning(false);
            }}
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
        <div className="text-2xl md:text-3xl font-bold font-mono">
          {formatTime(currentTime)}
        </div>

        <div className="flex justify-center gap-2 flex-wrap">
          <Button
            onClick={() => setIsRunning(!isRunning)}
            variant={isRunning ? "destructive" : "default"}
            size="sm"
          >
            {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>

          <Button
            onClick={() => {
              setCurrentTime(0);
              setIsRunning(false);
            }}
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
              Recording: {formatTime(recordingDuration)}
            </div>
          )}

          {debate.recording && audioUrl && (
            <div className="text-green-600 text-xs space-y-2">
              <div className="flex items-center justify-center gap-1 text-sm">
                <CircleCheck className="h-3 w-3" />
                Recorded ({formatTime(debate.recording_duration || 0)})
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

function ArgumentFlow({ debate, onAddArgument, onUpdateArgumentFlow }: any) {
  const [newArgument, setNewArgument] = useState("");
  const [argumentType, setArgumentType] = useState<"main" | "rebuttal" | "poi">("main");
  const [argumentStrength, setArgumentStrength] = useState(3);
  const [linkingMode, setLinkingMode] = useState(false);
  const [selectedArgument, setSelectedArgument] = useState<number | null>(null);

  const argumentFlow = debate.argument_flow || [];

  const handleAddArgument = () => {
    if (!newArgument.trim()) return;

    const newArg = {
      type: argumentType,
      content: newArgument,
      speaker: debate.current_speaker,
      team: argumentType === "poi" ? debate.opposition_team_id : debate.proposition_team_id,
      timestamp: Date.now(),
      strength: argumentStrength,
      rebutted_by: [],
    };

    onAddArgument(newArg);
    setNewArgument("");
    setArgumentStrength(3);
  };

  const handleArgumentConnection = (parentIndex: number, childIndex: number) => {
    const updatedFlow = argumentFlow.map((arg: any, index: number) => {
      if (index === parentIndex) {
        return {
          ...arg,
          rebutted_by: [...(arg.rebutted_by || []), childIndex.toString()]
        };
      }
      return arg;
    });
    onUpdateArgumentFlow(updatedFlow);
    setLinkingMode(false);
    setSelectedArgument(null);
    toast.success("Arguments linked successfully");
  };

  const getArgumentColor = (type: string) => {
    switch (type) {
      case "main": return "border-blue-500 bg-blue-50";
      case "rebuttal": return "border-red-500 bg-red-50";
      case "poi": return "border-yellow-500 bg-yellow-50";
      default: return "border-gray-500 bg-gray-50";
    }
  };

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Argument Flow
          </h4>
          <Button
            size="sm"
            variant={linkingMode ? "default" : "outline"}
            onClick={() => {
              setLinkingMode(!linkingMode);
              setSelectedArgument(null);
            }}
          >
            <Link2 className="h-3 w-3 mr-1" />
            {linkingMode ? "Exit Linking" : "Link Arguments"}
          </Button>
        </div>

        {linkingMode && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Select two arguments to link them. First argument will be marked as rebutted by the second.
            </AlertDescription>
          </Alert>
        )}

        <ScrollArea className="h-64">
          <div className="space-y-3">
            {argumentFlow.map((arg: any, index: number) => (
              <div
                key={index}
                className={`p-3 border rounded-lg cursor-pointer transition-all ${getArgumentColor(arg.type)} ${
                  linkingMode ? 'hover:shadow-md' : ''
                } ${selectedArgument === index ? 'ring-2 ring-blue-500' : ''}`}
                onClick={() => {
                  if (linkingMode) {
                    if (selectedArgument === null) {
                      setSelectedArgument(index);
                    } else if (selectedArgument !== index) {
                      handleArgumentConnection(selectedArgument, index);
                    }
                  }
                }}
              >
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="outline" className="mb-1">
                    {arg.type} #{index + 1}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <div className="flex">
                      {Array.from({ length: 5 }, (_, i) => (
                        <div
                          key={i}
                          className={`w-2 h-2 rounded-full mx-px ${
                            i < (arg.strength || 3) ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(arg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <p className="text-sm mb-2">{arg.content}</p>

                {arg.rebutted_by && arg.rebutted_by.length > 0 && (
                  <div className="mt-2 pt-2 border-t">
                    <span className="text-xs text-muted-foreground">Links to:</span>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {arg.rebutted_by.map((rebuttal: string, idx: number) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          #{parseInt(rebuttal) + 1}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {linkingMode && selectedArgument === index && (
                  <div className="mt-2 pt-2 border-t">
                    <span className="text-xs font-medium text-blue-600">Selected - Choose target argument</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="space-y-3 pt-3 border-t">
          <div className="flex gap-2">
            <Select value={argumentType} onValueChange={(value: any) => setArgumentType(value)}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="main">Main</SelectItem>
                <SelectItem value="rebuttal">Rebuttal</SelectItem>
                <SelectItem value="poi">POI</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1">
              <Input
                placeholder="Add argument..."
                value={newArgument}
                onChange={(e) => setNewArgument(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddArgument()}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-xs">Strength:</Label>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setArgumentStrength(Math.max(1, argumentStrength - 1))}
                className="h-6 w-6 p-0"
              >
                <Minus className="h-3 w-3" />
              </Button>

              <div className="flex mx-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-full mx-px cursor-pointer ${
                      i < argumentStrength ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                    onClick={() => setArgumentStrength(i + 1)}
                  />
                ))}
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setArgumentStrength(Math.min(5, argumentStrength + 1))}
                className="h-6 w-6 p-0"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <Button onClick={handleAddArgument} size="sm" className="w-full">
            Add Argument
          </Button>
        </div>
      </div>
    </Card>
  );
}

function FactCheckingInterface({ debate, onAddFactCheck, userId }: any) {
  const { factCheckClaim, isFactChecking } = useGemini();
  const [selectedText, setSelectedText] = useState("");
  const [factCheckResult, setFactCheckResult] = useState<any>(null);
  const [manualResult, setManualResult] = useState<"true" | "false" | "partially_true" | "inconclusive">("inconclusive");
  const [manualExplanation, setManualExplanation] = useState("");

  const existingFactChecks = debate.fact_checks || [];

  const handleAIFactCheck = async () => {
    if (!selectedText.trim()) return;

    const result = await factCheckClaim(selectedText);
    setFactCheckResult(result);
  };

  const handleManualFactCheck = () => {
    if (!selectedText.trim() || !manualExplanation.trim()) return;

    const factCheck = {
      claim: selectedText,
      result: manualResult,
      explanation: manualExplanation,
      sources: [],
      checked_by: userId,
      timestamp: Date.now(),
    };

    onAddFactCheck(factCheck);
    setSelectedText("");
    setManualExplanation("");
    setFactCheckResult(null);
  };

  const handleAcceptAIResult = () => {
    if (!factCheckResult) return;

    const factCheck = {
      claim: selectedText,
      result: factCheckResult.result,
      explanation: factCheckResult.explanation,
      sources: factCheckResult.sources || [],
      checked_by: userId,
      timestamp: Date.now(),
    };

    onAddFactCheck(factCheck);
    setSelectedText("");
    setFactCheckResult(null);
  };

  const getResultColor = (result: string) => {
    switch (result) {
      case "true": return "text-green-600 bg-green-50 border-green-200";
      case "false": return "text-red-600 bg-red-50 border-red-200";
      case "partially_true": return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "inconclusive": return "text-gray-600 bg-gray-50 border-gray-200";
      default: return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <h4 className="font-medium flex items-center gap-2">
          <Search className="h-4 w-4" />
          Fact Checking
        </h4>

        <div className="space-y-3">
          <div>
            <Label className="text-sm">Claim to check:</Label>
            <Textarea
              placeholder="Enter or paste claim to fact-check..."
              value={selectedText}
              onChange={(e) => setSelectedText(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleAIFactCheck}
              disabled={!selectedText.trim() || isFactChecking}
              size="sm"
              variant="outline"
            >
              {isFactChecking ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Checking...
                </>
              ) : (
                <>
                  <Brain className="h-3 w-3 mr-1" />
                  AI Check
                </>
              )}
            </Button>

            <Button
              onClick={() => setFactCheckResult({ isManual: true })}
              disabled={!selectedText.trim()}
              size="sm"
              variant="outline"
            >
              <CheckSquare className="h-3 w-3 mr-1" />
              Manual Check
            </Button>
          </div>

          {factCheckResult && (
            <div className="space-y-3 p-3 border rounded-lg">
              {factCheckResult.isManual ? (
                <div className="space-y-3">
                  <h5 className="font-medium">Manual Fact Check</h5>

                  <div>
                    <Label className="text-sm">Result:</Label>
                    <Select value={manualResult} onValueChange={(value: any) => setManualResult(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">True</SelectItem>
                        <SelectItem value="false">False</SelectItem>
                        <SelectItem value="partially_true">Partially True</SelectItem>
                        <SelectItem value="inconclusive">Inconclusive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm">Explanation:</Label>
                    <Textarea
                      placeholder="Explain your fact check..."
                      value={manualExplanation}
                      onChange={(e) => setManualExplanation(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleManualFactCheck} size="sm">
                      Save Fact Check
                    </Button>
                    <Button
                      onClick={() => setFactCheckResult(null)}
                      size="sm"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <h5 className="font-medium">AI Fact Check Result</h5>

                  <div className={`p-2 rounded border ${getResultColor(factCheckResult.result)}`}>
                    <div className="font-medium capitalize">{factCheckResult.result.replace('_', ' ')}</div>
                    <div className="text-sm mt-1">
                      Confidence: {(factCheckResult.confidence * 100).toFixed(0)}%
                    </div>
                  </div>

                  {factCheckResult.explanation && (
                    <div>
                      <Label className="text-sm">Explanation:</Label>
                      <p className="text-sm p-2 bg-muted rounded">{factCheckResult.explanation}</p>
                    </div>
                  )}

                  {factCheckResult.sources && factCheckResult.sources.length > 0 && (
                    <div>
                      <Label className="text-sm">Sources:</Label>
                      <ul className="text-sm list-disc list-inside p-2 bg-muted rounded">
                        {factCheckResult.sources.map((source: string, idx: number) => (
                          <li key={idx}>{source}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button onClick={handleAcceptAIResult} size="sm">
                      Accept & Save
                    </Button>
                    <Button
                      onClick={() => setFactCheckResult({ isManual: true })}
                      size="sm"
                      variant="outline"
                    >
                      Edit Manually
                    </Button>
                    <Button
                      onClick={() => setFactCheckResult(null)}
                      size="sm"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {existingFactChecks.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Previous Fact Checks:</Label>
            <ScrollArea className="h-32">
              {existingFactChecks.map((check: any, idx: number) => (
                <div key={idx} className={`p-2 mb-2 rounded border text-sm ${getResultColor(check.result)}`}>
                  <div className="font-medium">&#34;{check.claim}&#34;</div>
                  <div className="capitalize">{check.result.replace('_', ' ')}</div>
                  {check.explanation && <div className="text-xs mt-1">{check.explanation}</div>}
                </div>
              ))}
            </ScrollArea>
          </div>
        )}
      </div>
    </Card>
  );
}

function CollaborativeNotes({ debate, userId, onUpdateNotes, token }: any) {
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

function SpeakerPositionManager({ speakers, positions, onUpdatePositions, tournament, debate, teamId, teamName }: any) {
  const [speakerPositions, setSpeakerPositions] = useState<Record<string, string>>(positions || {});

  const availablePositions = useMemo(() => {

    const speakerCount = speakers.length;

    return Array.from({ length: speakerCount }, (_, i) => ({
      id: `speaker_${i + 1}`,
      label: `Speaker ${i + 1}`,
    }));
  }, [speakers.length]);

  const handlePositionChange = (speakerId: string, newPosition: string) => {
    const newPositions = { ...speakerPositions };

    const currentSpeakerWithPosition = Object.keys(newPositions).find(
      id => newPositions[id] === newPosition && speakers.some((s: any) => s.id === id)
    );

    if (currentSpeakerWithPosition) {
      newPositions[currentSpeakerWithPosition] = speakerPositions[speakerId] || "";
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
                onValueChange={(value) => handlePositionChange(speaker.id, value)}
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

export function useNames(token: string, userIds: string[]) {
  return useOffline(useQuery(api.functions.ballots.getUserNames, {
    token,
    user_ids: userIds as Id<"users">[],
  }), "speaker names");
}

function JudgingInterface({ debate, ballot, userId, onSubmitBallot, tournament, token, userRole }: any) {
  const { validateFeedback, checkBias, isValidating, isBiasChecking } = useGemini();
  const [scores, setScores] = useState<Record<string, SpeechScore>>({});
  const [teamWinner, setTeamWinner] = useState<string>("");
  const [winningPosition, setWinningPosition] = useState<"proposition" | "opposition" | "">("");
  const [notes, setNotes] = useState("");
  const [rfd, setRfd] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [speakerComments, setSpeakerComments] = useState<Record<string, string>>({});
  const [teamComments, setTeamComments] = useState<Record<string, string>>({});
  const [speakerPositions, setSpeakerPositions] = useState<Record<string, string>>({});
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
      setSelectedJudgeId(debate.judges[0]._id || debate.judges[0]);
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
      const teamId = debate.proposition_team?.members?.includes(speakerId)
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

  const handleSubmit = async (isFinal: boolean = false) => {
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

        return {
          speaker_id: speakerId as Id<"users">,
          team_id: debate.proposition_team?.members.includes(speakerId)
            ? debate.proposition_team._id
            : debate.opposition_team._id,
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

      toast.success(isFinal ? "Ballot submitted successfully!" : "Ballot draft saved!");

    } catch (error: any) {
      toast.error(error.message || "Failed to submit ballot");
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
              <DebateTimer debate={debate} token={token} onTimeUpdate={() => {}} compact={true} />
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
                <Button
                  onClick={() => handleSubmit(true)}
                  disabled={
                    isSubmitting ||
                    !!submissionBlockedReason ||
                    isValidating ||
                    availableTeams.length === 0 ||
                    (userRole === "volunteer" && ballot?.submission_state === "submitted") ||
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
              <DebateTimer debate={debate} token={token} onTimeUpdate={() => {}} />

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
                  (userRole === "volunteer" && ballot?.submission_state === "submitted") ||
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

function BallotRow({ debate, userRole, userId, onViewDetails, onEditBallot, onFlagBallot, onUnflagBallot }: any) {
  const StatusIcon = getDebateStatusIcon(debate.status);
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
            <Badge variant="secondary" className={getDebateStatusColor(debate.status)}>
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

function BallotCard({ debate, userRole, userId, onViewDetails, onEditBallot, onFlagBallot, onUnflagBallot }: any) {
  const StatusIcon = getDebateStatusIcon(debate.status);
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
            <Badge variant="secondary" className={getDebateStatusColor(debate.status)}>
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


        {(debate.fact_checks?.length > 0 || debate.argument_flow?.length > 0) && canSeeDetails && (
          <div className="pt-2 border-t">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {debate.fact_checks?.length > 0 && (
                <span className="flex items-center gap-1">
                  <Search className="h-3 w-3" />
                  {debate.fact_checks.length} fact checks
                </span>
              )}
              {debate.argument_flow?.length > 0 && (
                <span className="flex items-center gap-1">
                  <BarChart3 className="h-3 w-3" />
                  {debate.argument_flow.length} arguments
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BallotDetailsDialog({ debate, isOpen, onClose, token }: any) {
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
    const judge = debate?.judges?.find((j: any) => (j._id || j) === judgeId);
    if (judge?.name) return judge.name;
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
        is_flagged: judgeBallot.ballot.notes?.includes("[FLAG:") ||
          judgeBallot.ballot.notes?.includes("[JUDGE FLAG:") || false,
      };
    }).filter(Boolean);
  }, [debate, userNamesQuery]);

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

            
            {debate?.fact_checks?.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base md:text-lg flex items-center gap-2">
                    <Search className="h-4 w-4 md:h-5 md:w-5" />
                    Fact Checks ({debate.fact_checks.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {debate.fact_checks.map((check: any, idx: number) => (
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

            
            {debate?.argument_flow?.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base md:text-lg flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 md:h-5 md:w-5" />
                    Argument Flow ({debate.argument_flow.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {debate.argument_flow.map((arg: any, idx: number) => (
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

            
            {debate?.shared_notes?.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base md:text-lg flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 md:h-5 md:w-5" />
                    Shared Notes ({debate.shared_notes.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {debate.shared_notes.map((note: any, idx: number) => (
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


function FlagBallotDialog({ debate, isOpen, onClose, onFlag, userRole }: any) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBallots, setSelectedBallots] = useState<string[]>([]);

  const availableBallots = useMemo(() => {
    if (userRole === "admin") {

      return debate?.judges_ballots
        ?.filter((jb: any) => jb.ballot?.submission_state === "submitted")
        ?.map((jb: any) => ({
          id: jb.ballot._id,
          judgeName: jb.judge_name || debate.judges?.find((j: any) => j._id === jb.judge_id)?.name || `Judge ${jb.judge_id.slice(-4)}`,
          isHeadJudge: debate.head_judge_id === jb.judge_id,
          isAlreadyFlagged: jb.ballot.notes?.includes("[FLAG:") || jb.ballot.notes?.includes("[JUDGE FLAG:"),
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

      {showJudgingInterface && judgingDebate && (
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