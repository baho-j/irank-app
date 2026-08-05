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

interface FactCheckingInterfaceProps {
  debate: EnrichedDebate;
  onAddFactCheck: (factCheck: FactCheckEntry) => void;
  userId: Id<"users">;
}

export function FactCheckingInterface({ debate, onAddFactCheck, userId }: FactCheckingInterfaceProps) {
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

