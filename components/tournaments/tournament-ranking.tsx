"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Users,
  Star,
  Medal,
  Award,
  Download,
  Crown,
  Building,
  Loader2,
  Settings,
  Search,
  UsersRound,
  School,
  GraduationCap,
  FileText,
  FileSpreadsheet, FileBadge2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from '../ui/skeleton';
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";
import { downloadExcel } from "@/lib/export/excel";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface RankingResponse<T> {
  success: boolean;
  error: string | null;
  data: T;
  type: 'success' | 'permission_error' | 'validation_error' | 'data_insufficient' | 'not_released';
}

interface TeamRanking {
  rank: number;
  team_id: Id<"teams">;
  team_name: string;
  school_id?: Id<"schools">;
  school_name?: string;
  school_type?: string;
  total_wins: number;
  total_losses: number;
  total_points: number;
  opponents_total_wins: number;
  opponents_total_points: number;
  head_to_head_wins: number;
  eliminated_in_round?: number;
}

interface SchoolRanking {
  rank: number;
  school_id: Id<"schools">;
  school_name: string;
  school_type: string;
  total_teams: number;
  total_wins: number;
  total_points: number;
  best_team_rank: number;
  avg_team_rank: number;
  teams: Array<{
    team_id: Id<"teams">;
    team_name: string;
    wins: number;
    total_points: number;
    rank: number;
    eliminated_in_round?: number;
  }>;
}

interface StudentRanking {
  rank: number;
  speaker_id: Id<"users">;
  speaker_name: string;
  speaker_email: string;
  team_id?: Id<"teams">;
  team_name?: string;
  school_id?: Id<"schools">;
  school_name?: string;
  total_speaker_points: number;
  average_speaker_score: number;
  team_wins: number;
  team_rank: number;
  debates_count: number;
  highest_individual_score: number;
  points_deviation: number;
  cross_tournament_performance: {
    tournaments_participated: number;
    avg_points_per_tournament: number;
    best_tournament_rank?: number;
  };
}

interface VolunteerRanking {
  rank: number;
  volunteer_id: Id<"users">;
  volunteer_name: string;
  volunteer_email: string;
  school_id?: Id<"schools">;
  school_name?: string;
  total_debates_judged: number;
  elimination_debates_judged: number;
  prelim_debates_judged: number;
  head_judge_assignments: number;
  attendance_score: number;
  avg_feedback_score: number;
  total_feedback_count: number;
  consistency_score: number;
  cross_tournament_stats: {
    tournaments_judged: number;
    total_debates_across_tournaments: number;
    avg_feedback_across_tournaments: number;
  };
}

interface TournamentRankingsProps {
  tournament: any;
  userRole: string;
  token: string;
  userId?: string;
  schoolId?: string;
}

function RankingSkeleton() {
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

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <Skeleton className="h-8 w-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-40" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid w-full grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">
                <Skeleton className="h-4 w-8" />
              </TableHead>
              <TableHead>
                <Skeleton className="h-4 w-20" />
              </TableHead>
              <TableHead>
                <Skeleton className="h-4 w-16" />
              </TableHead>
              <TableHead>
                <Skeleton className="h-4 w-16" />
              </TableHead>
              <TableHead>
                <Skeleton className="h-4 w-20" />
              </TableHead>
              <TableHead>
                <Skeleton className="h-4 w-16" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 10 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-6 w-6 rounded-full" />
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-8" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-8" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-12" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const RankingBadge = ({ rank }: { rank: number }) => {
  if (rank === 1) {
    return <Crown className="h-6 w-6 text-yellow-500" />;
  } else if (rank === 2) {
    return <Medal className="h-6 w-6 text-gray-400" />;
  } else if (rank === 3) {
    return <Award className="h-6 w-6 text-amber-600" />;
  } else if (rank > 3 && rank <= 10) {
    return <FileBadge2 className="h-6 w-6 text-gray-400" />;
  } else if (rank > 10) {
    return (
      <div className="w-6 h-6 rounded-full bg-white" />
    );
  }
  return null;
};


const NotAvailableCard = ({ response, title, icon: Icon }: {
  response: RankingResponse<any>;
  title: string;
  icon: any;
}) => (
  <Card>
    <CardContent className="text-center py-12">
      <Icon className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
      <h3 className="font-medium mb-2">{title}</h3>
      <p className="text-muted-foreground text-xs max-w-md mx-auto">
        {response.error}
      </p>
    </CardContent>
  </Card>
);

