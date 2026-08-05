/**
 * Shared shell for every email. Colours mirror the app's palette
 * (`app/globals.css`): primary `hsl(24 100% 47%)`, dark blue
 * `hsl(227 28% 27%)`, brown `hsl(26 32% 48%)`, converted to hex because email
 * clients do not reliably support hsl() or CSS variables.
 */

export const BRAND = {
  primary: "#f07000",
  primaryDark: "#c25a00",
  darkBlue: "#323a58",
  brown: "#a17753",
  ink: "#0f172a",
  muted: "#6b7280",
  border: "#e5e7eb",
  surface: "#ffffff",
  canvas: "#f6f7f9",
} as const;

function siteUrl(): string {
  return process.env.FRONTEND_SITE_URL || "https://irankhub.debaterwanda.org";
}

export function logoUrl(): string {
  return `${siteUrl()}/images/logo.png`;
}

export interface EmailButton {
  label: string;
  url: string;
}

/**
 * Table-based layout with inline styles, because Gmail strips <style> blocks
 * and most clients ignore flexbox.
 */
export function renderEmail(options: {
  title: string;
  preheader?: string;
  greeting?: string;
  body: string;
  button?: EmailButton;
  footerNote?: string;
}): string {
  const { title, preheader, greeting, body, button, footerNote } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.canvas};padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:${BRAND.darkBlue};padding:20px 28px;">
            <img src="${logoUrl()}" alt="iRank" height="34" style="height:34px;display:block;border:0;">
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;color:${BRAND.ink};">${title}</h1>
            ${greeting ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${greeting}</p>` : ""}
            <div style="font-size:15px;line-height:1.65;color:${BRAND.ink};">${body}</div>
            ${button
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px;">
                   <tr><td style="border-radius:8px;background:${BRAND.primary};">
                     <a href="${button.url}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${button.label}</a>
                   </td></tr>
                 </table>
                 <p style="margin:10px 0 0;font-size:12px;color:${BRAND.muted};word-break:break-all;">Or paste this into your browser: ${button.url}</p>`
      : ""}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 28px;border-top:1px solid ${BRAND.border};background:#fafafa;">
            ${footerNote ? `<p style="margin:0 0 8px;font-size:12px;color:${BRAND.muted};">${footerNote}</p>` : ""}
            <p style="margin:0;font-size:12px;color:${BRAND.muted};">
              iRank — iDebate Rwanda League Management System<br>
              <a href="${siteUrl()}" style="color:${BRAND.brown};text-decoration:none;">${siteUrl().replace(/^https?:\/\//, "")}</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function renderList(items: string[]): string {
  return `<ul style="margin:12px 0;padding-left:20px;">${items
    .map((item) => `<li style="margin:6px 0;">${item}</li>`)
    .join("")}</ul>`;
}

export function renderStat(label: string, value: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0;background:${BRAND.canvas};border-radius:8px;">
    <tr><td style="padding:14px 18px;">
      <div style="font-size:12px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:.04em;">${label}</div>
      <div style="font-size:22px;font-weight:700;color:${BRAND.ink};margin-top:2px;">${value}</div>
    </td></tr>
  </table>`;
}
