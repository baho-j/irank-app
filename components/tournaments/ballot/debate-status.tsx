import { AlertTriangle, CheckCircle, Clock, Timer } from "lucide-react";

type DebateStatus = "pending" | "inProgress" | "completed" | "noShow";

export function debateStatusColor(status: string): string {
  switch (status as DebateStatus) {
    case "completed": return "bg-green-100 text-green-800";
    case "inProgress": return "bg-blue-100 text-blue-800";
    case "pending": return "bg-yellow-100 text-yellow-800";
    case "noShow": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

/** The icon itself, so callers render it rather than holding a component. */
export function debateStatusIcon(status: string, className: string) {
  switch (status as DebateStatus) {
    case "completed": return <CheckCircle className={className} />;
    case "inProgress": return <Timer className={className} />;
    case "noShow": return <AlertTriangle className={className} />;
    default: return <Clock className={className} />;
  }
}
