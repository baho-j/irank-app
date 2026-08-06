"use client"

import React, { useEffect, useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  Ticket,
  Plus,
  Copy,
  Check,
  Users,
  AlertCircle,
  Clock
} from "lucide-react"
import { formatDistanceToNow, format, addDays } from "date-fns"

interface WaiverCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournament: any;
  token?: string | null;
}

export function WaiverCodeDialog({
                                   open,
                                   onOpenChange,
                                   tournament,
                                   token
                                 }: WaiverCodeDialogProps) {
  const [usageLimit, setUsageLimit] = useState("10");
  const [expiryDays, setExpiryDays] = useState("30");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState<Set<string>>(new Set());

  const waiverCodes = useQuery(
    api.functions.admin.teams.getTournamentWaiverCodes,
    token ? {
      admin_token: token,
      tournament_id: tournament._id,
    } : "skip"
  );

  const generateWaiverCode = useMutation(api.functions.admin.teams.generateWaiverCode);

  const handleGenerateCode = async () => {
    if (!token) return;

    const limit = parseInt(usageLimit);
    const days = parseInt(expiryDays);

    if (limit < 1 || limit > 100) {
      toast.error("Usage limit must be between 1 and 100");
      return;
    }

    if (days < 1 || days > 365) {
      toast.error("Expiry days must be between 1 and 365");
      return;
    }

    setIsGenerating(true);

    try {
      const expiresAt = addDays(new Date(), days).getTime();

      const result = await generateWaiverCode({
        admin_token: token,
        tournament_id: tournament._id,
        usage_limit: limit,
        expires_at: expiresAt,
      });

      if (result.success) {
        toast.success(`Waiver code generated: ${result.waiver_code}`);
        await navigator.clipboard.writeText(result.waiver_code);
        setCopiedCodes(new Set([result.waiver_code]));
        setTimeout(() => setCopiedCodes(new Set()), 3000);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate waiver code");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodes(new Set([code]));
      setTimeout(() => setCopiedCodes(new Set()), 2000);
      toast.success("Waiver code copied!");
    } catch (error) {
      toast.error("Failed to copy waiver code");
    }
  };

  // Ticked rather than read at render, so a code that expires while the
  // dialog is open is shown as expired instead of staying active.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const getCodeStatus = (code: any) => {
    const isExpired = code.expires_at && now > code.expires_at;
    const isExhausted = code.usage_count >= code.usage_limit;

    if (!code.is_active) return { status: "inactive", color: "bg-gray-100 text-gray-800" };
    if (isExpired) return { status: "expired", color: "bg-red-100 text-red-800" };
    if (isExhausted) return { status: "exhausted", color: "bg-orange-100 text-orange-800" };
    return { status: "active", color: "bg-green-100 text-green-800" };
  };

  const activeCodes = waiverCodes?.filter(code =>
    code.is_active &&
    code.usage_count < code.usage_limit &&
    (!code.expires_at || now < code.expires_at)
  ) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[350px] md:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1">
            <Ticket className="h-5 w-5" />
            Waiver Code Management
          </DialogTitle>
          <DialogDescription>
            Generate and manage waiver codes that schools can use to waive tournament fees.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
            <h3 className="font-medium text-sm flex items-center gap-1">
              <Plus className="h-4 w-4" />
              Generate New Waiver Code
            </h3>

            <div className="grid grid-cols-1 custom:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Usage Limit</Label>
                <Select value={usageLimit} onValueChange={setUsageLimit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 uses</SelectItem>
                    <SelectItem value="10">10 uses</SelectItem>
                    <SelectItem value="20">20 uses</SelectItem>
                    <SelectItem value="50">50 uses</SelectItem>
                    <SelectItem value="100">100 uses</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Expires In</Label>
                <Select value={expiryDays} onValueChange={setExpiryDays}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleGenerateCode}
              disabled={isGenerating}
              className="w-full"
            >
              {isGenerating ? "Generating..." : "Generate Waiver Code"}
            </Button>
          </div>

          {activeCodes.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
              <Users className="h-5 w-5 text-green-600" />
              <div className="text-sm text-green-800">
                <div className="font-medium">{activeCodes.length} active waiver code{activeCodes.length > 1 ? 's' : ''}</div>
                <div className="text-xs">Schools can use these codes to waive tournament fees</div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {!waiverCodes ? (
              <div className="text-center py-8">
                <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <div className="text-sm text-muted-foreground">Loading waiver codes...</div>
              </div>
            ) : waiverCodes.length === 0 ? (
              <div className="text-center py-8">
                <Ticket className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <div className="text-sm text-muted-foreground">No waiver codes generated yet</div>
                <div className="text-xs text-muted-foreground">Generate your first waiver code above</div>
              </div>
            ) : (
              <div className="overflow-x-auto max-w-[300px] md:max-w-[750px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {waiverCodes.map((code) => {
                      const { status, color } = getCodeStatus(code);
                      const usagePercentage = (code.usage_count / code.usage_limit) * 100;

                      return (
                        <TableRow key={code.code}>
                          <TableCell>
                            <div className="font-mono font-medium">{code.code}</div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="text-sm">{code.usage_count} / {code.usage_limit}</div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    usagePercentage >= 100 ? 'bg-red-500' :
                                      usagePercentage >= 80 ? 'bg-orange-500' : 'bg-green-500'
                                  }`}
                                  style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={color}>
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {code.expires_at ? (
                                <div>
                                  <div>{format(new Date(code.expires_at), "MMM dd, yyyy")}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(code.expires_at), { addSuffix: true })}
                                  </div>
                                </div>
                              ) : (
                                "Never"
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{code.creator?.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(code.created_at), { addSuffix: true })}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyCode(code.code)}
                              className="h-8 w-8 p-0"
                            >
                              {copiedCodes.has(code.code) ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="space-y-2 p-4 rounded-lg border border-blue-200">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              How to Share Waiver Codes
            </h4>
            <div className="text-xs space-y-1">
              <div>• Copy waiver codes and share them with school administrators</div>
              <div>• Schools enter these codes when creating teams to waive tournament fees</div>
              <div>• Each code has a usage limit and expiration date</div>
              <div>• Codes can only be used for {tournament.league?.type !== "Dreams Mode" ? "Local/International" : "this"} tournament types</div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}