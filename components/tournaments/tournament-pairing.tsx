"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  Calendar,
  ChevronDown,
  ChevronRight,
  Crown,
  Edit3,
  FileSpreadsheet,
  FileText,
  GripVertical,
  Info,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Settings,
  Share,
  Shuffle,
  Target,
  UserMinus,
  Users,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { downloadExcel, type ExcelSheet } from "@/lib/export/excel";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { generateTournamentPairings, validatePairing } from "@/lib/pairing-algorithm";
import { Id } from "@/convex/_generated/dataModel";
import { useOffline } from "@/hooks/use-offline";
import { useDebounce } from "@/hooks/use-debounce";

interface Team {
  _id: Id<"teams">;
  name: string;
  school?: {
    _id: Id<"schools">;
    name: string;
    type: string;
  };
  members: Id<"users">[];
  status: string;
  payment_status: string;
}

interface Judge {
  _id: Id<"users">;
  name: string;
  email: string;
  school?: {
    _id: Id<"schools">;
    name: string;
  };
}

interface PairingDraft {
  room_name: string;
  proposition_team_id?: Id<"teams">;
  opposition_team_id?: Id<"teams">;
  judges: Id<"users">[];
  head_judge_id?: Id<"users">;
  is_bye_round: boolean;
  conflicts: Array<{
    type: string;
    description: string;
    severity: 'warning' | 'error';
  }>;
  quality_score: number;
}

interface TournamentPairingsProps {
  tournament: any;
  userRole: string;
  token: string;
  userId?: string;
  schoolId?: string;
}

interface MoveAction {
  type: 'swap_sides' | 'move_team' | 'update_room' | 'update_judges' | 'generate' | 'clear' | 'bulk_generate';
  debateIndex?: number;
  oldValue: any;
  newValue: any;
  description: string;
  timestamp: number;
  pairingsSnapshot: PairingDraft[];
  roundNumber?: number;
}

