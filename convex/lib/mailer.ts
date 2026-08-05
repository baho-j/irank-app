"use node";

import nodemailer, { type Transporter } from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;

  if (!host || !user || !password) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and SMTP_FROM in the Convex environment."
    );
  }

  const port = Number(process.env.SMTP_PORT ?? 587);

  transporter = nodemailer.createTransport({
    host,
    port,
    // 465 is implicit TLS; 587 upgrades via STARTTLS after connecting.
    secure: port === 465,
    auth: { user, pass: password },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  return transporter;
}

export function emailFromAddress(): string {
  const from = process.env.SMTP_FROM;

  if (!from) {
    throw new Error("SMTP_FROM is not configured.");
  }

  return from;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  try {
    const info = await getTransporter().sendMail({
      from: emailFromAddress(),
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: message.headers,
    });

    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`Failed to send "${message.subject}" to ${message.to}:`, error);
    return { success: false, error: error.message ?? "Failed to send email" };
  }
}

/**
 * Sends sequentially over the pooled connection and reports each recipient
 * separately, so a partial failure is visible rather than collapsing into a
 * single success or failure for the whole batch.
 */
export async function sendBulkEmail(
  messages: EmailMessage[]
): Promise<Array<EmailResult & { to: string }>> {
  const results: Array<EmailResult & { to: string }> = [];

  for (const message of messages) {
    const result = await sendEmail(message);
    results.push({ ...result, to: message.to });
  }

  return results;
}

export async function verifySmtpConnection(): Promise<EmailResult> {
  try {
    await getTransporter().verify();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message ?? "SMTP verification failed" };
  }
}