const ExportDialog = ({
                        rankings,
                        tournament,
                        activeTab,
                        includeElimination
                      }: {
  rankings: any[];
  tournament: any;
  activeTab: string;
  includeElimination: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf' | 'excel'>('excel');
  const [isExporting, setIsExporting] = useState(false);

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      let data: any[] = [];
      const scope = includeElimination ? 'Full Tournament' : 'Preliminary Rounds';

      switch (activeTab) {
        case 'teams':
          data = rankings.map((team: TeamRanking) => ({
            'Rank': team.rank,
            'Team Name': team.team_name,
            'School': team.school_name || 'N/A',
            'School Type': team.school_type || 'N/A',
            'Wins': team.total_wins || 0,
            'Losses': team.total_losses || 0,
            'Total Points': team.total_points || 0,
            'Opponent Wins': team.opponents_total_wins || 0,
            'Opponent Points': team.opponents_total_points || 0,
            'Head to Head Wins': team.head_to_head_wins || 0,
            'Eliminated in Round': team.eliminated_in_round || 'N/A'
          }));
          break;
        case 'schools':
          data = rankings.map((school: SchoolRanking) => ({
            'Rank': school.rank,
            'School Name': school.school_name,
            'School Type': school.school_type,
            'Total Teams': school.total_teams || 0,
            'Total Wins': school.total_wins || 0,
            'Total Points': school.total_points || 0,
            'Best Team Rank': school.best_team_rank || 'N/A',
            'Average Team Rank': school.avg_team_rank ? school.avg_team_rank.toFixed(1) : 'N/A'
          }));
          break;
        case 'students':
          data = rankings.map((student: StudentRanking) => ({
            'Rank': student.rank,
            'Speaker Name': student.speaker_name,
            'Email': student.speaker_email,
            'Team': student.team_name || 'N/A',
            'School': student.school_name || 'N/A',
            'Total Speaker Points': student.total_speaker_points || 0,
            'Average Score': student.average_speaker_score ? student.average_speaker_score.toFixed(1) : 'N/A',
            'Team Wins': student.team_wins || 0,
            'Team Rank': student.team_rank || 'N/A',
            'Debates Count': student.debates_count || 0,
            'Highest Score': student.highest_individual_score || 0,
            'Points Deviation': student.points_deviation ? student.points_deviation.toFixed(2) : 'N/A'
          }));
          break;
        case 'volunteers':
          data = rankings.map((volunteer: VolunteerRanking) => ({
            'Rank': volunteer.rank,
            'Volunteer Name': volunteer.volunteer_name,
            'Email': volunteer.volunteer_email,
            'School': volunteer.school_name || 'N/A',
            'Total Debates Judged': volunteer.total_debates_judged || 0,
            'Elimination Debates': volunteer.elimination_debates_judged || 0,
            'Prelim Debates': volunteer.prelim_debates_judged || 0,
            'Head Judge Assignments': volunteer.head_judge_assignments || 0,
            'Attendance Score': volunteer.attendance_score ? volunteer.attendance_score.toFixed(1) : 'N/A',
            'Average Feedback Score': volunteer.avg_feedback_score ? volunteer.avg_feedback_score.toFixed(1) : 'N/A',
            'Feedback Count': volunteer.total_feedback_count || 0,
            'Consistency Score': volunteer.consistency_score ? volunteer.consistency_score.toFixed(1) : 'N/A'
          }));
          break;
      }

      const sheetName = `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Rankings`;
      const fileName = `${tournament.name}_${activeTab}_Rankings_${scope.replace(' ', '_')}.xlsx`;

      await downloadExcel([{ name: sheetName, rows: data }], fileName);

      toast.success("Excel file downloaded!");
    } catch (error) {
      toast.error("Failed to export Excel file");
    } finally {
      setIsExporting(false);
      setOpen(false);
    }
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const scope = includeElimination ? 'Full Tournament' : 'Preliminary Rounds';

      doc.setFontSize(16);
      doc.text(`${tournament.name} - ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Rankings`, 20, 20);
      doc.setFontSize(12);
      doc.text(`Scope: ${scope}`, 20, 30);

      let tableData: any[] = [];
      let headers: string[] = [];

      switch (activeTab) {
        case 'teams':
          headers = ['Rank', 'Team', 'School', 'Wins', 'Losses', 'Points'];
          tableData = rankings.map((team: TeamRanking) => [
            team.rank,
            team.team_name,
            team.school_name || 'N/A',
            team.total_wins || 0,
            team.total_losses || 0,
            team.total_points || 0
          ]);
          break;
        case 'schools':
          headers = ['Rank', 'School', 'Type', 'Teams', 'Wins', 'Points', 'Best Rank', 'Avg Rank'];
          tableData = rankings.map((school: SchoolRanking) => [
            school.rank,
            school.school_name,
            school.school_type,
            school.total_teams || 0,
            school.total_wins || 0,
            school.total_points || 0,
            school.best_team_rank || 'N/A',
            school.avg_team_rank ? school.avg_team_rank.toFixed(1) : 'N/A'
          ]);
          break;
        case 'students':
          headers = ['Rank', 'Speaker', 'Team', 'School', 'Points', 'Avg Score', 'Debates'];
          tableData = rankings.map((student: StudentRanking) => [
            student.rank,
            student.speaker_name,
            student.team_name || 'N/A',
            student.school_name || 'N/A',
            student.total_speaker_points || 0,
            student.average_speaker_score ? student.average_speaker_score.toFixed(1) : 'N/A',
            student.debates_count || 0
          ]);
          break;
        case 'volunteers':
          headers = ['Rank', 'Volunteer', 'School', 'Debates', 'Eliminations', 'Feedback', 'Consistency'];
          tableData = rankings.map((volunteer: VolunteerRanking) => [
            volunteer.rank,
            volunteer.volunteer_name,
            volunteer.school_name || 'N/A',
            volunteer.total_debates_judged || 0,
            volunteer.elimination_debates_judged || 0,
            volunteer.avg_feedback_score ? volunteer.avg_feedback_score.toFixed(1) : 'N/A',
            volunteer.consistency_score ? volunteer.consistency_score.toFixed(1) : 'N/A'
          ]);
          break;
      }

      autoTable(doc, {
        head: [headers],
        body: tableData,
        startY: 40,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] },
        margin: { left: 10, right: 10 }
      });

      const fileName = `${tournament.name}_${activeTab}_Rankings_${scope.replace(' ', '_')}.pdf`;
      doc.save(fileName);

      toast.success("PDF file downloaded!");
    } catch (error) {
      toast.error("Failed to export PDF file");
    } finally {
      setIsExporting(false);
      setOpen(false);
    }
  };

  const exportToCSV = async () => {
    setIsExporting(true);
    try {
      let csvContent = "";
      const scope = includeElimination ? 'Full Tournament' : 'Preliminary Rounds';

      switch (activeTab) {
        case 'teams':
          csvContent = "Rank,Team Name,School,School Type,Wins,Losses,Total Points,Opponent Wins,Opponent Points,Head to Head Wins,Eliminated in Round\n";
          csvContent += rankings.map((team: TeamRanking) =>
            `${team.rank},"${team.team_name}","${team.school_name || 'N/A'}","${team.school_type || 'N/A'}",${team.total_wins || 0},${team.total_losses || 0},${team.total_points || 0},${team.opponents_total_wins || 0},${team.opponents_total_points || 0},${team.head_to_head_wins || 0},"${team.eliminated_in_round || 'N/A'}"`
          ).join('\n');
          break;
        case 'schools':
          csvContent = "Rank,School Name,School Type,Total Teams,Total Wins,Total Points,Best Team Rank,Average Team Rank\n";
          csvContent += rankings.map((school: SchoolRanking) =>
            `${school.rank},"${school.school_name}","${school.school_type}",${school.total_teams || 0},${school.total_wins || 0},${school.total_points || 0},${school.best_team_rank || 'N/A'},${school.avg_team_rank ? school.avg_team_rank.toFixed(1) : 'N/A'}`
          ).join('\n');
          break;
        case 'students':
          csvContent = "Rank,Speaker Name,Email,Team,School,Total Speaker Points,Average Score,Team Wins,Team Rank,Debates Count,Highest Score,Points Deviation\n";
          csvContent += rankings.map((student: StudentRanking) =>
            `${student.rank},"${student.speaker_name}","${student.speaker_email}","${student.team_name || 'N/A'}","${student.school_name || 'N/A'}",${student.total_speaker_points || 0},${student.average_speaker_score ? student.average_speaker_score.toFixed(1) : 'N/A'},${student.team_wins || 0},${student.team_rank || 'N/A'},${student.debates_count || 0},${student.highest_individual_score || 0},${student.points_deviation ? student.points_deviation.toFixed(2) : 'N/A'}`
          ).join('\n');
          break;
        case 'volunteers':
          csvContent = "Rank,Volunteer Name,Email,School,Total Debates Judged,Elimination Debates,Prelim Debates,Head Judge Assignments,Attendance Score,Average Feedback Score,Feedback Count,Consistency Score\n";
          csvContent += rankings.map((volunteer: VolunteerRanking) =>
            `${volunteer.rank},"${volunteer.volunteer_name}","${volunteer.volunteer_email}","${volunteer.school_name || 'N/A'}",${volunteer.total_debates_judged || 0},${volunteer.elimination_debates_judged || 0},${volunteer.prelim_debates_judged || 0},${volunteer.head_judge_assignments || 0},${volunteer.attendance_score ? volunteer.attendance_score.toFixed(1) : 'N/A'},${volunteer.avg_feedback_score ? volunteer.avg_feedback_score.toFixed(1) : 'N/A'},${volunteer.total_feedback_count || 0},${volunteer.consistency_score ? volunteer.consistency_score.toFixed(1) : 'N/A'}`
          ).join('\n');
          break;
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `${tournament.name}_${activeTab}_Rankings_${scope.replace(' ', '_')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("CSV file downloaded!");
    } catch (error) {
      toast.error("Failed to export CSV file");
    } finally {
      setIsExporting(false);
      setOpen(false);
    }
  };

  const handleExport = () => {
    switch (exportFormat) {
      case 'excel':
        exportToExcel();
        break;
      case 'pdf':
        exportToPDF();
        break;
      case 'csv':
        exportToCSV();
        break;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Download className="h-4 w-4 mr-1" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Rankings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Export Format</Label>
            <Select value={exportFormat} onValueChange={(value: 'csv' | 'pdf' | 'excel') => setExportFormat(value)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excel">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Excel (.xlsx)
                  </div>
                </SelectItem>
                <SelectItem value="pdf">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    PDF
                  </div>
                </SelectItem>
                <SelectItem value="csv">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    CSV
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-muted-foreground">
            <p><strong>Exporting:</strong> {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Rankings</p>
            <p><strong>Scope:</strong> {includeElimination ? 'Full Tournament' : 'Preliminary Rounds'}</p>
            <p><strong>Records:</strong> {rankings.length} entries</p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleExport} disabled={isExporting || rankings.length === 0} className="flex-1">
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export {exportFormat.toUpperCase()}
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default function TournamentRankings({
                                             tournament,
                                             userRole,
                                             token,
                                           }: TournamentRankingsProps) {
  const [activeTab, setActiveTab] = useState<'teams' | 'schools' | 'students' | 'volunteers'>('teams');
  const [includeElimination, setIncludeElimination] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'rank' | 'name' | 'performance'>('rank');
  const [sortDirection,] = useState<'asc' | 'desc'>('asc');
  const [filterSchool, setFilterSchool] = useState<string>('all');
  const [isTabLoading, setIsTabLoading] = useState(false);

  const isAdmin = userRole === 'admin';
  const hasToken = Boolean(token);

  const canViewRankings = hasToken;
  const canManageReleaseSettings = isAdmin;
  const canToggleElimination = isAdmin;
  const canExportRankings = isAdmin;

  const scope = includeElimination ? "full_tournament" : "prelims";

  const teamRankingsResponse = useQuery(
    api.functions.rankings.getTeamRankings,
    canViewRankings ? {
      token,
      tournament_id: tournament._id,
      scope: scope,
    } : "skip"
  );

  const schoolRankingsResponse = useQuery(
    api.functions.rankings.getSchoolRankings,
    canViewRankings ? {
      token,
      tournament_id: tournament._id,
      scope: scope,
    } : "skip"
  );

  const studentRankingsResponse = useQuery(
    api.functions.rankings.getStudentRankings,
    canViewRankings ? {
      token,
      tournament_id: tournament._id,
      scope: scope,
    } : "skip"
  );

  const volunteerRankingsResponse = useQuery(
    api.functions.rankings.getVolunteerRankings,
    canViewRankings ? {
      token,
      tournament_id: tournament._id,
    } : "skip"
  );

  const updateRankingReleaseMutation = useMutation(api.functions.rankings.updateRankingRelease);

  const teamRankings = useMemo(() =>
      teamRankingsResponse?.success ? teamRankingsResponse.data : [],
    [teamRankingsResponse]
  );
  const teamError = teamRankingsResponse?.success === false ? teamRankingsResponse.error : null;

  const schoolRankings = useMemo(() =>
      schoolRankingsResponse?.success ? schoolRankingsResponse.data : [],
    [schoolRankingsResponse]
  );
  const schoolError = schoolRankingsResponse?.success === false ? schoolRankingsResponse.error : null;

  const studentRankings = useMemo(() =>
      studentRankingsResponse?.success ? studentRankingsResponse.data : [],
    [studentRankingsResponse]
  );
  const studentError = studentRankingsResponse?.success === false ? studentRankingsResponse.error : null;

  const volunteerRankings = useMemo(() =>
      volunteerRankingsResponse?.success ? volunteerRankingsResponse.data : [],
    [volunteerRankingsResponse]
  );
  const volunteerError = volunteerRankingsResponse?.success === false ? volunteerRankingsResponse.error : null;

  const [releaseSettings, setReleaseSettings] = useState({
    prelims: {
      teams: false,
      schools: false,
      students: false,
      volunteers: false,
    },
    full_tournament: {
      teams: false,
      schools: false,
      students: false,
      volunteers: false,
    },
    visible_to_roles: ['school_admin', 'student', 'volunteer']
  });

  useEffect(() => {
    if (tournament.ranking_released && canManageReleaseSettings) {
      setReleaseSettings(tournament.ranking_released);
    }
  }, [tournament, canManageReleaseSettings]);

  useEffect(() => {
    setIsTabLoading(true);
    const timer = setTimeout(() => {
      setIsTabLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [activeTab, includeElimination]);

  const filteredAndSortedRankings = useMemo(() => {
    let rankings: any[] = [];

    switch (activeTab) {
      case 'teams':
        rankings = teamRankings || [];
        break;
      case 'schools':
        rankings = schoolRankings || [];
        break;
      case 'students':
        rankings = studentRankings || [];
        break;
      case 'volunteers':
        rankings = volunteerRankings || [];
        break;
    }

    if (searchQuery) {
      rankings = rankings.filter(item => {
        const searchFields = [
          item.team_name,
          item.school_name,
          item.speaker_name,
          item.volunteer_name
        ].filter(Boolean).join(' ').toLowerCase();

        return searchFields.includes(searchQuery.toLowerCase());
      });
    }

    if (filterSchool !== 'all') {
      rankings = rankings.filter(item =>
        item.school_id === filterSchool || item.school_name === filterSchool
      );
    }

    rankings.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'name':
          aValue = a.team_name || a.school_name || a.speaker_name || a.volunteer_name || '';
          bValue = b.team_name || b.school_name || b.speaker_name || b.volunteer_name || '';
          break;
        case 'performance':
          aValue = a.total_points || a.total_speaker_points || a.total_debates_judged || 0;
          bValue = b.total_points || b.total_speaker_points || b.total_debates_judged || 0;
          break;
        default:
          aValue = a.rank;
          bValue = b.rank;
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return rankings;
  }, [activeTab, teamRankings, schoolRankings, studentRankings, volunteerRankings, searchQuery, filterSchool, sortBy, sortDirection]);

  const availableSchools = useMemo(() => {
    const schools = new Set<{id: string, name: string}>();

    [teamRankings, schoolRankings, studentRankings, volunteerRankings].forEach(rankings => {
      rankings?.forEach((item: any) => {
        if (item.school_id && item.school_name) {
          schools.add({id: item.school_id, name: item.school_name});
        }
      });
    });

    return Array.from(schools);
  }, [teamRankings, schoolRankings, studentRankings, volunteerRankings]);

  const updateReleaseSettings = async (newSettings: typeof releaseSettings) => {
    if (!canManageReleaseSettings || !updateRankingReleaseMutation) {
      toast.error("You don't have permission to update ranking settings");
      return;
    }

    try {
      await updateRankingReleaseMutation({
        token,
        tournament_id: tournament._id,
        ranking_settings: newSettings,
      });
      setReleaseSettings(newSettings);
      toast.success("Ranking visibility updated");
    } catch (error: any) {
      toast.error(error.message || "Failed to update settings");
    }
  };

  const currentRankings = filteredAndSortedRankings;

  const isLoading = !teamRankingsResponse || !schoolRankingsResponse || !studentRankingsResponse || !volunteerRankingsResponse;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <RankingSkeleton />
      </div>
    );
  }

  const renderTeamsTable = () => {
    if (teamError) {
      return (
        <NotAvailableCard
          response={teamRankingsResponse!}
          title="Team Rankings Not Available"
          icon={UsersRound}
        />
      );
    }

    if (currentRankings.length === 0) {
      return (
        <Card>
          <CardContent className="text-center py-12">
            <UsersRound className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Team Rankings</h3>
            <p className="text-muted-foreground">
              {searchQuery || filterSchool !== 'all'
                ? 'No teams match your search criteria.'
                : 'Team rankings will appear here once calculated.'
              }
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rank</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="w-20">Wins</TableHead>
              <TableHead className="w-20">Losses</TableHead>
              <TableHead className="w-24">Points</TableHead>
              <TableHead className="w-24">Opp Wins</TableHead>
              <TableHead className="w-24">Opp Points</TableHead>
              <TableHead className="w-20">H2H</TableHead>
              <TableHead className="w-32">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentRankings.map((team: TeamRanking) => (
              <TableRow key={team.team_id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <RankingBadge rank={team.rank} />
                    <span className="font-bold">{team.rank}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-semibold">{team.team_name}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      {team.school_name && <span>{team.school_name}</span>}
                      {team.school_type && <Badge variant="outline" className="text-xs">{team.school_type}</Badge>}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-green-600 font-bold">{team.total_wins || 0}</span>
                </TableCell>
                <TableCell>
                  <span className="text-red-600">{team.total_losses || 0}</span>
                </TableCell>
                <TableCell>
                  <span className="font-semibold">{team.total_points || 0}</span>
                </TableCell>
                <TableCell>
                  <span>{team.opponents_total_wins || 0}</span>
                </TableCell>
                <TableCell>
                  <span>{(team.opponents_total_points || 0).toFixed(1)}</span>
                </TableCell>
                <TableCell>
                  <span>{team.head_to_head_wins || 0}</span>
                </TableCell>
                <TableCell>
                  {team.eliminated_in_round ? (
                    <Badge variant="secondary">
                      Elim R{team.eliminated_in_round}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Active</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderSchoolsTable = () => {
    if (schoolError) {
      return (
        <NotAvailableCard
          response={schoolRankingsResponse!}
          title="School Rankings Not Available"
          icon={Building}
        />
      );
    }

    if (currentRankings.length === 0) {
      return (
        <Card>
          <CardContent className="text-center py-12">
            <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No School Rankings</h3>
            <p className="text-muted-foreground">
              {searchQuery || filterSchool !== 'all'
                ? 'No schools match your search criteria.'
                : 'School rankings will appear here once calculated.'
              }
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rank</TableHead>
              <TableHead>School</TableHead>
              <TableHead className="w-20">Teams</TableHead>
              <TableHead className="w-20">Wins</TableHead>
              <TableHead className="w-24">Points</TableHead>
              <TableHead className="w-24">Best Rank</TableHead>
              <TableHead className="w-24">Avg Rank</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentRankings.map((school: SchoolRanking) => (
              <TableRow key={school.school_id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <RankingBadge rank={school.rank} />
                    <span className="font-bold">{school.rank}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-semibold">{school.school_name}</div>
                    <div className="text-sm text-muted-foreground">
                      <Badge variant="outline" className="text-xs">{school.school_type}</Badge>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-semibold">{school.total_teams || 0}</span>
                </TableCell>
                <TableCell>
                  <span className="text-green-600 font-bold">{school.total_wins || 0}</span>
                </TableCell>
                <TableCell>
                  <span className="font-semibold">{school.total_points || 0}</span>
                </TableCell>
                <TableCell>
                  <span className="text-blue-600 font-semibold">#{school.best_team_rank || 'N/A'}</span>
                </TableCell>
                <TableCell>
                  <span>{school.avg_team_rank ? school.avg_team_rank.toFixed(1) : 'N/A'}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderStudentsTable = () => {
    if (studentError) {
      return (
        <NotAvailableCard
          response={studentRankingsResponse!}
          title="Student Rankings Not Available"
          icon={GraduationCap}
        />
      );
    }

    if (currentRankings.length === 0) {
      return (
        <Card>
          <CardContent className="text-center py-12">
            <GraduationCap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Student Rankings</h3>
            <p className="text-muted-foreground">
              {searchQuery || filterSchool !== 'all'
                ? 'No students match your search criteria.'
                : 'Student rankings will appear here once calculated.'
              }
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rank</TableHead>
              <TableHead>Speaker</TableHead>
              <TableHead className="w-24">Points</TableHead>
              <TableHead className="w-20">Avg Score</TableHead>
              <TableHead className="w-20">Team Wins</TableHead>
              <TableHead className="w-24">Team Rank</TableHead>
              <TableHead className="w-20">Debates</TableHead>
              <TableHead className="w-20">Best Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentRankings.map((student: StudentRanking) => (
              <TableRow key={student.speaker_id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <RankingBadge rank={student.rank} />
                    <span className="font-bold">{student.rank}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-semibold">{student.speaker_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {student.team_name && <div>{student.team_name}</div>}
                      {student.school_name && <div>{student.school_name}</div>}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-primary font-bold">{student.total_speaker_points || 0}</span>
                </TableCell>
                <TableCell>
                  <span>{student.average_speaker_score ? student.average_speaker_score.toFixed(1) : 'N/A'}</span>
                </TableCell>
                <TableCell>
                  <span className="text-green-600">{student.team_wins || 0}</span>
                </TableCell>
                <TableCell>
                  <span>#{student.team_rank || 'N/A'}</span>
                </TableCell>
                <TableCell>
                  <span>{student.debates_count || 0}</span>
                </TableCell>
                <TableCell>
                  <span className="font-semibold">{student.highest_individual_score || 0}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderVolunteersTable = () => {
    if (volunteerError) {
      return (
        <NotAvailableCard
          response={volunteerRankingsResponse!}
          title="Volunteer Rankings Not Available"
          icon={Star}
        />
      );
    }

    if (currentRankings.length === 0) {
      return (
        <Card>
          <CardContent className="text-center py-12">
            <Star className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Volunteer Rankings</h3>
            <p className="text-muted-foreground">
              {searchQuery || filterSchool !== 'all'
                ? 'No volunteers match your search criteria.'
                : 'Volunteer rankings will appear here once calculated.'
              }
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rank</TableHead>
              <TableHead>Volunteer</TableHead>
              <TableHead className="w-20">Debates</TableHead>
              <TableHead className="w-20">Eliminations</TableHead>
              <TableHead className="w-20">Head Judge</TableHead>
              <TableHead className="w-24">Feedback</TableHead>
              <TableHead className="w-24">Consistency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentRankings.map((volunteer: VolunteerRanking) => (
              <TableRow key={volunteer.volunteer_id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <RankingBadge rank={volunteer.rank} />
                    <span className="font-bold">{volunteer.rank}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-semibold">{volunteer.volunteer_name}</div>
                    {volunteer.school_name && (
                      <div className="text-sm text-muted-foreground">{volunteer.school_name}</div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-primary font-bold">{volunteer.total_debates_judged || 0}</span>
                </TableCell>
                <TableCell>
                  <span className="text-purple-600">{volunteer.elimination_debates_judged || 0}</span>
                </TableCell>
                <TableCell>
                  <span className="text-blue-600">{volunteer.head_judge_assignments || 0}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{volunteer.avg_feedback_score ? volunteer.avg_feedback_score.toFixed(1) : 'N/A'}</span>
                    <Progress
                      value={volunteer.avg_feedback_score ? (volunteer.avg_feedback_score / 5) * 100 : 0}
                      className="w-12 h-2"
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <span>{volunteer.consistency_score ? volunteer.consistency_score.toFixed(1) : 'N/A'}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex bg-brown rounded-t-md flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-3">
          <div>
            <h2 className="text-xl text-white font-bold">Tournament Rankings</h2>
            <div className="flex items-center gap-4 text-xs text-gray-300">
              <span>
                {includeElimination ? 'Full Tournament' : 'Preliminary Rounds'} Results
              </span>
              {currentRankings.length > 0 && (
                <span>{currentRankings.length} entries</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {canToggleElimination && (
              <div className="flex items-center space-x-1">
                <Switch
                  id="include-elims"
                  checked={includeElimination}
                  onCheckedChange={setIncludeElimination}
                />
                <Label htmlFor="include-elims" className="text-xs text-white">
                  Include Eliminations
                </Label>
              </div>
            )}

            {canExportRankings && currentRankings.length > 0 && (
              <ExportDialog
                rankings={currentRankings}
                tournament={tournament}
                activeTab={activeTab}
                includeElimination={includeElimination}
              />
            )}
          </div>
        </div>

        <div className="p-4 space-y-2">
          {canManageReleaseSettings && (
            <Alert>
              <Settings className="h-4 w-4" />
              <AlertTitle>Ranking Visibility Controls</AlertTitle>
              <AlertDescription>
                <div className="space-y-4 mt-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-sm font-medium mb-2">Preliminary Rankings</h5>
                      <div className="space-y-2">
                        {(['teams', 'schools', 'students', 'volunteers'] as const).map(type => (
                          <div key={type} className="flex items-center space-x-2">
                            <Checkbox
                              id={`prelims-${type}`}
                              checked={releaseSettings.prelims[type]}
                              onCheckedChange={(checked) => {
                                const newSettings = {
                                  ...releaseSettings,
                                  prelims: {
                                    ...releaseSettings.prelims,
                                    [type]: checked
                                  }
                                };
                                updateReleaseSettings(newSettings);
                              }}
                            />
                            <Label htmlFor={`prelims-${type}`} className="text-xs capitalize">
                              {type}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h5 className="text-sm font-medium mb-2">Full Tournament Rankings</h5>
                      <div className="space-y-2">
                        {(['teams', 'schools', 'students', 'volunteers'] as const).map(type => (
                          <div key={type} className="flex items-center space-x-2">
                            <Checkbox
                              id={`full-${type}`}
                              checked={releaseSettings.full_tournament[type]}
                              onCheckedChange={(checked) => {
                                const newSettings = {
                                  ...releaseSettings,
                                  full_tournament: {
                                    ...releaseSettings.full_tournament,
                                    [type]: checked
                                  }
                                };
                                updateReleaseSettings(newSettings);
                              }}
                            />
                            <Label htmlFor={`full-${type}`} className="text-xs capitalize">
                              {type}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search rankings..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-8"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Select value={sortBy} onValueChange={(value: 'rank' | 'name' | 'performance') => setSortBy(value)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rank">Rank</SelectItem>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="performance">Performance</SelectItem>
                    </SelectContent>
                  </Select>

                  {availableSchools.length > 0 && (
                    <Select value={filterSchool} onValueChange={setFilterSchool}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Filter by school" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Schools</SelectItem>
                        {availableSchools.map(school => (
                          <SelectItem key={school.id} value={school.id}>
                            {school.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="teams" className="flex items-center gap-2">
                <UsersRound className="h-4 w-4" />
                <span className="hidden custom:inline">Teams</span>
                {teamRankings && (
                  <Badge variant="secondary" className="ml-1 hidden custom:inline-flex">
                    {teamRankings.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="schools" className="flex items-center gap-2">
                <School className="h-4 w-4" />
                <span className="hidden custom:inline">Schools</span>
                {schoolRankings && (
                  <Badge variant="secondary" className="ml-1 hidden custom:inline-flex">
                    {schoolRankings.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="students" className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                <span className="hidden custom:inline">Students</span>
                {studentRankings && (
                  <Badge variant="secondary" className="ml-1 hidden custom:inline-flex">
                    {studentRankings.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="volunteers" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden custom:inline">Volunteers</span>
                {volunteerRankings && (
                  <Badge variant="secondary" className="ml-1 hidden custom:inline-flex">
                    {volunteerRankings.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {isTabLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
                <span className="ml-2">Loading rankings...</span>
              </div>
            )}

            <TabsContent value="teams" className="space-y-4">
              {!isTabLoading && renderTeamsTable()}
            </TabsContent>

            <TabsContent value="schools" className="space-y-4">
              {!isTabLoading && renderSchoolsTable()}
            </TabsContent>

            <TabsContent value="students" className="space-y-4">
              {!isTabLoading && renderStudentsTable()}
            </TabsContent>

            <TabsContent value="volunteers" className="space-y-4">
              {!isTabLoading && renderVolunteersTable()}
            </TabsContent>
          </Tabs>
        </div>
      </Card>
    </div>
  );
}