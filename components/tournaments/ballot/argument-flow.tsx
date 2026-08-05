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

interface ArgumentFlowProps {
  debate: EnrichedDebate;
  onAddArgument: (argument: ArgumentFlowEntry) => void;
  onUpdateArgumentFlow: (flow: ArgumentFlowEntry[]) => void;
}

export function ArgumentFlow({ debate, onAddArgument, onUpdateArgumentFlow }: ArgumentFlowProps) {
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
      speaker: debate.current_speaker as Id<"users">,
      team: (argumentType === "poi"
        ? debate.opposition_team_id
        : debate.proposition_team_id) as Id<"teams">,
      timestamp: Date.now(),
      strength: argumentStrength,
      rebutted_by: [],
    };

    if (!newArg.team) return;

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

