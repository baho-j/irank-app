"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { sendEmail } from "../lib/mailer";
import { internal } from "../_generated/api";
import { emailRetrier } from "../lib/retrier";
import { BRAND, escapeHtml, renderEmail, renderList } from "../lib/email_layout";

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
  const invitedParty = {
    school: "your school",
    student: "you as a student",
    volunteer: "you as a volunteer",
  }[invitationType] ?? "you";

  const details = [
    { label: "Tournament", value: tournamentName },
    { label: "Date", value: tournamentDate },
    { label: "Format", value: isVirtual ? "Virtual" : (tournamentLocation || "In person") },
    { label: "Respond by", value: expiresAt },
  ];

  const rows = details
    .map(
      ({ label, value }) => `
        <tr>
          <td style="padding:8px 16px 8px 0;font-size:14px;color:${BRAND.muted};white-space:nowrap;">${escapeHtml(label)}</td>
          <td style="padding:8px 0;font-size:14px;font-weight:600;color:${BRAND.ink};">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");

  return renderEmail({
    title: `You're invited to ${tournamentName}`,
    preheader: `${tournamentName} — ${tournamentDate}. Respond by ${expiresAt}.`,
    greeting: `Hello ${escapeHtml(recipientName)},`,
    body: `
      <p style="margin:0 0 4px;">We'd like to invite ${escapeHtml(invitedParty)} to take part in this tournament.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:18px 0;border-top:1px solid ${BRAND.border};border-bottom:1px solid ${BRAND.border};">
        ${rows}
      </table>
      <p style="margin:0;font-size:13px;color:${BRAND.muted};">
        <a href="${tournamentUrl}" style="color:${BRAND.brown};">View the full tournament details</a>
      </p>
    `,
    button: { label: "Accept invitation", url: acceptUrl },
    secondaryButton: { label: "Decline", url: declineUrl },
    footerNote: `This invitation expires on ${expiresAt}.`,
  });
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
  const configs = {
    login: {
      title: "Sign in to iRank",
      body: "Use the button below to sign in to your account.",
      buttonText: "Sign In",
    },
    password_reset: {
      title: "Reset your password",
      body: "Use the button below to choose a new password.",
      buttonText: "Reset Password",
    },
    email_verification: {
      title: "Verify your email",
      body: "Use the button below to confirm this email address.",
      buttonText: "Verify Email",
    },
    account_recovery: {
      title: "Recover your account",
      body: "Use the button below to regain access to your account.",
      buttonText: "Recover Account",
    },
  };

  const config = configs[purpose as keyof typeof configs] ?? configs.login;

  return renderEmail({
    title: config.title,
    preheader: `${config.body} This link expires in 15 minutes.`,
    body: `<p style="margin:0;">${config.body}</p>`,
    button: { label: config.buttonText, url: magicLinkUrl },
    footerNote:
      "This link expires in 15 minutes and can only be used once. If you didn't request it, you can safely ignore this email.",
  });
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
        "Access educational resources",
      ],
    },
    school_admin: {
      title: "Welcome to the iRank School Portal!",
      description: "Your school is now registered. Manage your debate teams and tournament participation with ease.",
      features: [
        "Register multiple debate teams",
        "Track student performance",
        "Manage tournament registrations",
        "View comprehensive analytics",
      ],
    },
    volunteer: {
      title: "Welcome to the iRank Judge Community!",
      description: "Thank you for joining our network of dedicated judges. Your expertise shapes future speakers and leaders.",
      features: [
        "Judge debates across various formats",
        "Track judging history and feedback",
        "Contribute to student development",
        "Access advanced judging tools",
      ],
    },
    admin: {
      title: "Welcome to iRank Administration!",
      description: "You now have administrative access to manage the platform and support our debate community.",
      features: [
        "Manage users and schools",
        "Configure tournaments and leagues",
        "Generate comprehensive reports",
        "Monitor platform health",
      ],
    },
  };

  const roleConfig = roleMessages[role as keyof typeof roleMessages] || roleMessages.student;

  return renderEmail({
    title: roleConfig.title,
    preheader: roleConfig.description,
    greeting: `Hello ${escapeHtml(name)},`,
    body: `<p style="margin:0 0 12px;">${roleConfig.description}</p>${renderList(roleConfig.features)}`,
    button: { label: "Go to your dashboard", url: dashboardUrl },
  });
}

function getAccountApprovedEmailTemplate(name: string, role: string, dashboardUrl: string): string {
  const roleName = role.replace(/_/g, " ");

  return renderEmail({
    title: "Your account has been approved",
    preheader: `Your ${roleName} account is ready to use.`,
    greeting: `Hello ${escapeHtml(name)},`,
    body: `<p style="margin:0;">Your ${escapeHtml(roleName)} account has been approved. You now have full access to iRank.</p>`,
    button: { label: "Go to your dashboard", url: dashboardUrl },
  });
}

function getPasswordResetEmailTemplate(resetUrl: string): string {
  return renderEmail({
    title: "Reset your password",
    preheader: "Choose a new password. This link expires in 1 hour.",
    body: `<p style="margin:0;">We received a request to reset your password. Use the button below to choose a new one.</p>`,
    button: { label: "Reset Password", url: resetUrl },
    footerNote:
      "This link expires in 1 hour and can only be used once. If you didn't request this, you can safely ignore this email — your password will not change.",
  });
}

function getCustomEmailTemplate(template: string, name: string, _customData?: unknown): string {
  return renderEmail({
    title: "A message from iRank",
    greeting: `Hello ${escapeHtml(name)},`,
    // `template` is composed by an administrator, so it is trusted HTML.
    body: template,
  });
}