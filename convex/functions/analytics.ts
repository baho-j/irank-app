import { query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

export const getSharedReportData = query({
  args: {
    access_token: v.string(),
  },
  handler: async (ctx, args): Promise<{
    title?: string;
    generated_at?: number;
    sections?: Record<string, any>;
    access_info?: {
      views_remaining: number | null;
      expires_at: number;
    };
    error?: string;
    success: boolean;
  }> => {
    try {
      const reportShare = await ctx.db
        .query("report_shares")
        .withIndex("by_access_token", (q) => q.eq("access_token", args.access_token))
        .first();

      if (!reportShare) {
        return {
          success: false,
          error: "Invalid access token"
        };
      }

      if (reportShare.expires_at < Date.now()) {
        return {
          success: false,
          error: "Report access has expired"
        };
      }

      if (reportShare.allowed_views && reportShare.view_count >= reportShare.allowed_views) {
        return {
          success: false,
          error: "Maximum views exceeded"
        };
      }

      const reportData = JSON.parse(reportShare.report_id);
      const { config } = reportData;

      const reportSections: Record<string, any> = {};

      if (config.sections.includes("overview")) {
        reportSections.overview = await ctx.runQuery(internal.functions.admin.analytics.dashboardOverview, {
          date_range: config.date_range,
        });
      }

      if (config.sections.includes("tournaments")) {
        reportSections.tournaments = await ctx.runQuery(internal.functions.admin.analytics.tournamentAnalytics, {
          date_range: config.date_range,
          league_id: config.filters?.league_id,
        });
      }

      if (config.sections.includes("users")) {
        reportSections.users = await ctx.runQuery(internal.functions.admin.analytics.userAnalytics, {
          date_range: config.date_range,
        });
      }

      if (config.sections.includes("financial")) {
        reportSections.financial = await ctx.runQuery(internal.functions.admin.analytics.financialAnalytics, {
          date_range: config.date_range,
          currency: config.filters?.currency,
        });
      }

      if (config.sections.includes("performance")) {
        reportSections.performance = await ctx.runQuery(internal.functions.admin.analytics.performanceAnalytics, {
          date_range: config.date_range,
          tournament_id: config.filters?.tournament_id,
        });
      }

      return {
        success: true,
        title: config.title,
        generated_at: Date.now(),
        sections: reportSections,
        access_info: {
          views_remaining: reportShare.allowed_views
            ? reportShare.allowed_views - reportShare.view_count
            : null,
          expires_at: reportShare.expires_at,
        },
      };
    } catch (error) {
      console.error("Error in getSharedReportData:", error);
      return {
        success: false,
        error: "An unexpected error occurred while loading the report"
      };
    }
  },
});