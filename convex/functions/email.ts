"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { sendEmail } from "../lib/mailer";
import { internal } from "../_generated/api";
import { emailRetrier } from "../lib/retrier";

/**
 * The single point where mail actually leaves the system. Public actions
 * enqueue this through the retrier so a transient SMTP failure is retried with
 * backoff instead of being reported to the caller as a failed send.
 *
 * Throwing rather than returning an error is deliberate: the retrier treats a
 * thrown error as the retry signal.
 */
type EmailQueueResult = {
  success: boolean;
  message?: string;
  runId?: string;
  error?: string;
};

export const deliver = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    text: v.optional(v.string()),
    headers: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (_ctx, args) => {
    const result = await sendEmail(args);

    if (!result.success) {
      throw new Error(result.error ?? "Failed to send email");
    }

    return { messageId: result.messageId };
  },
});

async function sendTournamentInvitation({
                                          to,
                                          recipientName,
                                          tournamentName,
                                          tournamentSlug,
                                          tournamentDate,
                                          tournamentLocation,
                                          isVirtual,
                                          invitationType,
                                          expiresAt,
                                          invitationId,
                                        }: {
  to: string;
  recipientName: string;
  tournamentName: string;
  tournamentSlug: string;
  tournamentDate: string;
  tournamentLocation?: string;
  isVirtual: boolean;
  invitationType: "school" | "volunteer" | "student";
  expiresAt: string;
  invitationId: string;
}) {
  const baseUrl = process.env.FRONTEND_SITE_URL || "http://localhost:3000";

  const getUserRole = (type: string) => {
    switch (type) {
      case "school": return "school";
      case "student": return "student";
      case "volunteer": return "volunteer";
      default: return "student";
    }
  };

  const userRole = getUserRole(invitationType);
  const tournamentUrl = `${baseUrl}/${userRole}/tournament/${tournamentSlug}#invitations`;
  const acceptUrl = `${baseUrl}/${userRole}/tournament/${tournamentSlug}#invitations?id=${invitationId}&response=accepted`;
  const declineUrl = `${baseUrl}/${userRole}/tournament/${tournamentSlug}#invitations?id=${invitationId}&response=declined`;

  const emailHtml = getTournamentInvitationEmailTemplate(
    recipientName,
    tournamentName,
    tournamentSlug,
    tournamentDate,
    tournamentLocation,
    isVirtual,
    invitationType,
    expiresAt,
    invitationId,
    tournamentUrl,
    acceptUrl,
    declineUrl
  );

  const emailText = getTournamentInvitationTextTemplate(
    recipientName,
    tournamentName,
    tournamentDate,
    tournamentLocation,
    isVirtual,
    invitationType,
    expiresAt,
    tournamentUrl,
    acceptUrl,
    declineUrl
  );

  try {
    const result = await sendEmail({
      to: to,
      subject: `Tournament Invitation: ${tournamentName}`,
      html: emailHtml,
      text: emailText,
        headers: {
          "X-iRank-Type": String("tournament_invitation"),
          "X-iRank-Tournament": String(tournamentSlug),
          "X-iRank-Invitation-Type": String(invitationType),
      },
    });

    return {
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    };
  } catch (error: any) {
    console.error("Failed to send invitation email:", error);
    return {
      success: false,
      error: error.message || "Failed to send email",
    };
  }
}

export const sendTournamentInvitationEmail = action({
  args: {
    to: v.string(),
    recipientName: v.string(),
    tournamentName: v.string(),
    tournamentSlug: v.string(),
    tournamentDate: v.string(),
    tournamentLocation: v.optional(v.string()),
    isVirtual: v.boolean(),
    invitationType: v.union(
      v.literal("school"),
      v.literal("volunteer"),
      v.literal("student")
    ),
    expiresAt: v.string(),
    invitationId: v.string(),
  },
  handler: async (_ctx, args) => {
    return await sendTournamentInvitation(args);
  },
});

