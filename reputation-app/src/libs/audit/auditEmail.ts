import { Resend } from 'resend';

const FALLBACK_NOTIFY_ADDRESS = 'rick@bot-nest.com';

export type AuditNotificationPayload = {
  auditId: string;
  businessName: string;
  contactName: string;
  email: string;
  phone?: string;
  websiteUrl: string;
  websiteGrowthScore: number | null;
  opportunityScore: number | null;
  opportunityLabel: string | null;
  topFindings: Array<{ title: string; severity: string; botnest_solution: string }>;
  salesAngle: string | null;
  recommendedPackage: string | null;
  status: string;
  failureReason?: string | null;
};

export async function sendAuditNotification(payload: AuditNotificationPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[audit] RESEND_API_KEY missing — notification skipped');
    return;
  }

  const adminEmail = process.env.ADMIN_EMAIL || FALLBACK_NOTIFY_ADDRESS;
  const resend = new Resend(apiKey);

  const ADMIN_URL = process.env.ADMIN_URL || 'https://admin.bot-nest.com';
  const adminLink = `${ADMIN_URL}?auditId=${payload.auditId}`;
  const opportunityEmoji =
    payload.opportunityLabel === 'HOT'  ? '🔥' :
    payload.opportunityLabel === 'WARM' ? '🟠' : '🔵';

  let subject: string;
  let lines: string[];

  if (payload.status === 'completed' && payload.websiteGrowthScore != null) {
    subject = `New Growth Audit — ${payload.businessName} — Score ${payload.websiteGrowthScore}/100`;
    lines = [
      'A new Website Growth Audit has completed.',
      '',
      '── PROSPECT ──────────────────────────────────',
      `Business:  ${payload.businessName}`,
      `Website:   ${payload.websiteUrl}`,
      `Contact:   ${payload.contactName}`,
      `Email:     ${payload.email}`,
      `Phone:     ${payload.phone || 'Not provided'}`,
      '',
      '── SCORES ────────────────────────────────────',
      `Website Growth Score:   ${payload.websiteGrowthScore}/100`,
      `BotNest Opportunity:    ${opportunityEmoji} ${payload.opportunityLabel} (${payload.opportunityScore}/100)`,
      `Recommended Package:    ${payload.recommendedPackage || 'Unknown'}`,
      '',
      '── TOP FINDINGS ──────────────────────────────',
      ...payload.topFindings.map((f, i) =>
        `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}\n   Solution: ${f.botnest_solution}`
      ),
      '',
      '── SALES ANGLE ───────────────────────────────',
      payload.salesAngle || 'See admin dashboard for details.',
      '',
      '── ACTIONS ───────────────────────────────────',
      `View full audit: ${adminLink}`,
      `Email: ${payload.email}`,
      '',
      'Audit ID: ' + payload.auditId,
    ];
  } else {
    subject = `Audit Requires Review — ${payload.businessName}`;
    lines = [
      'A Website Growth Audit requires manual review.',
      '',
      `Business: ${payload.businessName}`,
      `Website:  ${payload.websiteUrl}`,
      `Contact:  ${payload.contactName} <${payload.email}>`,
      `Status:   ${payload.status}`,
      `Reason:   ${payload.failureReason || 'Unknown'}`,
      '',
      'The lead has been saved. Please review manually.',
      '',
      `Admin: ${adminLink}`,
      `Audit ID: ${payload.auditId}`,
    ];
  }

  try {
    await resend.emails.send({
      from: 'BotNest Audits <leads@bot-nest.com>',
      to: adminEmail,
      subject,
      text: lines.join('\n'),
    });
  } catch (err) {
    console.error('[audit] Notification email failed:', err);
  }
}