const ConfirmDialog = ({
                         open,
                         onOpenChange,
                         title,
                         description,
                         onConfirm,
                         onCancel,
                         confirmText = "Confirm",
                         cancelText = "Cancel",
                         variant = "default"
                       }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
}) => {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">{description}</div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={handleCancel}>
              {cancelText}
            </Button>
            <Button
              variant={variant === "destructive" ? "destructive" : "default"}
              onClick={handleConfirm}
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const getJudgeConflicts = (judge: any, debate: any) => {
  const conflicts: string[] = [];

  if (judge.school_id) {
    if (!debate.is_public_speaking) {
      if (debate.proposition_team?.school?._id === judge.school_id) {
        conflicts.push('Same school as Proposition team');
      }
      if (debate.opposition_team?.school?._id === judge.school_id) {
        conflicts.push('Same school as Opposition team');
      }
    } else {
      if (debate.proposition_team?.school?._id === judge.school_id) {
        conflicts.push('Same school as participating team');
      }
    }
  }

  if (judge.conflicts?.includes(debate.proposition_team?._id)) {
    conflicts.push('Feedback conflict with Proposition');
  }
  if (!debate.is_public_speaking && judge.conflicts?.includes(debate.opposition_team?._id)) {
    conflicts.push('Feedback conflict with Opposition');
  }

  return conflicts;
};

const TeamCell = ({
                    team,
                    position,
                    debateIndex,
                    onDragStart,
                    onDragEnd,
                    onDragOver,
                    onDragLeave,
                    onDrop,
                    dropZoneActive,
                    isDragging,
                    canEdit,
                    onWithdraw,
                    isPublicSpeaking
                  }: {
  team?: Team;
  position: 'proposition' | 'opposition';
  debateIndex: number;
  onDragStart: (e: React.DragEvent, team: Team, debateIndex: number, position: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, debateIndex: number, position: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, debateIndex: number, position: string) => void;
  dropZoneActive: boolean;
  isDragging: boolean;
  canEdit: boolean;
  onWithdraw?: (teamId: string, teamName: string) => void;
  isPublicSpeaking?: boolean;
}) => {
  const positionKey = position === 'proposition' ? 'prop' : 'opp';

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded border transition-all duration-200 ${
        team
          ? `bg-background border-border ${canEdit ? 'hover:border-primary' : ''}`
          : 'bg-muted border-dashed border-muted-foreground/25'
      } ${
        dropZoneActive
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : ''
      } ${
        isDragging
          ? 'opacity-50'
          : ''
      }`}
      onDragOver={(e) => onDragOver(e, debateIndex, positionKey)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, debateIndex, positionKey)}
    >
      {team ? (
        <>
          {canEdit && (
            <div
              className="cursor-move p-1 hover:bg-muted rounded"
              draggable
              onDragStart={(e) => onDragStart(e, team, debateIndex, positionKey)}
              onDragEnd={onDragEnd}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-xs truncate">{team.name}</span>
              {!isPublicSpeaking && (
                <Badge
                  variant="outline"
                  className={position === 'proposition' ? 'text-green-700 text-xs border-green-700' : 'text-red-700 text-xs border-red-700'}
                >
                  {position === 'proposition' ? 'Prop' : 'Opp'}
                </Badge>
              )}
            </div>
            {team.school && (
              <div className="text-xs text-muted-foreground truncate">{team.school.name}</div>
            )}
          </div>

          {onWithdraw && team.status === 'active' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onWithdraw(team._id, team.name)}
              className="opacity-50 hover:opacity-100 h-6 w-6 p-0"
              title="Withdraw team"
            >
              <UserMinus className="h-3 w-3" />
            </Button>
          )}
        </>
      ) : (
        <div className="flex-1 text-center text-muted-foreground text-sm py-2">
          {dropZoneActive ? (
            <span className="text-primary font-medium">Drop team here</span>
          ) : (
            canEdit ? 'Drop team here' : 'No team assigned'
          )}
        </div>
      )}
    </div>
  );
};

const JudgeSelectionDialog = ({
                                debate,
                                onUpdate,
                                trigger,
                                tournament,
                                canEditJudges,
                                allVolunteers = [] // Add this prop
                              }: {
  debate: any;
  debateIndex: number;
  onUpdate: (judges: Id<"users">[], headJudge?: Id<"users">) => void;
  trigger: React.ReactNode;
  tournament: any;
  canEditJudges: boolean;
  allVolunteers?: any[]; // Add this prop type
}) => {
  const [selectedJudges, setSelectedJudges] = useState<Id<"users">[]>([]);
  const [selectedHeadJudge, setSelectedHeadJudge] = useState<Id<"users"> | undefined>(undefined);
  const [open, setOpen] = useState(false);

  React.useEffect(() => {
    if (open) {
      setSelectedJudges(debate.judges || []);
      setSelectedHeadJudge(debate.head_judge_id);
    }
  }, [open, debate.judges, debate.head_judge_id]);

  if (!canEditJudges) return null;

  const handleJudgeToggle = (judgeId: Id<"users">, checked: boolean) => {
    if (checked) {
      const newJudges = [...selectedJudges, judgeId];
      setSelectedJudges(newJudges);

      if (newJudges.length === 1) {
        setSelectedHeadJudge(judgeId);
      }
    } else {
      const newJudges = selectedJudges.filter(id => id !== judgeId);
      setSelectedJudges(newJudges);

      if (selectedHeadJudge === judgeId) {
        setSelectedHeadJudge(newJudges.length > 0 ? newJudges[0] : undefined);
      }
    }
  };

  const handleSave = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onUpdate(selectedJudges, selectedHeadJudge);
    setOpen(false);
  };

  const sortedJudges = [...allVolunteers].sort((a, b) => {
    const conflictsA = getJudgeConflicts(a, debate).length;
    const conflictsB = getJudgeConflicts(b, debate).length;

    if (conflictsA !== conflictsB) return conflictsA - conflictsB;

    const experienceA = (a.total_debates_judged || 0) + ((a.elimination_debates || 0) * 2);
    const experienceB = (b.total_debates_judged || 0) + ((b.elimination_debates || 0) * 2);

    return experienceB - experienceA;
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={(e) => e.stopPropagation()}>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Edit Judges - {debate.room_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Select judges for this {debate.is_public_speaking ? 'public speaking round' : 'debate'}.
            {!debate.is_public_speaking && ` Choose ${tournament.judges_per_debate} judges (odd number recommended).`}
          </div>

          {!debate.is_public_speaking && (
            <>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <strong>Proposition:</strong> {debate.proposition_team?.name}
                  {debate.proposition_team?.school && (
                    <div className="text-muted-foreground">({debate.proposition_team.school.name})</div>
                  )}
                </div>
                <div>
                  <strong>Opposition:</strong> {debate.opposition_team?.name}
                  {debate.opposition_team?.school && (
                    <div className="text-muted-foreground">({debate.opposition_team.school.name})</div>
                  )}
                </div>
              </div>
              <Separator />
            </>
          )}

          <ScrollArea className="h-96">
            <div className="space-y-2">
              {sortedJudges.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No volunteers found for this tournament</p>
                  <p className="text-xs">Make sure volunteers have accepted their invitations</p>
                </div>
              ) : (
                sortedJudges.map((judge: any) => {
                  const conflicts = getJudgeConflicts(judge, debate);
                  const isSelected = selectedJudges.includes(judge._id);
                  const isHeadJudge = selectedHeadJudge === judge._id;
                  const isCurrentlyAssigned = debate.judges?.includes(judge._id);

                  return (
                    <div
                      key={judge._id}
                      className={`flex items-center space-x-3 p-2 border rounded ${
                        conflicts.length > 0 ? 'border-red-200 bg-red-50' :
                          isCurrentlyAssigned ? 'border-blue-200 bg-blue-50' : 'border-border'
                      }`}
                    >
                      <Checkbox
                        id={`judge-${judge._id}`}
                        checked={isSelected}
                        onCheckedChange={(checked) => handleJudgeToggle(judge._id, !!checked)}

                      />

                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <label htmlFor={`judge-${judge._id}`} className="text-sm font-medium cursor-pointer">
                            {judge.name}
                          </label>

                          {isHeadJudge && (
                            <Badge variant="default" className="gap-1">
                              <Crown className="h-3 w-3" />
                              Head
                            </Badge>
                          )}

                          {isCurrentlyAssigned && !isSelected && (
                            <Badge variant="outline" className="text-xs">
                              Currently Assigned
                            </Badge>
                          )}

                          {conflicts.length > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''}
                            </Badge>
                          )}

                          {judge.school_name && (
                            <span className="text-xs text-muted-foreground">
                              ({judge.school_name})
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground">
                          {judge.total_debates_judged || 0} debates • {judge.elimination_debates || 0} eliminations
                          {judge.avg_feedback_score && (
                            <span> • {judge.avg_feedback_score.toFixed(1)}/5 rating</span>
                          )}
                        </div>

                        {conflicts.length > 0 && (
                          <div className="text-xs text-red-600 mt-1">
                            Conflicts: {conflicts.join(', ')}
                          </div>
                        )}
                      </div>

                      {isSelected && selectedJudges.length > 1 && (
                        <Button
                          variant={isHeadJudge ? "default" : "outline"}
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedHeadJudge(judge._id);
                          }}
                        >
                          {isHeadJudge ? "Head Judge" : "Make Head"}
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              Selected: {selectedJudges.length} judges
              {selectedJudges.length % 2 === 0 && selectedJudges.length > 0 && (
                <span className="text-orange-600 ml-1">(Even number - may cause ties)</span>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={(e) => {
                e?.stopPropagation();
                setOpen(false);
              }}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const SharePairingsDialog = ({
                               pairings,
                               tournament,
                               roundNumber,
                               allRounds,
                               onExportMultipleRounds
                             }: {
  pairings: any[],
  tournament: any,
  roundNumber: number,
  allRounds?: any[],
  onExportMultipleRounds?: (selectedRounds: number[]) => Promise<any[]>
}) => {
  const [open, setOpen] = useState(false);
  const [exportType, setExportType] = useState<'single' | 'multiple'>('single');
  const [selectedRounds, setSelectedRounds] = useState<number[]>([roundNumber]);
  const [isExporting, setIsExporting] = useState(false);

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      let dataToExport = pairings;
      let fileName = `${tournament.name}_Round_${roundNumber}_Pairings.xlsx`;

      if (exportType === 'multiple' && onExportMultipleRounds) {
        dataToExport = await onExportMultipleRounds(selectedRounds);
        fileName = `${tournament.name}_Rounds_${selectedRounds.join('-')}_Pairings.xlsx`;
      }

      const toRow = (pairing: any, fallbackIndex: number) => ({
        'Room': pairing.room_name || `Room ${fallbackIndex + 1}`,
        'Proposition Team': pairing.proposition_team?.name || 'N/A',
        'Opposition Team': pairing.opposition_team?.name || (pairing.is_public_speaking ? 'Public Speaking' : 'N/A'),
        'Judges': pairing.judge_details?.map((j: any) => j.name).join(', ') || 'No judges',
        'Head Judge': pairing.head_judge?.name || 'N/A',
        'Type': pairing.is_public_speaking ? 'Public Speaking' : 'Debate',
        'Conflicts': pairing.pairing_conflicts?.length || 0
      });

      let sheets: ExcelSheet[];

      if (exportType === 'multiple') {
        const roundGroups = dataToExport.reduce((acc: Record<string, any[]>, pairing) => {
          const round = String(pairing.round_number || roundNumber);
          if (!acc[round]) acc[round] = [];
          acc[round].push(toRow(pairing, acc[round].length));
          return acc;
        }, {});

        sheets = Object.entries(roundGroups)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([round, rows]) => ({ name: `Round ${round}`, rows }));
      } else {
        sheets = [{
          name: `Round ${roundNumber}`,
          rows: dataToExport.map(toRow),
        }];
      }

      await downloadExcel(sheets, fileName);
      toast.success("Excel file downloaded!");
    } catch (error) {
      toast.error("Failed to export Excel file");
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      let dataToExport = pairings;
      let fileName = `${tournament.name}_Round_${roundNumber}_Pairings.pdf`;

      if (exportType === 'multiple' && onExportMultipleRounds) {
        dataToExport = await onExportMultipleRounds(selectedRounds);
        fileName = `${tournament.name}_Rounds_${selectedRounds.join('-')}_Pairings.pdf`;
      }

      const doc = new jsPDF();

      doc.setFontSize(16);
      if (exportType === 'multiple') {
        doc.text(`${tournament.name} - Rounds ${selectedRounds.join(', ')} Pairings`, 20, 20);
      } else {
        doc.text(`${tournament.name} - Round ${roundNumber} Pairings`, 20, 20);
      }

      let yPosition = 40;

      if (exportType === 'multiple') {
        const roundGroups = dataToExport.reduce((acc, pairing) => {
          const round = pairing.round_number || roundNumber;
          if (!acc[round]) acc[round] = [];
          acc[round].push(pairing);
          return acc;
        }, {});

        Object.entries(roundGroups as Record<string, any[]>).forEach(([round, roundPairings]: [string, any[]]) => {
          if (yPosition > 250) {
            doc.addPage();
            yPosition = 20;
          }

          doc.setFontSize(14);
          doc.text(`Round ${round}`, 20, yPosition);
          yPosition += 10;

          const tableData = roundPairings.map((pairing, index) => [
            pairing.room_name || `Room ${index + 1}`,
            pairing.proposition_team?.name || 'N/A',
            pairing.opposition_team?.name || (pairing.is_public_speaking ? 'Public Speaking' : 'N/A'),
            pairing.judge_details?.map((j: any) => j.name).join(', ') || 'No judges'
          ]);

          autoTable(doc, {
            head: [['Room', 'Proposition', 'Opposition', 'Judges']],
            body: tableData,
            startY: yPosition,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [66, 139, 202] },
            margin: { left: 20, right: 20 }
          });

          yPosition = (doc as any).lastAutoTable.finalY + 20;
        });
      } else {
        const tableData = dataToExport.map((pairing, index) => [
          pairing.room_name || `Room ${index + 1}`,
          pairing.proposition_team?.name || 'N/A',
          pairing.opposition_team?.name || (pairing.is_public_speaking ? 'Public Speaking' : 'N/A'),
          pairing.judge_details?.map((j: any) => j.name).join(', ') || 'No judges'
        ]);

        autoTable(doc, {
          head: [['Room', 'Proposition', 'Opposition', 'Judges']],
          body: tableData,
          startY: yPosition,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [66, 139, 202] },
          margin: { left: 20, right: 20 }
        });
      }

      doc.save(fileName);
      toast.success("PDF file downloaded!");
    } catch (error) {
      toast.error("Failed to export PDF file");
    } finally {
      setIsExporting(false);
    }
  };

  const shareOnWhatsApp = () => {
    const text = `${tournament.name} - Round ${roundNumber} Pairings\n\n` +
      pairings.map((pairing, index) =>
        `${pairing.room_name || `Room ${index + 1}`}: ${pairing.proposition_team?.name || 'N/A'} vs ${pairing.opposition_team?.name || (pairing.is_public_speaking ? 'Public Speaking' : 'N/A')}`
      ).join('\n');

    const encodedText = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encodedText}`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share className="h-4 w-4 mr-1" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Pairings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {allRounds && allRounds.length > 1 && (
            <div className="space-y-3">
              <Label>Export Type</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="single"
                    name="exportType"
                    checked={exportType === 'single'}
                    onChange={() => setExportType('single')}
                  />
                  <Label htmlFor="single">Current Round ({roundNumber})</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="multiple"
                    name="exportType"
                    checked={exportType === 'multiple'}
                    onChange={() => setExportType('multiple')}
                  />
                  <Label htmlFor="multiple">Multiple Rounds</Label>
                </div>
              </div>

              {exportType === 'multiple' && (
                <div className="space-y-2">
                  <Label>Select Rounds</Label>
                  <div className="grid grid-cols-4 gap-2 max-h-32 overflow-y-auto">
                    {allRounds.map((round) => (
                      <div key={round.round_number} className="flex items-center space-x-1">
                        <Checkbox
                          id={`round-${round.round_number}`}
                          checked={selectedRounds.includes(round.round_number)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedRounds(prev => [...prev, round.round_number].sort((a, b) => a - b));
                            } else {
                              setSelectedRounds(prev => prev.filter(r => r !== round.round_number));
                            }
                          }}
                        />
                        <Label htmlFor={`round-${round.round_number}`} className="text-xs">
                          R{round.round_number}
                        </Label>
                      </div>
                    ))}
                  </div>
                  {selectedRounds.length === 0 && (
                    <p className="text-sm text-red-500">Please select at least one round</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Button
              onClick={exportToExcel}
              disabled={isExporting || (exportType === 'multiple' && selectedRounds.length === 0)}
              className="flex items-center gap-2"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              Excel
            </Button>
            <Button
              onClick={exportToPDF}
              disabled={isExporting || (exportType === 'multiple' && selectedRounds.length === 0)}
              className="flex items-center gap-2"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              PDF
            </Button>
          </div>
          <Button onClick={shareOnWhatsApp} className="w-full flex items-center gap-2" variant="outline">
            <Share className="h-4 w-4" />
            Share on WhatsApp
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const PairingsTableRow = ({
                            debate,
                            index,
                            isExpanded,
                            onToggleExpand,
                            editingRoom,
                            setEditingRoom,
                            updateRoomName,
                            swapSides,
                            handleTeamDragStart,
                            handleTeamDragEnd,
                            handleTeamDragOver,
                            handleTeamDragLeave,
                            handleTeamDrop,
                            dropZoneActive,
                            draggedTeam,
                            handleTeamWithdrawal,
                            updateDebateJudges,
                            handleJudgeDragStart,
                            handleJudgeDragEnd,
                            handleJudgeDragOver,
                            handleJudgeDragLeave,
                            handleJudgeDrop,
                            judgeDropZoneActive,
                            allTournamentVolunteers,
                            tournament,
                            isDraft,
                            canEditPairings,
                            canEditJudges,
                            canEditRoomNames,
                            canViewConflicts,
                            canWithdrawTeams
                          }: any) => {

  const ConflictBadge = ({ conflicts }: { conflicts: any[] }) => {
    if (!canViewConflicts || conflicts.length === 0) return null;
    const hasErrors = conflicts.some(c => c.severity === 'error');
    return (
      <Badge variant={hasErrors ? "destructive" : "secondary"} className="gap-1">
        {hasErrors ? <AlertCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
        {conflicts.length}
      </Badge>
    );
  };

  return (
    <React.Fragment>
      <TableRow className={judgeDropZoneActive === index ? 'bg-sky-50' : ''}>
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            className="p-0 h-4 w-2"
            onClick={() => onToggleExpand(index)}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
        </TableCell>

        <TableCell>
          <div className="flex items-center gap-1">
            {editingRoom === debate._id ? (
              <Input
                value={debate.room_name || ''}
                onChange={(e) => updateRoomName(index, e.target.value)}
                onBlur={() => setEditingRoom(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditingRoom(null);
                  if (e.key === 'Escape') setEditingRoom(null);
                }}
                className="h-7 text-sm"
                autoFocus
              />
            ) : (
              <span
                className={`font-medium ${canEditRoomNames && isDraft ? 'cursor-pointer text-sm hover:text-primary' : ''}`}
                onClick={() => {
                  if (canEditRoomNames && isDraft) {
                    setEditingRoom(debate._id);
                  }
                }}
              >
                {debate.room_name || `Room ${index + 1}`}
              </span>
            )}
          </div>
        </TableCell>

        <TableCell>
          <TeamCell
            team={debate.proposition_team}
            position="proposition"
            debateIndex={index}
            onDragStart={handleTeamDragStart}
            onDragEnd={handleTeamDragEnd}
            onDragOver={handleTeamDragOver}
            onDragLeave={handleTeamDragLeave}
            onDrop={handleTeamDrop}
            dropZoneActive={dropZoneActive === `${index}-prop`}
            isDragging={draggedTeam?.team._id === debate.proposition_team?._id}
            canEdit={canEditPairings && isDraft}
            onWithdraw={canWithdrawTeams ? handleTeamWithdrawal : undefined}
            isPublicSpeaking={debate.is_public_speaking}
          />
        </TableCell>

        <TableCell>
          {debate.is_public_speaking ? (
            <TeamCell
              team={undefined}
              position="opposition"
              debateIndex={index}
              onDragStart={handleTeamDragStart}
              onDragEnd={handleTeamDragEnd}
              onDragOver={handleTeamDragOver}
              onDragLeave={handleTeamDragLeave}
              onDrop={handleTeamDrop}
              dropZoneActive={dropZoneActive === `${index}-opp`}
              isDragging={false}
              canEdit={canEditPairings && isDraft}
              isPublicSpeaking={true}
            />
          ) : (
            <TeamCell
              team={debate.opposition_team}
              position="opposition"
              debateIndex={index}
              onDragStart={handleTeamDragStart}
              onDragEnd={handleTeamDragEnd}
              onDragOver={handleTeamDragOver}
              onDragLeave={handleTeamDragLeave}
              onDrop={handleTeamDrop}
              dropZoneActive={dropZoneActive === `${index}-opp`}
              isDragging={draggedTeam?.team._id === debate.opposition_team?._id}
              canEdit={canEditPairings && isDraft}
              onWithdraw={canWithdrawTeams ? handleTeamWithdrawal : undefined}
            />
          )}
        </TableCell>

        <TableCell
          onDragOver={(e) => handleJudgeDragOver(e, index)}
          onDragLeave={handleJudgeDragLeave}
          onDrop={(e) => handleJudgeDrop(e, index)}
        >
          <div className="flex items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {debate.judge_details?.length > 0 ? (
                debate.judge_details.slice(0, 2).map((judge: any) => (
                  <Badge
                    key={judge._id}
                    variant={judge._id === debate.head_judge?._id ? "default" : "outline"}
                    className={`gap-1 text-xs ${isDraft && canEditJudges ? 'cursor-move hover:bg-primary/70' : ''}`}
                    draggable={!!(isDraft && canEditJudges)}
                    onDragStart={(e) => handleJudgeDragStart(e, judge, index)}
                    onDragEnd={handleJudgeDragEnd}
                  >
                    {judge.name}
                    {judge._id === debate.head_judge?._id && <Crown className="h-4 w-4" />}
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground text-xs">No judges</span>
              )}
              {debate.judge_details?.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{debate.judge_details.length - 2}
                </Badge>
              )}
            </div>
          </div>
        </TableCell>

        <TableCell>
          <div className="flex flex-col gap-1">
            <ConflictBadge conflicts={debate.pairing_conflicts || debate.conflicts || []} />
          </div>
        </TableCell>

        <TableCell>
          <div className="flex items-center gap-1">
            {canEditJudges && (
              <JudgeSelectionDialog
                debate={debate}
                debateIndex={index}
                onUpdate={(judges, headJudge) => updateDebateJudges(index, judges, headJudge)}
                tournament={tournament}
                canEditJudges={canEditJudges}
                allVolunteers={allTournamentVolunteers || []}
                trigger={
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <Edit3 className="h-3 w-3" />
                  </Button>
                }
              />
            )}

            {canEditPairings && !debate.is_public_speaking && isDraft && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => swapSides(index)}
                className="h-6 w-6 p-0"
                title="Swap team sides"
              >
                <ArrowLeftRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/20">
            <div className="p-4 space-y-4">
              <div>
                <h4 className="font-medium mb-2">Judge Information</h4>
                <div className="grid gap-2">
                  {debate.judge_details?.length > 0 ? (
                    debate.judge_details.map((judge: any) => (
                      <div key={judge._id} className="flex items-center justify-between p-2 bg-background rounded border">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{judge.name}</span>
                          {judge._id === debate.head_judge?._id && (
                            <Badge variant="default" className="gap-1">
                              <Crown className="h-3 w-3" />
                              Head Judge
                            </Badge>
                          )}
                          {judge.school && (
                            <span className="text-sm text-muted-foreground">({judge.school.name})</span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {judge.total_debates_judged || 0} debates • {judge.elimination_debates || 0} eliminations
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground text-sm">No judges assigned</div>
                  )}
                </div>
              </div>

              {canViewConflicts && (debate.pairing_conflicts || debate.conflicts) &&
                (debate.pairing_conflicts || debate.conflicts).length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Conflicts</h4>
                    <div className="space-y-1">
                      {(debate.pairing_conflicts || debate.conflicts).map((conflict: any, i: number) => (
                        <div key={i} className="text-sm p-2 bg-background rounded border-l-4 border-l-orange-500">
                          <span className="font-medium capitalize">{conflict.type.replace('_', ' ')}: </span>
                          {conflict.description}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  );
};

const PairingsTable = ({
                         displayPairings,
                         isDraft,
                         canEditPairings,
                         canEditJudges,
                         canEditRoomNames,
                         canViewConflicts,
                         canWithdrawTeams,
                         editingRoom,
                         setEditingRoom,
                         updateRoomName,
                         swapSides,
                         handleTeamDragStart,
                         handleTeamDragEnd,
                         handleTeamDragOver,
                         handleTeamDragLeave,
                         handleTeamDrop,
                         dropZoneActive,
                         draggedTeam,
                         handleTeamWithdrawal,
                         updateDebateJudges,
                         handleJudgeDragStart,
                         handleJudgeDragEnd,
                         handleJudgeDragOver,
                         handleJudgeDragLeave,
                         handleJudgeDrop,
                         judgeDropZoneActive,
                         allTournamentVolunteers,
                         tournament,
                         searchQuery,
                         hasNextPage,
                         loadMore,
                         isLoadingMore
                       }: any) => {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const filteredPairings = useMemo(() => {
    if (!searchQuery.trim()) return displayPairings;

    const query = searchQuery.toLowerCase();
    return displayPairings.filter((pairing: any) => {
      const roomName = pairing.room_name?.toLowerCase() || '';
      const propTeamName = pairing.proposition_team?.name?.toLowerCase() || '';
      const oppTeamName = pairing.opposition_team?.name?.toLowerCase() || '';
      const judgeNames = pairing.judge_details?.map((j: any) => j.name?.toLowerCase()).join(' ') || '';

      return roomName.includes(query) ||
        propTeamName.includes(query) ||
        oppTeamName.includes(query) ||
        judgeNames.includes(query);
    });
  }, [displayPairings, searchQuery]);

  const tableBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!tableBodyRef.current || !hasNextPage || isLoadingMore) return;

      const { scrollTop, scrollHeight, clientHeight } = tableBodyRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 5) {
        loadMore();
      }
    };

    const tableBody = tableBodyRef.current;
    if (tableBody) {
      tableBody.addEventListener('scroll', handleScroll);
      return () => tableBody.removeEventListener('scroll', handleScroll);
    }
  }, [hasNextPage, isLoadingMore, loadMore]);

  return (
    <div className="rounded-md border border-input">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            <TableHead className="w-6"></TableHead>
            <TableHead className="w-32">Room</TableHead>
            <TableHead className="w-80">Proposition</TableHead>
            <TableHead className="w-80">Opposition</TableHead>
            <TableHead className="w-48">Judges</TableHead>
            <TableHead className="w-20">Status</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
      </Table>

      <div
        ref={tableBodyRef}
        className="max-h-[600px] overflow-y-auto"
      >
        <Table>
          <TableBody>
            {filteredPairings.map((debate: any, index: number) => (
              <PairingsTableRow
                key={debate._id || `debate-${index}`}
                debate={debate}
                index={index}
                isExpanded={expandedRows.has(index)}
                onToggleExpand={toggleRow}
                editingRoom={editingRoom}
                setEditingRoom={setEditingRoom}
                updateRoomName={updateRoomName}
                swapSides={swapSides}
                handleTeamDragStart={handleTeamDragStart}
                handleTeamDragEnd={handleTeamDragEnd}
                handleTeamDragOver={handleTeamDragOver}
                handleTeamDragLeave={handleTeamDragLeave}
                handleTeamDrop={handleTeamDrop}
                dropZoneActive={dropZoneActive}
                draggedTeam={draggedTeam}
                handleTeamWithdrawal={handleTeamWithdrawal}
                updateDebateJudges={updateDebateJudges}
                handleJudgeDragStart={handleJudgeDragStart}
                handleJudgeDragEnd={handleJudgeDragEnd}
                handleJudgeDragOver={handleJudgeDragOver}
                handleJudgeDragLeave={handleJudgeDragLeave}
                handleJudgeDrop={handleJudgeDrop}
                judgeDropZoneActive={judgeDropZoneActive}
                allTournamentVolunteers={allTournamentVolunteers || []}
                tournament={tournament}
                isDraft={isDraft}
                canEditPairings={canEditPairings}
                canEditJudges={canEditJudges}
                canEditRoomNames={canEditRoomNames}
                canViewConflicts={canViewConflicts}
                canWithdrawTeams={canWithdrawTeams}
              />
            ))}

            {isLoadingMore && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-4">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading more pairings...</span>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {filteredPairings.length === 0 && !isLoadingMore && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="text-muted-foreground">
                    {searchQuery ? 'No pairings match your search.' : 'No pairings found.'}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default function TournamentPairings({
                                             tournament,
                                             userRole,
                                             token,
                                           }: TournamentPairingsProps) {
  const [currentRound, setCurrentRound] = useState(1);
  const [isDraft, setIsDraft] = useState(true);
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [showConflicts, setShowConflicts] = useState(true);
  const [autoSaveDrafts, setAutoSaveDrafts] = useState(true);
  const [pairingMethod, setPairingMethod] = useState<'fold' | 'swiss' | 'auto'>('auto');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const [draggedJudge, setDraggedJudge] = useState<{
    judge: Judge;
    fromDebateIndex: number;
  } | null>(null);

  const [draggedTeam, setDraggedTeam] = useState<{
    team: Team;
    fromDebateIndex: number;
    fromPosition: string;
  } | null>(null);

  const [dropZoneActive, setDropZoneActive] = useState<string | null>(null);
  const [judgeDropZoneActive, setJudgeDropZoneActive] = useState<number | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "destructive";
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const [inputDialog, setInputDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    placeholder: string;
    onConfirm: (value: string) => void;
    onCancel?: () => void;
  }>({
    open: false,
    title: "",
    description: "",
    placeholder: "",
    onConfirm: () => {},
  });

  const [draftPairings, setDraftPairings] = useState<PairingDraft[]>([]);
  const [undoStack, setUndoStack] = useState<MoveAction[]>([]);
  const [redoStack, setRedoStack] = useState<MoveAction[]>([]);
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState<number | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkGenerationProgress, setBulkGenerationProgress] = useState({ current: 0, total: 0 });

  const [pagination, setPagination] = useState({ cursor: null as string | null });
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const draftSaveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const isAdmin = userRole === 'admin';
  const hasToken = Boolean(token);

  const canViewPairings = hasToken;
  const canGeneratePairings = isAdmin;
  const canEditPairings = isAdmin;
  const canSavePairings = isAdmin;
  const canWithdrawTeams = isAdmin;
  const canEditRoomNames = isAdmin;
  const canEditJudges = isAdmin;
  const canViewConflicts = isAdmin;
  const canViewStats = isAdmin;
  const canViewHistory = isAdmin;
  const canUseKeyboardShortcuts = isAdmin;
  const canAccessSettings = isAdmin;

  const pairingData = useQuery(
    api.functions.pairings.getTournamentPairingData,
    canGeneratePairings ? {
      token,
      tournament_id: tournament._id,
      round_number: currentRound,
    } : "skip"
  );

  const prelimsCheck = useQuery(
    api.functions.pairings.checkPreliminariesComplete,
    canGeneratePairings ? {
      token,
      tournament_id: tournament._id,
    } : "skip"
  );

  const existingPairings = useOffline(useQuery(
    api.functions.pairings.getTournamentPairings,
    canViewPairings ? {
      token,
      tournament_id: tournament._id,
      round_number: currentRound,
      paginationOpts: {
        numItems: 500,
        cursor: null,
      },
    } : "skip"
  ), "tournament-pairings");

  const pairingStats = useOffline(useQuery(
    api.functions.pairings.getPairingStats,
    canViewStats ? {
      token,
      tournament_id: tournament._id,
    } : "skip"
  ),"tournament-pairing-stats");

  const allTournamentVolunteers = useOffline(useQuery(
    api.functions.admin.tournaments.getAllTournamentVolunteers,
    canEditJudges ? {
      token,
      tournament_id: tournament._id,
    } : "skip"
  ), "tournament-volunteers");

  const savePairingsMutation = useMutation(api.functions.pairings.savePairings);
  const updatePairingMutation = useMutation(api.functions.pairings.updatePairing);
  const handleTeamWithdrawalMutation = useMutation(api.functions.pairings.handleTeamWithdrawal);

  const currentDebates = useMemo(() => {
    const pairingsPage = existingPairings?.page || [];
    const hasSavedPairings = pairingsPage.length > 0;
    return hasSavedPairings ? pairingsPage[0]?.debates || [] : [];
  }, [existingPairings]);

  const addToUndoStack = useCallback((action: MoveAction) => {
    const actionWithState = {
      ...action,
      pairingsSnapshot: [...draftPairings]
    };

    setUndoStack(prev => [...prev.slice(-19), actionWithState]);
    setRedoStack([]);
  }, [draftPairings]);

  const saveDraft = useCallback((newPairings: PairingDraft[], immediate = false) => {
    if (!canEditPairings || (!autoSaveDrafts && !immediate)) return;

    const draft = {
      pairings: newPairings,
      timestamp: Date.now(),
      round: currentRound,
      tournament_id: tournament._id,
      method: pairingMethod,
    };

    if (draftSaveTimeoutRef.current) {
      clearTimeout(draftSaveTimeoutRef.current);
    }

    const saveAction = () => {
      localStorage.setItem(`pairings_draft_${tournament._id}_${currentRound}`, JSON.stringify(draft));
      setLastSavedTimestamp(Date.now());
    };

    if (immediate) {
      saveAction();
    } else {
      draftSaveTimeoutRef.current = setTimeout(saveAction, 1000);
    }
  }, [canEditPairings, autoSaveDrafts, currentRound, tournament._id, pairingMethod]);

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasNextPage) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setIsLoadingMore(false);
    }, 1000);
  }, [isLoadingMore, hasNextPage]);

  const InputDialog = () => {
    const [inputValue, setInputValue] = useState("");

    useEffect(() => {
      if (inputDialog.open) {
        setInputValue("");
      }
    }, [inputDialog.open]);

    const handleConfirm = () => {
      inputDialog.onConfirm(inputValue);
      setInputDialog(prev => ({ ...prev, open: false }));
    };

    const handleCancel = () => {
      inputDialog.onCancel?.();
      setInputDialog(prev => ({ ...prev, open: false }));
    };

    return (
      <Dialog open={inputDialog.open} onOpenChange={(open) =>
        setInputDialog(prev => ({ ...prev, open }))
      }>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{inputDialog.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">{inputDialog.description}</div>
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={inputDialog.placeholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
                if (e.key === 'Escape') handleCancel();
              }}
              autoFocus
            />
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={!inputValue.trim()}>
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  useEffect(() => {
    const hasSavedPairings = currentDebates.length > 0;

    if (hasSavedPairings) {
      setIsDraft(false);
      setDraftPairings([]);
      setUndoStack([]);
      setRedoStack([]);
      localStorage.removeItem(`pairings_draft_${tournament._id}_${currentRound}`);
    } else if (canEditPairings) {
      const savedDraft = localStorage.getItem(`pairings_draft_${tournament._id}_${currentRound}`);
      if (savedDraft) {
        try {
          const draft = JSON.parse(savedDraft);
          if (draft.round === currentRound) {
            setDraftPairings(draft.pairings || []);
            setLastSavedTimestamp(draft.timestamp);
            setIsDraft(true);
          } else {
            localStorage.removeItem(`pairings_draft_${tournament._id}_${currentRound}`);
            setDraftPairings([]);
            setLastSavedTimestamp(null);
            setIsDraft(false);
          }
        } catch (error) {
          console.error('Error loading draft:', error);
          toast.error('Failed to load draft pairings');
          setDraftPairings([]);
          setLastSavedTimestamp(null);
          setIsDraft(false);
        }
      } else {
        setDraftPairings([]);
        setLastSavedTimestamp(null);
        setIsDraft(false);
      }
    }
  }, [tournament._id, currentRound, currentDebates, canEditPairings]);

  const stats = useMemo(() => {
    const pairings = isDraft ? draftPairings : currentDebates;
    const totalDebates = pairings.filter((p: any) => !p.is_bye_round && !p.is_public_speaking).length;
    const byeRounds = pairings.filter((p: any) => p.is_bye_round || p.is_public_speaking).length;
    const conflicts = pairings.reduce((sum: number, p: any) => sum + (p.conflicts?.length || p.pairing_conflicts?.length || 0), 0);
    const errors = pairings.reduce((sum: number, p: any) => {
      const conflictList = p.conflicts || p.pairing_conflicts || [];
      return sum + conflictList.filter((c: any) => c.severity === 'error').length;
    }, 0);

    return { totalDebates, byeRounds, conflicts, errors };
  }, [isDraft, draftPairings, currentDebates]);

  const getFoldRounds = useCallback(() => {
    if (pairingMethod === 'swiss') return [];
    if (pairingMethod === 'fold') return Array.from({ length: tournament.prelim_rounds }, (_, i) => i + 1);

    const maxFoldRounds = Math.min(5, tournament.prelim_rounds);
    return Array.from({ length: maxFoldRounds }, (_, i) => i + 1);
  }, [pairingMethod, tournament.prelim_rounds]);

  const canGenerateAllFoldRounds = useMemo(() => {
    const foldRounds = getFoldRounds();
    return foldRounds.length > 1 && foldRounds.includes(currentRound);
  }, [getFoldRounds, currentRound]);

  const generateAllFoldRounds = useCallback(async () => {
    if (!canGeneratePairings || !pairingData || !pairingData.teams || !pairingData.judges) {
      toast.error("Tournament data not loaded");
      return;
    }

    const foldRounds = getFoldRounds();
    if (foldRounds.length <= 1) {
      toast.error("Cannot generate all rounds: only one fold round available");
      return;
    }

    setConfirmDialog({
      open: true,
      title: `Generate All Fold Rounds (${foldRounds.join(', ')})`,
      description: `This will generate pairings for ${foldRounds.length} rounds at once using the fold system. This cannot be undone. Continue?`,
      onConfirm: async () => {
        setIsBulkGenerating(true);
        setBulkGenerationProgress({ current: 0, total: foldRounds.length });

        try {
          const teams = pairingData.teams.map((team: any) => ({
            _id: team._id,
            name: team.name,
            school_id: team.school_id,
            school_name: team.school_name,
            side_history: [],
            opponents_faced: [],
            wins: team.wins || 0,
            total_points: team.total_points || 0,
            bye_rounds: [],
            performance_score: team.performance_score || 0,
            cross_tournament_performance: team.cross_tournament_performance || {
              total_tournaments: 0,
              total_wins: 0,
              total_debates: 0,
              avg_performance: 0,
            },
          }));

          const judges = pairingData.judges.map((judge: any) => ({
            _id: judge._id,
            name: judge.name,
            school_id: judge.school_id,
            school_name: judge.school_name,
            total_debates_judged: judge.total_debates_judged || 0,
            elimination_debates: judge.elimination_debates || 0,
            avg_feedback_score: judge.avg_feedback_score || 3.0,
            conflicts: judge.conflicts || [],
            assignments_this_tournament: judge.assignments_this_tournament || 0,
            cross_tournament_stats: judge.cross_tournament_stats || {
              total_tournaments: 0,
              total_debates: 0,
              total_elimination_debates: 0,
              avg_feedback: 3.0,
              consistency_score: 1.0,
            },
          }));

          const allRoundPairings: { round: number; pairings: any[] }[] = [];

          for (let i = 0; i < foldRounds.length; i++) {
            const roundNumber = foldRounds[i];
            setBulkGenerationProgress({ current: i + 1, total: foldRounds.length });

            const result = generateTournamentPairings(teams, judges, tournament, roundNumber);

            result.forEach(pairing => {
              if (!pairing.is_bye_round) {
                const propTeam = teams.find(t => t._id === pairing.proposition_team_id) as any;

                const oppTeam = teams.find(t => t._id === pairing.opposition_team_id) as any

                if (propTeam && oppTeam) {
                  propTeam.side_history.push('proposition');
                  propTeam.opponents_faced.push(oppTeam._id);

                  oppTeam.side_history.push('opposition');
                  oppTeam.opponents_faced.push(propTeam._id);
                }
              } else {
                const byeTeam = teams.find(t =>
                  t._id === pairing.proposition_team_id || t._id === pairing.opposition_team_id
                ) as any
                if (byeTeam) {
                  if (pairing.proposition_team_id === byeTeam._id) {
                    byeTeam.side_history.push('proposition');
                  } else {
                    byeTeam.side_history.push('opposition');
                  }
                  byeTeam.bye_rounds.push(roundNumber);
                }
              }
            });

            allRoundPairings.push({
              round: roundNumber,
              pairings: result.map(pairing => ({
                room_name: pairing.room_name,
                proposition_team_id: pairing.proposition_team_id,
                opposition_team_id: pairing.opposition_team_id,
                judges: pairing.judges,
                head_judge_id: pairing.head_judge_id,
                is_bye_round: pairing.is_bye_round,
              }))
            });
          }

          for (const { round, pairings } of allRoundPairings) {
            try {
              await savePairingsMutation({
                token,
                tournament_id: tournament._id,
                round_number: round,
                pairings,
              });
            } catch (error: any) {
              throw new Error(`Failed to save Round ${round}: ${error.message}`);
            }
          }

          foldRounds.forEach(round => {
            localStorage.removeItem(`pairings_draft_${tournament._id}_${round}`);
          });

          setIsDraft(false);
          setDraftPairings([]);
          setUndoStack([]);
          setRedoStack([]);

          toast.success(`Generated and saved ${foldRounds.length} rounds!`, {
            description: "All fold rounds have been created and participants notified",
          });

        } catch (error: any) {
          toast.error("Failed to generate all rounds", {
            description: error.message || "An unexpected error occurred",
          });
        } finally {
          setIsBulkGenerating(false);
          setBulkGenerationProgress({ current: 0, total: 0 });
        }
      },
      variant: "default",
      confirmText: `Generate ${foldRounds.length} Rounds`,
    });
  }, [canGeneratePairings, pairingData, getFoldRounds, tournament, token, savePairingsMutation]);

  const generatePairings = useCallback(async () => {
    if (!canGeneratePairings || !pairingData || !pairingData.teams || !pairingData.judges) {
      if (!canGeneratePairings) {
        toast.error("You don't have permission to generate pairings");
        return;
      }
      toast.error("Tournament data not loaded");
      return;
    }

    const isElimination = currentRound > tournament.prelim_rounds;

    if (isElimination) {
      if (!prelimsCheck || !prelimsCheck.all_complete) {
        toast.error("Cannot generate elimination pairings", {
          description: `All preliminary rounds must be completed first. ${prelimsCheck?.completed_prelims || 0}/${prelimsCheck?.total_prelims || tournament.prelim_rounds} completed.`
        });
        return;
      }
    }

    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      const previousAction: MoveAction = {
        type: 'generate',
        oldValue: draftPairings,
        newValue: [],
        description: `Generate pairings for Round ${currentRound}`,
        timestamp: Date.now(),
        pairingsSnapshot: [...draftPairings],
        roundNumber: currentRound
      };
      addToUndoStack(previousAction);

      setGenerationProgress(25);

      const method = isElimination
        ? 'swiss'
        : (pairingMethod === 'auto'
          ? (currentRound <= 5 ? 'fold' : 'swiss')
          : pairingMethod);

      if (isElimination) {
        toast.info("Generating elimination pairings", {
          description: "Using performance-based matching for elimination rounds",
        });
      } else if (currentRound > 5 && method === 'swiss') {
        toast.info("Switching to Swiss system for round 6+", {
          description: "The fold system is limited to 5 rounds. Using Swiss pairing for better matchups.",
        });
      }

      setGenerationProgress(50);

      const teams = pairingData.teams.map((team: any) => ({
        _id: team._id,
        name: team.name,
        school_id: team.school_id,
        school_name: team.school_name,
        side_history: team.side_history || [],
        opponents_faced: team.opponents_faced || [],
        wins: team.wins || 0,
        total_points: team.total_points || 0,
        bye_rounds: team.bye_rounds || [],
        performance_score: team.performance_score || 0,
        cross_tournament_performance: team.cross_tournament_performance || {
          total_tournaments: 0,
          total_wins: 0,
          total_debates: 0,
          avg_performance: 0,
        },
      }));

      const judges = pairingData.judges.map((judge: any) => ({
        _id: judge._id,
        name: judge.name,
        school_id: judge.school_id,
        school_name: judge.school_name,
        total_debates_judged: judge.total_debates_judged || 0,
        elimination_debates: judge.elimination_debates || 0,
        avg_feedback_score: judge.avg_feedback_score || 3.0,
        conflicts: judge.conflicts || [],
        assignments_this_tournament: judge.assignments_this_tournament || 0,
        cross_tournament_stats: judge.cross_tournament_stats || {
          total_tournaments: 0,
          total_debates: 0,
          total_elimination_debates: 0,
          avg_feedback: 3.0,
          consistency_score: 1.0,
        },
      }));

      setGenerationProgress(75);

      const result = generateTournamentPairings(teams, judges, tournament, currentRound);

      setGenerationProgress(100);

      const newPairings: PairingDraft[] = result.map(pairing => ({
        room_name: pairing.room_name,
        proposition_team_id: pairing.proposition_team_id,
        opposition_team_id: pairing.opposition_team_id,
        judges: pairing.judges,
        head_judge_id: pairing.head_judge_id,
        is_bye_round: pairing.is_bye_round,
        conflicts: pairing.conflicts,
        quality_score: pairing.quality_score,
      }));

      setDraftPairings(newPairings);
      setIsDraft(true);
      saveDraft(newPairings, true);

      toast.success(`Generated ${result.length} pairings`, {
        description: `${stats.conflicts} conflicts detected`,
      });

    } catch (error: any) {
      toast.error("Failed to generate pairings", {
        description: error.message || "An unexpected error occurred",
      });
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  }, [canGeneratePairings, pairingData, draftPairings, currentRound, pairingMethod, tournament, stats, prelimsCheck, addToUndoStack, saveDraft]);

  const convertToDraft = useCallback(() => {
    if (!canEditPairings || isDraft || currentDebates.length === 0) return;

    setConfirmDialog({
      open: true,
      title: "Edit Saved Pairings",
      description: "This will convert the saved pairings to draft mode for editing. You'll need to save them again after making changes.",
      onConfirm: () => {
        const convertedPairings: PairingDraft[] = currentDebates.map((debate: any) => ({
          room_name: debate.room_name || '',
          proposition_team_id: debate.proposition_team_id,
          opposition_team_id: debate.opposition_team_id,
          judges: debate.judges || [],
          head_judge_id: debate.head_judge_id,
          is_bye_round: debate.is_public_speaking || false,
          conflicts: debate.pairing_conflicts || [],
          quality_score: 85,
        }));

        const convertAction: MoveAction = {
          type: 'generate',
          oldValue: [],
          newValue: convertedPairings,
          description: `Converted saved pairings to draft for editing`,
          timestamp: Date.now(),
          pairingsSnapshot: [],
          roundNumber: currentRound
        };
        addToUndoStack(convertAction);

        setDraftPairings(convertedPairings);
        setIsDraft(true);
        saveDraft(convertedPairings, true);

        toast.success("Pairings converted to draft mode", {
          description: "You can now edit the pairings. Remember to save when done.",
        });
      },
      confirmText: "Convert to Draft",
    });
  }, [canEditPairings, isDraft, currentDebates, addToUndoStack, saveDraft, currentRound]);

  const savePairings = useCallback(async () => {
    if (!canSavePairings || !savePairingsMutation) {
      toast.error("You don't have permission to save pairings");
      return;
    }

    const finalPairings = draftPairings.map(({ conflicts, quality_score, ...rest }) => rest);

    if (stats.errors > 0) {
      setConfirmDialog({
        open: true,
        title: "Save Pairings with Errors?",
        description: `There are ${stats.errors} errors in the pairings. These may cause issues during the tournament. Save anyway?`,
        onConfirm: async () => {
          try {
            await savePairingsMutation({
              token,
              tournament_id: tournament._id,
              round_number: currentRound,
              pairings: finalPairings,
            });

            setIsDraft(false);
            localStorage.removeItem(`pairings_draft_${tournament._id}_${currentRound}`);
            setUndoStack([]);
            setRedoStack([]);

            toast.success("Pairings saved successfully!", {
              description: "All participants have been notified",
            });
          } catch (error: any) {
            toast.error("Failed to save pairings", {
              description: error.message || "Please try again",
            });
          }
        },
        variant: "destructive",
        confirmText: "Save Anyway",
      });
      return;
    }

    try {
      await savePairingsMutation({
        token,
        tournament_id: tournament._id,
        round_number: currentRound,
        pairings: finalPairings,
      });

      setIsDraft(false);
      localStorage.removeItem(`pairings_draft_${tournament._id}_${currentRound}`);
      setUndoStack([]);
      setRedoStack([]);

      toast.success("Pairings saved successfully!", {
        description: "All participants have been notified",
      });
    } catch (error: any) {
      toast.error("Failed to save pairings", {
        description: error.message || "Please try again",
      });
    }
  }, [canSavePairings, savePairingsMutation, stats.errors, token, tournament._id, currentRound, draftPairings]);

  const handleTeamWithdrawal = async (teamId: Id<"teams">, teamName: string) => {
    if (!canWithdrawTeams || !handleTeamWithdrawalMutation) {
      toast.error("You don't have permission to withdraw teams");
      return;
    }

    setInputDialog({
      open: true,
      title: `Withdraw ${teamName}`,
      description: `Please provide a reason for withdrawing ${teamName} from the tournament:`,
      placeholder: "Enter withdrawal reason...",
      onConfirm: async (reason: string) => {
        try {
          const result = await handleTeamWithdrawalMutation({
            token,
            team_id: teamId,
            reason: reason || undefined,
          });

          toast.success(`${teamName} withdrawn`, {
            description: `${result.affected_debates.length} debates converted to public speaking`,
          });

          setCurrentRound(prev => prev);
        } catch (error: any) {
          toast.error("Failed to withdraw team", {
            description: error.message,
          });
        }
      },
    });
  };

  const undo = useCallback(() => {
    if (!canEditPairings || undoStack.length === 0 || !isDraft) return;

    const lastAction = undoStack[undoStack.length - 1];

    const redoAction: MoveAction = {
      type: lastAction.type,
      debateIndex: lastAction.debateIndex,
      oldValue: lastAction.newValue,
      newValue: lastAction.oldValue,
      description: `Redo: ${lastAction.description}`,
      timestamp: Date.now(),
      pairingsSnapshot: [...draftPairings],
      roundNumber: lastAction.roundNumber
    };

    setRedoStack(prev => [...prev, redoAction]);
    setUndoStack(prev => prev.slice(0, -1));

    const previousState = lastAction.pairingsSnapshot;
    setDraftPairings(previousState);
    saveDraft(previousState, true);

    toast.success("Undone", {
      description: lastAction.description,
      duration: 1500,
    });
  }, [canEditPairings, undoStack, draftPairings, isDraft, saveDraft]);

  const redo = useCallback(() => {
    if (!canEditPairings || redoStack.length === 0 || !isDraft) return;

    const nextAction = redoStack[redoStack.length - 1];

    const undoAction: MoveAction = {
      type: nextAction.type,
      debateIndex: nextAction.debateIndex,
      oldValue: nextAction.newValue,
      newValue: nextAction.oldValue,
      description: nextAction.description.replace('Redo: ', ''),
      timestamp: Date.now(),
      pairingsSnapshot: [...draftPairings],
      roundNumber: nextAction.roundNumber
    };

    setUndoStack(prev => [...prev, undoAction]);
    setRedoStack(prev => prev.slice(0, -1));

    const nextState = nextAction.pairingsSnapshot;
    setDraftPairings(nextState);
    saveDraft(nextState, true);

    toast.success("Redone", {
      description: nextAction.description,
      duration: 1500,
    });
  }, [canEditPairings, redoStack, draftPairings, isDraft, saveDraft]);

  const handleTeamDragStart = useCallback((e: React.DragEvent, team: Team, debateIndex: number, position: string) => {
    if (!canEditPairings || !isDraft) {
      e.preventDefault();
      return;
    }

    setDraggedTeam({ team, fromDebateIndex: debateIndex, fromPosition: position });

    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'team',
      teamId: team._id,
      teamName: team.name,
      fromDebateIndex: debateIndex,
      fromPosition: position
    }));

    e.dataTransfer.effectAllowed = 'move';

    const dragImage = document.createElement('div');
    dragImage.textContent = team.name;
    dragImage.className = 'p-2 bg-primary text-primary-foreground rounded shadow-lg text-sm font-medium';
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);

    setTimeout(() => document.body.removeChild(dragImage), 0);

    document.body.style.cursor = 'grabbing';
  }, [canEditPairings, isDraft]);

  const handleTeamDragEnd = useCallback(() => {
    setDraggedTeam(null);
    setDropZoneActive(null);
    document.body.style.cursor = '';
  }, []);

  const handleTeamDragOver = useCallback((e: React.DragEvent, debateIndex: number, position: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedTeam && canEditPairings && isDraft) {
      const dropTarget = `${debateIndex}-${position}`;
      setDropZoneActive(dropTarget);
    }
  }, [draggedTeam, canEditPairings, isDraft]);

  const handleTeamDragLeave = useCallback((e: React.DragEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDropZoneActive(null);
    }
  }, []);

  const handleTeamDrop = useCallback(async (e: React.DragEvent, toDebateIndex: number, toPosition: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedTeam || !isDraft || !canEditPairings) return;

    if (draggedTeam.fromDebateIndex === toDebateIndex && draggedTeam.fromPosition === toPosition) {
      setDraggedTeam(null);
      setDropZoneActive(null);
      return;
    }

    setIsRecalculating(true);

    try {
      const moveAction: MoveAction = {
        type: 'move_team',
        debateIndex: toDebateIndex,
        oldValue: {
          from: { index: draggedTeam.fromDebateIndex, position: draggedTeam.fromPosition },
          to: { index: toDebateIndex, position: toPosition }
        },
        newValue: draggedTeam.team.name,
        description: `Moved ${draggedTeam.team.name} to ${toPosition} in debate ${toDebateIndex + 1}`,
        timestamp: Date.now(),
        pairingsSnapshot: [...draftPairings],
        roundNumber: currentRound
      };
      addToUndoStack(moveAction);

      const newPairings = [...draftPairings];

      const destTeamId = toPosition === 'prop'
        ? newPairings[toDebateIndex].proposition_team_id
        : newPairings[toDebateIndex].opposition_team_id;

      if (draggedTeam.fromPosition === 'prop') {
        newPairings[draggedTeam.fromDebateIndex].proposition_team_id = destTeamId;
      } else {
        newPairings[draggedTeam.fromDebateIndex].opposition_team_id = destTeamId;
      }

      if (toPosition === 'prop') {
        newPairings[toDebateIndex].proposition_team_id = draggedTeam.team._id;
      } else {
        newPairings[toDebateIndex].opposition_team_id = draggedTeam.team._id;
      }

      const affectedDebates = new Set([draggedTeam.fromDebateIndex, toDebateIndex]);
      affectedDebates.forEach(index => {
        if (newPairings[index] && pairingData) {
          newPairings[index].conflicts = validatePairing(
            pairingData.teams,
            pairingData.judges,
            newPairings[index].proposition_team_id,
            newPairings[index].opposition_team_id,
            newPairings[index].judges
          );
        }
      });

      setDraftPairings(newPairings);
      saveDraft(newPairings);

      toast.success(`Team moved successfully`, {
        description: moveAction.description,
        duration: 2000,
      });

    } catch (error) {
      console.error('Error during team drop:', error);
      toast.error("Failed to move team", {
        description: "Please try again",
      });
    } finally {
      setIsRecalculating(false);
      setDraggedTeam(null);
      setDropZoneActive(null);
    }
  }, [draggedTeam, isDraft, canEditPairings, draftPairings, pairingData, saveDraft, addToUndoStack, currentRound]);

  const swapSides = useCallback(async (debateIndex: number) => {
    if (!isDraft || !canEditPairings) return;

    setIsRecalculating(true);

    try {
      const moveAction: MoveAction = {
        type: 'swap_sides',
        debateIndex,
        oldValue: {
          prop: draftPairings[debateIndex].proposition_team_id,
          opp: draftPairings[debateIndex].opposition_team_id
        },
        newValue: {
          prop: draftPairings[debateIndex].opposition_team_id,
          opp: draftPairings[debateIndex].proposition_team_id
        },
        description: `Swapped sides in debate ${debateIndex + 1}`,
        timestamp: Date.now(),
        pairingsSnapshot: [...draftPairings],
        roundNumber: currentRound
      };

      addToUndoStack(moveAction);

      const newPairings = [...draftPairings];
      const pairing = newPairings[debateIndex];

      [pairing.proposition_team_id, pairing.opposition_team_id] =
        [pairing.opposition_team_id, pairing.proposition_team_id];

      if (pairingData) {
        pairing.conflicts = validatePairing(
          pairingData.teams,
          pairingData.judges,
          pairing.proposition_team_id,
          pairing.opposition_team_id,
          pairing.judges
        );
      }

      setDraftPairings(newPairings);
      saveDraft(newPairings);

      toast.success("Swapped team sides", {
        description: moveAction.description,
        duration: 2000,
      });

    } catch (error) {
      console.error('Error during swap:', error);
      toast.error("Failed to swap sides", {
        description: "Please try again",
      });
    } finally {
      setIsRecalculating(false);
    }
  }, [isDraft, canEditPairings, draftPairings, pairingData, saveDraft, addToUndoStack, currentRound]);

  const updateRoomName = useCallback((debateIndex: number, newName: string) => {
    if (!isDraft || !canEditRoomNames) return;

    const oldName = draftPairings[debateIndex].room_name;

    if (oldName === newName) return;

    const moveAction: MoveAction = {
      type: 'update_room',
      debateIndex,
      oldValue: oldName,
      newValue: newName,
      description: `Renamed room from "${oldName || 'Untitled'}" to "${newName}"`,
      timestamp: Date.now(),
      pairingsSnapshot: [...draftPairings],
      roundNumber: currentRound
    };
    addToUndoStack(moveAction);

    const newPairings = [...draftPairings];
    newPairings[debateIndex].room_name = newName;

    setDraftPairings(newPairings);
    saveDraft(newPairings);
  }, [isDraft, canEditRoomNames, draftPairings, addToUndoStack, saveDraft, currentRound]);

  const updateDebateJudges = useCallback(async (debateIndex: number, newJudges: Id<"users">[], newHeadJudge?: Id<"users">) => {
    if (!isDraft || !canEditJudges) return;

    const debate = draftPairings[debateIndex];
    if (!debate.is_bye_round && newJudges.length === 0) {
      toast.error("Cannot remove all judges", {
        description: "Debates must have at least one judge",
      });
      return;
    }

    setIsRecalculating(true);

    try {
      const moveAction: MoveAction = {
        type: 'update_judges',
        debateIndex,
        oldValue: { judges: debate.judges, headJudge: debate.head_judge_id },
        newValue: { judges: newJudges, headJudge: newHeadJudge },
        description: `Updated judges in debate ${debateIndex + 1}`,
        timestamp: Date.now(),
        pairingsSnapshot: [...draftPairings],
        roundNumber: currentRound
      };
      addToUndoStack(moveAction);

      const newPairings = [...draftPairings];
      newPairings[debateIndex].judges = newJudges;

      if (newJudges.length === 0) {
        newPairings[debateIndex].head_judge_id = undefined;
      } else if (newHeadJudge && newJudges.includes(newHeadJudge)) {
        newPairings[debateIndex].head_judge_id = newHeadJudge;
      } else {
        newPairings[debateIndex].head_judge_id = newJudges[0];
      }

      if (pairingData) {
        newPairings[debateIndex].conflicts = validatePairing(
          pairingData.teams,
          pairingData.judges,
          newPairings[debateIndex].proposition_team_id,
          newPairings[debateIndex].opposition_team_id,
          newJudges
        );
      }

      setDraftPairings(newPairings);
      saveDraft(newPairings);

      toast.success("Updated judges", {
        description: moveAction.description,
        duration: 2000,
      });

    } finally {
      setIsRecalculating(false);
    }
  }, [isDraft, canEditJudges, draftPairings, pairingData, saveDraft, addToUndoStack, currentRound]);

  const updateSavedPairing = async (debateId: Id<"debates">, updates: any) => {
    if (!canEditPairings || !updatePairingMutation) {
      toast.error("You don't have permission to update pairings");
      return;
    }

    try {
      await updatePairingMutation({
        token,
        debate_id: debateId,
        updates,
      });

      toast.success("Pairing updated", {
        description: "Changes saved successfully",
      });
    } catch (error: any) {
      toast.error("Failed to update pairing", {
        description: error.message,
      });
    }
  };

  const clearDraft = useCallback(() => {
    if (!canEditPairings || !isDraft || draftPairings.length === 0) return;

    setConfirmDialog({
      open: true,
      title: "Clear Draft Pairings",
      description: "Are you sure you want to clear all draft pairings? This action cannot be undone.",
      onConfirm: () => {
        const clearAction: MoveAction = {
          type: 'clear',
          oldValue: draftPairings.length,
          newValue: 0,
          description: `Cleared ${draftPairings.length} draft pairings`,
          timestamp: Date.now(),
          pairingsSnapshot: [...draftPairings],
          roundNumber: currentRound
        };
        addToUndoStack(clearAction);

        setDraftPairings([]);
        setRedoStack([]);
        localStorage.removeItem(`pairings_draft_${tournament._id}_${currentRound}`);
        setLastSavedTimestamp(null);

        toast.success("Draft cleared", {
          description: "All draft pairings have been cleared",
          duration: 2000,
        });
      },
      variant: "destructive",
      confirmText: "Clear Draft",
    });
  }, [canEditPairings, isDraft, tournament._id, currentRound, draftPairings, addToUndoStack]);

  const handleJudgeDragStart = useCallback((e: React.DragEvent, judge: Judge, debateIndex: number) => {
    if (!canEditJudges || !isDraft) {
      e.preventDefault();
      return;
    }

    setDraggedJudge({ judge, fromDebateIndex: debateIndex });

    e.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'judge',
      judgeId: judge._id,
      fromDebateIndex: debateIndex
    }));

    e.dataTransfer.effectAllowed = 'move';
    document.body.style.cursor = 'grabbing';
  }, [canEditJudges, isDraft]);

  const handleJudgeDragEnd = useCallback(() => {
    setDraggedJudge(null);
    setJudgeDropZoneActive(null);
    document.body.style.cursor = '';
  }, []);

  const handleJudgeDragOver = useCallback((e: React.DragEvent, debateIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedJudge && canEditJudges && isDraft) {
      setJudgeDropZoneActive(debateIndex);
    }
  }, [draggedJudge, canEditJudges, isDraft]);

  const handleJudgeDragLeave = useCallback((e: React.DragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setJudgeDropZoneActive(null);
    }
  }, []);

  const handleJudgeDrop = useCallback(async (e: React.DragEvent, toDebateIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedJudge || !isDraft || !canEditJudges) return;

    if (draggedJudge.fromDebateIndex === toDebateIndex) return;

    setIsRecalculating(true);

    try {
      const moveAction: MoveAction = {
        type: 'update_judges',
        debateIndex: toDebateIndex,
        oldValue: draggedJudge.fromDebateIndex,
        newValue: toDebateIndex,
        description: `Moved judge ${draggedJudge.judge.name} from debate ${draggedJudge.fromDebateIndex + 1} to debate ${toDebateIndex + 1}`,
        timestamp: Date.now(),
        pairingsSnapshot: [...draftPairings],
        roundNumber: currentRound
      };
      addToUndoStack(moveAction);

      const newPairings = [...draftPairings];

      const sourceDebate = newPairings[draggedJudge.fromDebateIndex];
      sourceDebate.judges = sourceDebate.judges.filter(id => id !== draggedJudge.judge._id);
      if (sourceDebate.head_judge_id === draggedJudge.judge._id) {
        sourceDebate.head_judge_id = sourceDebate.judges[0] || undefined;
      }

      const destDebate = newPairings[toDebateIndex];
      if (!destDebate.judges.includes(draggedJudge.judge._id)) {
        destDebate.judges = [...destDebate.judges, draggedJudge.judge._id];
        if (!destDebate.head_judge_id) {
          destDebate.head_judge_id = draggedJudge.judge._id;
        }
      }

      [draggedJudge.fromDebateIndex, toDebateIndex].forEach(index => {
        if (newPairings[index] && pairingData) {
          newPairings[index].conflicts = validatePairing(
            pairingData.teams,
            pairingData.judges,
            newPairings[index].proposition_team_id,
            newPairings[index].opposition_team_id,
            newPairings[index].judges
          );
        }
      });

      setDraftPairings(newPairings);
      saveDraft(newPairings);

      toast.success(`Moved judge ${draggedJudge.judge.name}`, {
        description: moveAction.description,
        duration: 2000,
      });

    } finally {
      setIsRecalculating(false);
      setDraggedJudge(null);
      setJudgeDropZoneActive(null);
    }
  }, [draggedJudge, isDraft, canEditJudges, draftPairings, pairingData, saveDraft, addToUndoStack, currentRound]);

  React.useEffect(() => {
    if (!canUseKeyboardShortcuts || !isDraft) return;

    const handleKeyboard = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'z':
            e.preventDefault();
            undo();
            break;
          case 'y':
            e.preventDefault();
            redo();
            break;
          case 's':
            e.preventDefault();
            savePairings();
            break;
          case 'g':
            e.preventDefault();
            generatePairings();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [canUseKeyboardShortcuts, isDraft, undo, redo, savePairings, generatePairings]);

  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, [currentRound, isDraft]);

  const getTeamById = (teamId?: string): Team | undefined => {
    if (!teamId || !pairingData) return undefined;
    return pairingData.teams.find((t: Team) => t._id === teamId);
  };

  const getJudgeById = (judgeId?: string): Judge | undefined => {
    if (!judgeId || !pairingData) return undefined;
    return pairingData.judges.find((j: Judge) => j._id === judgeId);
  };

  const LoadingSkeleton = () => (
    <div className="space-y-2">
      <Card>
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

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
      </Card>
    </div>
  );

  const displayPairings = isDraft ?
    draftPairings.map((p, i) => ({
      ...p,
      _id: `draft-${i}`,
      proposition_team: getTeamById(p.proposition_team_id),
      opposition_team: getTeamById(p.opposition_team_id),
      judge_details: p.judges.map(jId => getJudgeById(jId)).filter(Boolean) as Judge[],
      head_judge: getJudgeById(p.head_judge_id),
      is_public_speaking: p.is_bye_round,
      pairing_conflicts: p.conflicts,
    })) :
    currentDebates;

  if (!canViewPairings || !pairingData) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-2">
      <ConfirmDialog
        {...confirmDialog}
        onOpenChange={(open) =>
          setConfirmDialog((prev) => ({ ...prev, open }))
        }
      />

      <InputDialog />

      <Card className="">
        <div className="flex flex-col lg:flex-row lg:items-center bg-brown rounded-t-md lg:justify-between gap-4 p-3">
          <div>
            <h2 className="text-xl text-white font-bold flex items-center gap-2">
              Tournament Pairings
            </h2>
            <div className="flex items-center gap-4 text-xs text-gray-300">
              <span>Round {currentRound} • {displayPairings.length} pairings</span>
              {isDraft && canEditPairings && (
                <Badge variant="secondary" className="text-primary border-primary">
                  <Edit3 className="h-3 w-3 mr-1" />
                  Draft
                </Badge>
              )}
              {lastSavedTimestamp && canEditPairings && (
                <span className="text-xs">
                  Last saved: {new Date(lastSavedTimestamp).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>

          {canEditPairings && (
            <div className="flex items-center gap-3 flex-wrap">
              <Select
                value={currentRound.toString()}
                onValueChange={(value) => {
                  const newRound = Number(value);

                  if (isDraft && draftPairings.length > 0 && newRound !== currentRound) {
                    setConfirmDialog({
                      open: true,
                      title: "Switch Rounds",
                      description: "You have unsaved draft pairings. Switching rounds will clear your current draft. Continue?",
                      onConfirm: () => {
                        setDraftPairings([]);
                        setUndoStack([]);
                        setRedoStack([]);
                        localStorage.removeItem(`pairings_draft_${tournament._id}_${currentRound}`);
                        setLastSavedTimestamp(null);
                        setIsDraft(false);
                        setCurrentRound(newRound);
                      },
                      onCancel: () => {},
                      variant: "destructive",
                      confirmText: "Switch Anyway",
                    });
                    return;
                  }

                  setCurrentRound(newRound);
                }}
              >
                <SelectTrigger className="w-24 h-8 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(
                    { length: tournament.prelim_rounds + tournament.elimination_rounds },
                    (_, i) => {
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

                      return (
                        <SelectItem key={roundNumber} value={roundNumber.toString()}>
                          {label}
                        </SelectItem>
                      );
                    }
                  )}
                </SelectContent>
              </Select>

              <Select value={pairingMethod} onValueChange={(value: 'fold' | 'swiss' | 'auto') => setPairingMethod(value)}>
                <SelectTrigger className="w-18 h-8 bg-background ">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="fold">Fold</SelectItem>
                  <SelectItem value="swiss">Swiss</SelectItem>
                </SelectContent>
              </Select>

              {!isDraft && currentDebates.length > 0 && canEditPairings && (
                <Button
                  onClick={convertToDraft}
                  variant="outline"
                >
                  <Edit3 className="h-4 w-4" />
                  <span className="hidden custom:block ml-1">Edit</span>
                </Button>
              )}

              {canGeneratePairings && (
                <Button
                  onClick={generatePairings}
                  disabled={isGenerating || isBulkGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="hidden custom:block"> {generationProgress}% </span>
                    </>
                  ) : (
                    <>
                      <Shuffle className="h-4 w-4" />
                      <span className="hidden custom:block"> Generate </span>
                    </>
                  )}
                </Button>
              )}

              {canGenerateAllFoldRounds && !isDraft && !isBulkGenerating && (
                <Button
                  onClick={generateAllFoldRounds}
                  disabled={isGenerating}
                >
                  <Calendar className="h-4 w-4" />
                  <span className="hidden custom:block ml-1">All Fold</span>
                </Button>
              )}

              {isDraft && canSavePairings && (
                <Button onClick={savePairings} variant="default" disabled={isRecalculating}>
                  {isRecalculating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="hidden custom:block">Recalculating...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span className="hidden custom:block">Save Pairings </span>
                    </>
                  )}
                </Button>
              )}

              {displayPairings.length > 0 && (
                <SharePairingsDialog
                  pairings={displayPairings}
                  tournament={tournament}
                  roundNumber={currentRound}
                />
              )}

              {canAccessSettings && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Pairing Settings</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="auto-save">Auto-save drafts</Label>
                        <Switch
                          id="auto-save"
                          checked={autoSaveDrafts}
                          onCheckedChange={setAutoSaveDrafts}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="show-conflicts">Show conflicts</Label>
                        <Switch
                          id="show-conflicts"
                          checked={showConflicts}
                          onCheckedChange={setShowConflicts}
                        />
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          )}
        </div>

        {displayPairings.length > 0 && (
          <div className="p-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search teams, judges, or rooms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        )}

        
        {displayPairings.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 custom:grid-cols-4 gap-4 p-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-sky-500" />
                  <span className="text-sm font-medium">Debates</span>
                </div>
                <div className="text-xl text-primary font-bold mt-1">{stats.totalDebates}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Public Speaking</span>
                </div>
                <div className="text-xl text-primary font-bold mt-1">{stats.byeRounds}</div>
              </CardContent>
            </Card>

            {canViewConflicts && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium">Conflicts</span>
                  </div>
                  <div className="text-xl text-primary font-bold mt-1">{stats.conflicts}</div>
                </CardContent>
              </Card>
            )}

            {canViewConflicts && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium">Errors</span>
                  </div>
                  <div className="text-xl text-primary font-bold mt-1">{stats.errors}</div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        
        {canEditPairings && isDraft && displayPairings.length > 0 && (
          <Card className="mx-4 mb-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={clearDraft}
                    disabled={draftPairings.length === 0}
                    size="sm"
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="h-4 w-4 mr-1" />
                    <span className="hidden md:block">Clear</span>
                  </Button>

                  {canViewHistory && undoStack.length > 0 && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={undoStack.length === 0}>
                          <RefreshCw className="h-4 w-4 mr-1" />
                          <span className="hidden md:block">History ({undoStack.length})</span>
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Action History</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="h-96">
                          <div className="space-y-2">
                            {undoStack.length === 0 ? (
                              <div className="text-center text-muted-foreground py-8">
                                No actions performed yet
                              </div>
                            ) : (
                              undoStack.slice().reverse().map((action, index) => (
                                <div key={action.timestamp} className="flex items-center gap-3 p-3 border rounded">
                                  <div className="text-sm font-mono bg-muted px-2 py-1 rounded min-w-[80px]">
                                    {new Date(action.timestamp).toLocaleTimeString()}
                                  </div>
                                  <div className="flex-1">
                                    <div className="text-sm font-medium">{action.description}</div>
                                    <div className="text-xs text-muted-foreground">
                                      Type: {action.type.replace('_', ' ')}
                                      {action.debateIndex !== undefined && ` • Debate: ${action.debateIndex + 1}`}
                                      {action.roundNumber && ` • Round: ${action.roundNumber}`}
                                    </div>
                                  </div>
                                  <Badge variant="outline" className="text-xs">
                                    {action.type}
                                  </Badge>
                                  {index === 0 && (
                                    <Badge variant="default" className="text-xs">
                                      Latest
                                    </Badge>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </ScrollArea>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {canViewStats && pairingStats && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Info className="h-4 w-4 mr-1" />
                          <span className="hidden md:block">Stats</span>
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl">
                        <DialogHeader>
                          <DialogTitle>Tournament Statistics</DialogTitle>
                        </DialogHeader>
                        <Tabs defaultValue="overview">
                          <TabsList>
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="quality">Quality</TabsTrigger>
                            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
                          </TabsList>

                          <TabsContent value="overview" className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <h4 className="font-medium mb-2">Tournament Progress</h4>
                                <div className="space-y-1 text-sm">
                                  <div>Total Rounds: {pairingStats.total_rounds}</div>
                                  <div>Total Teams: {pairingStats.total_teams}</div>
                                  <div>Total Debates: {pairingStats.total_debates}</div>
                                  <div>Public Speaking: {pairingStats.public_speaking_rounds}</div>
                                </div>
                              </div>
                              <div>
                                <h4 className="font-medium mb-2">Quality Metrics</h4>
                                <div className="space-y-1 text-sm">
                                  <div>Repeat Matchups: {pairingStats.quality_metrics?.repeat_matchups || 0}</div>
                                  <div>Side Imbalances: {pairingStats.quality_metrics?.side_imbalances || 0}</div>
                                  <div>School Conflicts: {pairingStats.quality_metrics?.school_conflicts || 0}</div>
                                  <div>Judge Overloads: {pairingStats.quality_metrics?.judge_overloads || 0}</div>
                                </div>
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="quality">
                            <div className="space-y-4">
                              <div>
                                <h4 className="font-medium mb-2">Overall Quality Score</h4>
                                <div className="text-3xl font-bold">
                                  {pairingStats.quality_metrics?.total_quality_score || 0}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Lower scores indicate better quality
                                </div>
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="recommendations">
                            <div className="space-y-2">
                              {pairingStats.recommendations?.map((rec, index) => (
                                <Alert key={index}>
                                  <Info className="h-4 w-4" />
                                  <AlertDescription>{rec}</AlertDescription>
                                </Alert>
                              )) || (
                                <div className="text-muted-foreground">No recommendations available</div>
                              )}
                            </div>
                          </TabsContent>
                        </Tabs>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        
        {currentRound > 5 && tournament.prelim_rounds > 5 && (
          <div className="mx-4 mb-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Pairing Method Changed</AlertTitle>
              <AlertDescription>
                Beyond Round 5, the system automatically switches to Swiss pairing to handle team matchups
                more effectively. Teams may face each other again, but performance-based matching is prioritized.
              </AlertDescription>
            </Alert>
          </div>
        )}

        
        <div className="p-4">
          <PairingsTable
            displayPairings={displayPairings}
            isDraft={isDraft}
            canEditPairings={canEditPairings}
            canEditJudges={canEditJudges}
            canEditRoomNames={canEditRoomNames}
            canViewConflicts={canViewConflicts}
            canWithdrawTeams={canWithdrawTeams}
            editingRoom={editingRoom}
            setEditingRoom={setEditingRoom}
            updateRoomName={updateRoomName}
            swapSides={swapSides}
            handleTeamDragStart={handleTeamDragStart}
            handleTeamDragEnd={handleTeamDragEnd}
            handleTeamDragOver={handleTeamDragOver}
            handleTeamDragLeave={handleTeamDragLeave}
            handleTeamDrop={handleTeamDrop}
            dropZoneActive={dropZoneActive}
            draggedTeam={draggedTeam}
            handleTeamWithdrawal={handleTeamWithdrawal}
            updateDebateJudges={updateDebateJudges}
            handleJudgeDragStart={handleJudgeDragStart}
            handleJudgeDragEnd={handleJudgeDragEnd}
            handleJudgeDragOver={handleJudgeDragOver}
            handleJudgeDragLeave={handleJudgeDragLeave}
            handleJudgeDrop={handleJudgeDrop}
            judgeDropZoneActive={judgeDropZoneActive}
            allTournamentVolunteers={allTournamentVolunteers}
            tournament={tournament}
            updateSavedPairing={updateSavedPairing}
            isRecalculating={isRecalculating}
            searchQuery={debouncedSearchQuery}
            pagination={pagination}
            hasNextPage={hasNextPage}
            loadMore={loadMore}
            isLoadingMore={isLoadingMore}
          />
        </div>

        
        {displayPairings.length === 0 && !debouncedSearchQuery && (
          <Card className="m-4">
            <CardContent className="text-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className=" font-medium mb-2">No Pairings Yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                {canGeneratePairings
                  ? `Generate pairings for Round ${currentRound} to get started.
                     ${currentRound <= 5 ? ' Using fold system.' : ' Using Swiss system.'}`
                  : `Pairings for Round ${currentRound} have not been generated yet.`
                }
              </p>
              {canGeneratePairings && (
                <div className="space-y-4">
                  <div className="flex gap-2 justify-center">
                    <Button onClick={generatePairings} disabled={isGenerating || isBulkGenerating}>
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Generating... {generationProgress}%
                        </>
                      ) : (
                        <>
                          <Shuffle className="h-4 w-4 mr-2" />
                          Generate Round {currentRound}
                        </>
                      )}
                    </Button>

                    {canGenerateAllFoldRounds && (
                      <Button
                        onClick={generateAllFoldRounds}
                        disabled={isGenerating || isBulkGenerating}
                      >
                        {isBulkGenerating ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Generating {bulkGenerationProgress.current}/{bulkGenerationProgress.total}
                          </>
                        ) : (
                          <>
                            <Calendar className="h-4 w-4 mr-2" />
                            Generate All Fold Rounds
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {tournament.prelim_rounds <= 5 && currentRound === 1 && canGenerateAllFoldRounds && (
                    <div className="text-xs text-muted-foreground max-w-md mx-auto">
                      💡 With {tournament.prelim_rounds} preliminary rounds, you can generate all rounds at once using the fold system for optimal fairness
                    </div>
                  )}

                  {currentRound > 5 && (
                    <div className="text-xs text-muted-foreground max-w-md mx-auto">
                      ⚡ Using Swiss pairing system - teams with similar performance will be matched
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        
        {(isGenerating || isBulkGenerating) && canGeneratePairings && (
          <div className="fixed inset-0 bg-background/50 backdrop-blur-sm z-50 flex items-center justify-center">
            <Card className="w-96">
              <CardContent className="p-6">
                <div className="text-center space-y-4">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                  <div>
                    <h3 className="font-medium">
                      {isBulkGenerating ? 'Generating All Fold Rounds' : 'Generating Pairings'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {isBulkGenerating
                        ? `Creating pairings for ${bulkGenerationProgress.total} rounds...`
                        : `Creating optimal matchups for Round ${currentRound}...`
                      }
                    </p>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{
                        width: isBulkGenerating
                          ? `${(bulkGenerationProgress.current / bulkGenerationProgress.total) * 100}%`
                          : `${generationProgress}%`
                      }}
                    />
                  </div>
                  <div className="text-sm font-medium">
                    {isBulkGenerating
                      ? `Round ${bulkGenerationProgress.current} of ${bulkGenerationProgress.total}`
                      : `${generationProgress}%`
                    }
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        
        {canUseKeyboardShortcuts && isDraft && displayPairings.length > 0 && (
          <div className="fixed bottom-4 right-4 z-40">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="opacity-70 hover:opacity-100">
                  <Info className="h-3 w-3 mr-1" />
                  Help
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Pairing Controls</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Keyboard Shortcuts</h4>
                    <div className="text-sm space-y-1">
                      <div><kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl+S</kbd> - Save Pairings</div>
                      <div><kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl+G</kbd> - Generate Pairings</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Table Controls</h4>
                    <div className="text-sm space-y-1">
                      <div>• <strong>Drag Team Handle</strong> - Move teams between debates and sides</div>
                      <div>• <strong>Drag Judge Badge</strong> - Move judges between debates</div>
                      <div>• <strong>Click Room Name</strong> - Edit room name</div>
                      <div>• <strong>Click Swap Button</strong> - Switch team sides</div>
                      <div>• <strong>Click Edit Button</strong> - Modify judge assignments</div>
                      <div>• <strong>Click Chevron</strong> - Expand/collapse debate details</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Drop Zones</h4>
                    <div className="text-sm space-y-1">
                      <div>• <strong>Team Cells</strong> - Drag teams to proposition/opposition positions</div>
                      <div>• <strong>Judge Areas</strong> - Drag judges to assign them to debates</div>
                      <div>• <strong>Empty Slots</strong> - Drop teams/judges where none are assigned</div>
                      <div>• <strong>Visual Feedback</strong> - Blue highlights show valid drop targets</div>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        
        {autoSaveDrafts && isDraft && lastSavedTimestamp && canEditPairings && (
          <div className="fixed bottom-4 left-4 z-40">
            <div className="bg-muted/80 text-muted-foreground px-3 py-1 rounded-full text-xs flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              Auto-saved
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}