export const sendBulkTournamentInvitationEmails = action({
  args: {
    emails: v.array(v.object({
      to: v.string(),
      recipientName: v.string(),
      tournamentName: v.string(),
      tournamentSlug: v.string(),
      tournamentDate: v.string(),
      tournamentLocation: v.optional(v.string()),
      isVirtual: v.boolean(),
      invitationType: v.union(
        v.literal("school"),
        v.literal("volunteer"),
        v.literal("student")
      ),
      expiresAt: v.string(),
      invitationId: v.string(),
    })),
  },
  handler: async (_ctx, args) => {
    const results: Array<{
      email: string;
      success: boolean;
      messageId?: string;
      error?: string;
    }> = [];

    const batchSize = 10;

    for (let i = 0; i < args.emails.length; i += batchSize) {
      const batch = args.emails.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(async (emailData) => {
          try {
            const result = await sendTournamentInvitation(emailData);
            return {
              email: emailData.to,
              success: result.success,
              messageId: result.messageId,
              error: result.error,
            };
          } catch (error: any) {
            return {
              email: emailData.to,
              success: false,
              error: error.message || "Failed to send email",
            };
          }
        })
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          results.push({
            email: "unknown",
            success: false,
            error: result.reason?.message || "Unknown error",
          });
        }
      }

      if (i + batchSize < args.emails.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return { results };
  },
});

export const sendWelcomeEmail = action({
  args: {
    email: v.string(),
    name: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args): Promise<EmailQueueResult> => {
    try {
      const html = getWelcomeEmailTemplate(args.name, args.role);

      const runId = await emailRetrier.run(ctx, internal.functions.email.deliver, {
        to: args.email,
        subject: "Welcome to iRankHub!",
        html,
        headers: {
          "X-iRank-Type": String("welcome"),
          "X-iRank-Role": String(args.role),
        },
      });

      return {
        success: true,
        message: "Welcome email queued for delivery",
        runId,
      };
    } catch (error: any) {
      console.error("Failed to send welcome email:", error);
      return {
        success: false,
        error: error.message || "Failed to send email"
      };
    }
  },
});

/**
 * Internal, and scheduled by generateMagicLink. The token is a credential, so
 * it is never returned to the browser for the client to post back here.
 */
export const deliverMagicLink = internalAction({
  args: {
    email: v.string(),
    token: v.string(),
    purpose: v.union(
      v.literal("login"),
      v.literal("password_reset"),
    ),
  },
  handler: async (ctx, args): Promise<EmailQueueResult> => {
    try {
      const baseUrl = process.env.FRONTEND_SITE_URL || "http://localhost:3000";
      let magicLinkUrl: string;
      let subject: string;

      switch (args.purpose) {
        case "login":
          magicLinkUrl = `${baseUrl}/magic-link?token=${args.token}`;
          subject = "iRankHub - Magic Link Login";
          break;
        case "password_reset":
          magicLinkUrl = `${baseUrl}/reset-password?token=${args.token}`;
          subject = "iRankHub - Reset Your Password";
          break;
      }

      const html = getMagicLinkEmailTemplate(args.purpose, magicLinkUrl);

      const runId = await emailRetrier.run(ctx, internal.functions.email.deliver, {
        to: args.email,
        subject,
        html,
        headers: {
          "X-iRank-Type": String("magic_link"),
          "X-iRank-Purpose": String(args.purpose),
        },
      });

      return {
        success: true,
        message: "Magic link email queued for delivery",
        runId,
      };
    } catch (error: any) {
      console.error("Failed to send magic link email:", error);
      return {
        success: false,
        error: error.message || "Failed to send email"
      };
    }
  },
});

export const sendAccountApprovedEmail = action({
  args: {
    email: v.string(),
    name: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args): Promise<EmailQueueResult> => {
    try {
      const dashboardUrl = `${process.env.FRONTEND_SITE_URL || 'http://localhost:3000'}/${args.role === 'school_admin' ? 'school' : args.role}/dashboard`;
      const html = getAccountApprovedEmailTemplate(args.name, args.role, dashboardUrl);

      const runId = await emailRetrier.run(ctx, internal.functions.email.deliver, {
        to: args.email,
        subject: "Your iRankHub Account Has Been Approved!",
        html,
        headers: {
          "X-iRank-Type": String("account_approved"),
          "X-iRank-Role": String(args.role),
        },
      });

      return {
        success: true,
        message: "Account approval email queued for delivery",
        runId,
      };
    } catch (error: any) {
      console.error("Failed to send account approval email:", error);
      return {
        success: false,
        error: error.message || "Failed to send email"
      };
    }
  },
});

export const sendPasswordResetEmail = action({
  args: {
    email: v.string(),
    token: v.string(),
  },
  handler: async (ctx, args): Promise<EmailQueueResult> => {
    try {
      const resetUrl = `${process.env.FRONTEND_SITE_URL || 'http://localhost:3000'}/auth/reset-password?token=${args.token}`;
      const html = getPasswordResetEmailTemplate(resetUrl);

      const runId = await emailRetrier.run(ctx, internal.functions.email.deliver, {
        to: args.email,
        subject: "Reset Your iRankHub Password",
        html,
        headers: {
          "X-iRank-Type": String("password_reset"),
        },
      });

      return {
        success: true,
        message: "Password reset email queued for delivery",
        runId,
      };
    } catch (error: any) {
      console.error("Failed to send password reset email:", error);
      return {
        success: false,
        error: error.message || "Failed to send email"
      };
    }
  },
});

export const sendBulkNotificationEmails = action({
  args: {
    recipients: v.array(v.object({
      email: v.string(),
      name: v.string(),
      customData: v.optional(v.any()),
    })),
    subject: v.string(),
    template: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const batchSize = 10;
      const results: any = [];

      for (let i = 0; i < args.recipients.length; i += batchSize) {
        const batch = args.recipients.slice(i, i + batchSize);

        const batchPromises = batch.map(async (recipient) => {
          try {
            const html = getCustomEmailTemplate(args.template, recipient.name, recipient.customData);

            const result = await sendEmail({
              to: recipient.email,
              subject: args.subject,
              html,
        headers: {
          "X-iRank-Type": String("bulk_notification"),
        },
            });

            return {
              email: recipient.email,
              success: true,
              messageId: result.messageId,
            };
          } catch (error: any) {
            return {
              email: recipient.email,
              success: false,
              error: error.message,
            };
          }
        });

        const batchResults = await Promise.allSettled(batchPromises);

        batchResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            results.push({
              email: 'unknown',
              success: false,
              error: result.reason?.message || 'Unknown error',
            });
          }
        });

        if (i + batchSize < args.recipients.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const successCount = results.filter((r: { success: any; }) => r.success).length;

      return {
        success: true,
        message: `${successCount} out of ${args.recipients.length} emails sent successfully`,
        count: successCount,
        results,
      };
    } catch (error: any) {
      console.error("Failed to send bulk emails:", error);
      return {
        success: false,
        error: error.message || "Failed to send bulk emails"
      };
    }
  },
});

function getTournamentInvitationEmailTemplate(
  recipientName: string,
  tournamentName: string,
  tournamentSlug: string,
  tournamentDate: string,
  tournamentLocation: string | undefined,
  isVirtual: boolean,
  invitationType: "school" | "volunteer" | "student",
  expiresAt: string,
  invitationId: string,
  tournamentUrl: string,
  acceptUrl: string,
  declineUrl: string
): string {
  const baseUrl = process.env.FRONTEND_SITE_URL || 'http://localhost:3000';

  const getInvitationTypeText = (type: string) => {
    switch (type) {
      case "school": return "your school";
      case "student": return "you as a student";
      case "volunteer": return "you as a volunteer";
      default: return "you";
    }
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tournament Invitation</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.5;
      color: #2c1810;
      background-color: #f8f8f8;
      margin: 0;
      padding: 0;
      font-size: 14px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background-color: #f97316;
      color: white;
      padding: 24px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 500;
    }
    .content {
      padding: 24px;
    }
    .tournament-card {
      background-color: #a16207;
      color: white;
      padding: 20px;
      border-radius: 8px;
      margin: 16px 0;
      text-align: center;
    }
    .tournament-card h2 {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 500;
    }
    .tournament-card p {
      margin: 0;
      font-size: 14px;
    }
    .tournament-details {
      background-color: #f9f9f9;
      padding: 16px;
      border-radius: 8px;
      margin: 16px 0;
    }
    .detail-item {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e5e5;
      font-size: 14px;
    }
    .detail-item:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }
    .detail-label {
      font-weight: 500;
      color: #2c1810;
    }
    .detail-value {
      color: #6b5b4f;
    }
    .action-buttons {
      text-align: center;
      margin: 24px 0;
    }
    .btn {
      display: inline-block;
      padding: 8px 16px;
      margin: 0 8px;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
      text-align: center;
      transition: all 0.3s ease;
      font-size: 14px;
      height: 32px;
      line-height: 16px;
    }
    .btn-accept {
      background-color: #16a34a;
      color: white;
    }
    .btn-accept:hover {
      background-color: #15803d;
    }
    .btn-decline {
      background-color: #dc2626;
      color: white;
    }
    .btn-decline:hover {
      background-color: #b91c1c;
    }
    .btn-view {
      background-color: #f97316;
      color: white;
      margin-top: 12px;
    }
    .btn-view:hover {
      background-color: #ea580c;
    }
    .footer {
      background-color: #f9f9f9;
      padding: 16px;
      text-align: center;
      color: #6b5b4f;
      font-size: 12px;
    }
    .footer a {
      color: #f97316;
      text-decoration: none;
    }
    .expiry-notice {
      background-color: #fef3c7;
      border: 1px solid: #fbbf24;
      color: #92400e;
      padding: 12px;
      border-radius: 6px;
      margin: 16px 0;
      font-size: 12px;
    }
    @media (max-width: 600px) {
      .container {
        margin: 0;
        border-radius: 0;
      }
      .content {
        padding: 16px;
      }
      .btn {
        display: block;
        margin: 8px 0;
        width: 100%;
        box-sizing: border-box;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏆 Tournament Invitation</h1>
    </div>
    
    <div class="content">
      <p>Dear ${recipientName},</p>
      
      <p>We are excited to invite ${getInvitationTypeText(invitationType)} to participate in an upcoming debate tournament!</p>
      
      <div class="tournament-card">
        <h2>${tournamentName}</h2>
        <p>Join us for an exciting debate competition</p>
      </div>
      
      <div class="tournament-details">
        <div class="detail-item">
          <span class="detail-label">📅 Date:</span>
          <span class="detail-value">${tournamentDate}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">${isVirtual ? '💻' : '📍'} ${isVirtual ? 'Format' : 'Location'}:</span>
          <span class="detail-value">${isVirtual ? 'Virtual Tournament' : (tournamentLocation || 'TBD')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">👥 Invitation Type:</span>
          <span class="detail-value">${invitationType.charAt(0).toUpperCase() + invitationType.slice(1)} Participation</span>
        </div>
      </div>
      
      <div class="expiry-notice">
        ⏰ <strong>Please respond by ${expiresAt}</strong> to secure your participation in this tournament.
      </div>
      
      <div class="action-buttons">
        <a href="${acceptUrl}" class="btn btn-accept">✅ Accept Invitation</a>
        <a href="${declineUrl}" class="btn btn-decline">❌ Decline Invitation</a>
        <br>
        <a href="${tournamentUrl}" class="btn btn-view">📋 View Tournament Details</a>
      </div>
      
      <p>If you have any questions about this tournament or need assistance, please don't hesitate to contact our support team.</p>
      
      <p>We look forward to your participation!</p>
      
      <p>Best regards,<br>
      <strong>iRank Tournament Team</strong></p>
    </div>
    
    <div class="footer">
      <p>This invitation will expire on ${expiresAt}. You can also respond by logging into your <a href="${baseUrl}">account</a> and visiting the <a href="${baseUrl}/${invitationType}/${tournamentSlug}">tournament page.</a></p>
      <p>© 2025 iRankHub - iDebate Rwanda. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
}

function getTournamentInvitationTextTemplate(
  recipientName: string,
  tournamentName: string,
  tournamentDate: string,
  tournamentLocation: string | undefined,
  isVirtual: boolean,
  invitationType: "school" | "volunteer" | "student",
  expiresAt: string,
  tournamentUrl: string,
  acceptUrl: string,
  declineUrl: string
): string {
  const getInvitationTypeText = (type: string) => {
    switch (type) {
      case "school": return "your school";
      case "student": return "you as a student";
      case "volunteer": return "you as a volunteer";
      default: return "you";
    }
  };

  return `
Tournament Invitation: ${tournamentName}

Dear ${recipientName},

We are excited to invite ${getInvitationTypeText(invitationType)} to participate in ${tournamentName}!

Tournament Details:
- Date: ${tournamentDate}
- ${isVirtual ? 'Format' : 'Location'}: ${isVirtual ? 'Virtual Tournament' : (tournamentLocation || 'TBD')}
- Invitation Type: ${invitationType.charAt(0).toUpperCase() + invitationType.slice(1)} Participation

Please respond by ${expiresAt} to secure your participation.

To respond to this invitation:
- Accept: ${acceptUrl}
- Decline: ${declineUrl}
- View Details: ${tournamentUrl}

If you have any questions, please contact our support team.

Best regards,
iRank Tournament Team

This invitation expires on ${expiresAt}.
  `;
}

function getMagicLinkEmailTemplate(purpose: string, magicLinkUrl: string): string {
  const baseUrl = process.env.FRONTEND_SITE_URL || 'http://localhost:3000';

  const configs = {
    login: {
      heading: "Sign in to iRankHub",
      description: "Click the link below to sign in to your account:",
      buttonText: "Sign In",
    },
    password_reset: {
      heading: "Reset your password",
      description: "Click the link below to reset your password:",
      buttonText: "Reset Password",
    },
    email_verification: {
      heading: "Verify your email",
      description: "Click the link below to verify your email address:",
      buttonText: "Verify Email",
    },
    account_recovery: {
      heading: "Recover your account",
      description: "Click the link below to recover your account:",
      buttonText: "Recover Account",
    },
  };

  const config = configs[purpose as keyof typeof configs];

  return `
    <div style="max-width: 600px; margin: 0 auto; padding: 16px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f8f8;">
      <div style="background-color: white; border-radius: 8px; padding: 32px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="width: 80px; height: 80px; background-color: #f97316; border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; font-weight: bold;">
            iR
          </div>
        </div>
        
        <div style="text-align: center;">
          <h1 style="color: #2c1810; font-size: 24px; margin-bottom: 12px; font-weight: 500;">
            ${config.heading}
          </h1>
          <p style="color: #6b5b4f; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">
            ${config.description}
          </p>
          
          <div style="margin: 32px 0;">
            <a href="${magicLinkUrl}" style="
              background-color: #f97316;
              color: white;
              padding: 12px 24px;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 500;
              font-size: 14px;
              display: inline-block;
              height: 32px;
              line-height: 8px;
            ">
              ${config.buttonText}
            </a>
          </div>
          
          <div style="background-color: #f9f9f9; border-radius: 6px; padding: 16px; margin: 24px 0;">
            <p style="color: #6b5b4f; font-size: 12px; margin: 0;">
              <strong>Security tip:</strong> This link will expire in 15 minutes for your security.
            </p>
          </div>
          
          <p style="color: #6b5b4f; font-size: 12px; line-height: 1.5;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
        
        <div style="border-top: 1px solid #e5e5e5; padding-top: 16px; margin-top: 32px; text-align: center;">
          <p style="color: #a16207; font-size: 12px; margin: 0;">
            &copy; ${new Date().getFullYear()} iRankHub - iDebate Rwanda. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  `;
}

function getWelcomeEmailTemplate(name: string, role: string): string {
  const baseUrl = process.env.FRONTEND_SITE_URL || 'http://localhost:3000';
  const dashboardUrl = `${baseUrl}/${role === 'school_admin' ? 'school' : role}/dashboard`;

  const roleMessages = {
    student: {
      title: "Welcome to the Global Debate Community!",
      description: "You're now part of a worldwide network of debaters. Start exploring tournaments and tracking your progress.",
      features: [
        "Participate in international tournaments",
        "Track your debate performance",
        "Connect with debaters worldwide",
        "Access educational resources"
      ]
    },
    school_admin: {
      title: "Welcome to iRankHub School Portal!",
      description: "Your school is now registered. Manage your debate teams and tournament participation with ease.",
      features: [
        "Register multiple debate teams",
        "Track student performance",
        "Manage tournament registrations",
        "View comprehensive analytics"
      ]
    },
    volunteer: {
      title: "Welcome to the iRankHub Judge Community!",
      description: "Thank you for joining our network of dedicated judges. Your expertise shapes future speakers and leaders.",
      features: [
        "Judge debates across various formats",
        "Track judging history and feedback",
        "Contribute to student development",
        "Access advanced judging tools"
      ]
    },
    admin: {
      title: "Welcome to iRankHub Administration!",
      description: "You now have administrative access to manage the platform and support our debate community.",
      features: [
        "Manage users and schools",
        "Configure tournaments and leagues",
        "Generate comprehensive reports",
        "Monitor platform health"
      ]
    }
  };

  const roleConfig = roleMessages[role as keyof typeof roleMessages] || roleMessages.student;

  return `
    <div style="max-width: 600px; margin: 0 auto; padding: 16px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f8f8;">
      <div style="background-color: white; border-radius: 8px; padding: 32px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="width: 80px; height: 80px; background-color: #f97316; border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; font-weight: bold;">
            iR
          </div>
        </div>
        
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #2c1810; font-size: 24px; margin-bottom: 8px; font-weight: 500;">
            ${roleConfig.title}
          </h1>
          <p style="color: #6b5b4f; font-size: 16px; margin: 0;">
            Hello ${name}!
          </p>
        </div>
        
        <div style="background-color: #a16207; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="color: white; font-size: 14px; line-height: 1.5; margin: 0; text-align: center;">
            ${roleConfig.description}
          </p>
        </div>
        
        <div style="margin-bottom: 24px;">
          <h2 style="color: #2c1810; font-size: 18px; margin-bottom: 12px; font-weight: 500;">What you can do:</h2>
          <ul style="color: #6b5b4f; font-size: 12px; line-height: 1.6; padding-left: 16px; margin: 0;">
            ${roleConfig.features.map(feature => `<li style="margin-bottom: 6px;">${feature}</li>`).join('')}
          </ul>
        </div>
        
        <div style="text-align: center; margin: 32px 0;">
          <a href="${dashboardUrl}" style="
            background-color: #f97316;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            font-size: 14px;
            display: inline-block;
            height: 32px;
            line-height: 8px;
          ">
            Go to Dashboard
          </a>
        </div>
        
        <div style="border-top: 1px solid #e5e5e5; padding-top: 16px; margin-top: 32px; text-align: center;">
          <p style="color: #a16207; font-size: 12px; margin: 0;">
            &copy; ${new Date().getFullYear()} iRankHub - iDebate Rwanda. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  `;
}

function getAccountApprovedEmailTemplate(name: string, role: string, dashboardUrl: string): string {
  const baseUrl = process.env.FRONTEND_SITE_URL || 'http://localhost:3000';

  return `
    <div style="max-width: 600px; margin: 0 auto; padding: 16px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f8f8;">
      <div style="background-color: white; border-radius: 8px; padding: 32px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="width: 80px; height: 80px; background-color: #f97316; border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; font-weight: bold;">
            iR
          </div>
        </div>
        
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="width: 60px; height: 60px; background-color: #16a34a; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
            <span style="color: white; font-size: 24px;">✓</span>
          </div>
          <h1 style="color: #2c1810; font-size: 24px; margin-bottom: 8px; font-weight: 500;">
            Account Approved!
          </h1>
          <p style="color: #6b5b4f; font-size: 16px; margin: 0;">
            Hello ${name}!
          </p>
        </div>
        
        <div style="background-color: #16a34a; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="color: white; font-size: 14px; line-height: 1.5; margin: 0; text-align: center;">
            Great news! Your ${role.replace('_', ' ')} account has been approved by our administrators. 
            You now have full access to all iRankHub features.
          </p>
        </div>
        
        <div style="text-align: center; margin: 32px 0;">
          <a href="${dashboardUrl}" style="
            background-color: #16a34a;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            font-size: 14px;
            display: inline-block;
            height: 32px;
            line-height: 8px;
          ">
            Access Your Dashboard
          </a>
        </div>
        
        <div style="border-top: 1px solid #e5e5e5; padding-top: 16px; margin-top: 32px; text-align: center;">
          <p style="color: #a16207; font-size: 12px; margin: 0;">
            &copy; ${new Date().getFullYear()} iRankHub - iDebate Rwanda. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  `;
}

function getPasswordResetEmailTemplate(resetUrl: string): string {
  const baseUrl = process.env.FRONTEND_SITE_URL || 'http://localhost:3000';

  return `
    <div style="max-width: 600px; margin: 0 auto; padding: 16px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f8f8;">
      <div style="background-color: white; border-radius: 8px; padding: 32px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="width: 80px; height: 80px; background-color: #f97316; border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; font-weight: bold;">
            iR
          </div>
        </div>
        
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #2c1810; font-size: 24px; margin-bottom: 12px; font-weight: 500;">
            Reset Your Password
          </h1>
          <p style="color: #6b5b4f; font-size: 14px; line-height: 1.5;">
            We received a request to reset your password. Click the button below to create a new password.
          </p>
        </div>
        
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}" style="
            background-color: #f97316;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            font-size: 14px;
            display: inline-block;
            height: 32px;
            line-height: 8px;
          ">
            Reset Password
          </a>
        </div>
        
        <div style="background-color: #fef3c7; border: 1px solid #fbbf24; border-radius: 6px; padding: 12px; margin: 24px 0;">
          <p style="color: #92400e; font-size: 12px; margin: 0;">
            <strong>Security Notice:</strong> This link will expire in 1 hour for your security. 
            If you didn't request this reset, please ignore this email.
          </p>
        </div>
        
        <div style="border-top: 1px solid #e5e5e5; padding-top: 16px; margin-top: 32px; text-align: center;">
          <p style="color: #a16207; font-size: 12px; margin: 0;">
            &copy; ${new Date().getFullYear()} iRankHub - iDebate Rwanda. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  `;
}

function getCustomEmailTemplate(template: string, name: string, customData?: any): string {
  return `
    <div style="max-width: 600px; margin: 0 auto; padding: 16px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f8f8;">
      <div style="background-color: white; border-radius: 8px; padding: 32px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="width: 80px; height: 80px; background-color: #f97316; border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; font-weight: bold;">
            iR
          </div>
        </div>
        
        <h1 style="color: #2c1810; font-size: 20px; font-weight: 500; margin-bottom: 16px;">Hello ${name},</h1>
        <div style="color: #6b5b4f; font-size: 14px; line-height: 1.5;">${template}</div>
        
        <div style="border-top: 1px solid #e5e5e5; padding-top: 16px; margin-top: 32px; text-align: center;">
          <p style="color: #a16207; font-size: 12px; margin: 0;">
            &copy; ${new Date().getFullYear()} iRankHub - iDebate Rwanda. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  `;
}