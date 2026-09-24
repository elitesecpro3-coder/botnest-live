import { Resend } from 'resend';

// rick@bot-nest.com is currently inaccessible; using a BotNest-controlled address the team can
// actually check until a permanent fallback inbox is decided.
const FALLBACK_NOTIFY_ADDRESS = 'artifexrapidsolutions@gmail.com';
const WIDGET_API_URL = process.env.API_PUBLIC_URL || 'https://api.bot-nest.com';
// Widget JS is served as a static file from the marketing site, not the API
const WIDGET_JS_URL = process.env.WIDGET_JS_URL || 'https://bot-nest.com/widget.js';

export type SetupEmailPayload = {
  businessName: string;
  botId: string;
  website: string;
  bookingLink?: string | null;
  notificationEmail?: string | null;
  market?: string | null;
};

export async function sendSetupEmail(payload: SetupEmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('🔥 [ALERT] RESEND_API_KEY missing — setup email cannot be sent');
    return;
  }

  const target = payload.notificationEmail || FALLBACK_NOTIFY_ADDRESS;
  if (!payload.notificationEmail) {
    console.warn('🔥 [ALERT] Setup email: customer notification_email missing — sending to fallback');
  }

  const resend = new Resend(apiKey);
  const isVN = payload.market === 'vn';

  const langAttr = isVN ? '\n  data-lang="vi"' : '';
  const embedCode = [
    `<script src="${WIDGET_JS_URL}"`,
    `  data-bot-id="${payload.botId}"${langAttr}`,
    `  data-api-url="${WIDGET_API_URL}">`,
    `</script>`,
  ].join('\n');

  let subject: string;
  let lines: string[];

  if (isVN) {
    subject = `BotNest đã sẵn sàng — ${payload.businessName}`;
    lines = [
      `Trợ lý AI BotNest cho ${payload.businessName} đã sẵn sàng.`,
      '',
      'HƯỚNG DẪN CÀI ĐẶT:',
      '',
      '1. Sao chép đoạn script nhúng bên dưới',
      '2. Dán vào HTML website của bạn, ngay trước thẻ đóng </body>',
      '3. Truy cập website để kiểm tra chatbot',
      '4. Bắt đầu thu thập khách hàng tiềm năng ngay lập tức',
      '',
      'SCRIPT NHÚNG CỦA BẠN:',
      '',
      embedCode,
      '',
      '──────────────────────────────────',
      `Doanh nghiệp: ${payload.businessName}`,
      `Bot ID:       ${payload.botId}`,
      `Website:      ${payload.website}`,
      ...(payload.bookingLink ? [`Đặt lịch:     ${payload.bookingLink}`] : []),
      '',
      'Cần hỗ trợ? Đặt lịch gọi setup miễn phí: https://calendly.com/rick-bot-nest/30min',
      '',
      'Nếu bạn không tìm thấy email này, hãy kiểm tra thư mục spam và tìm tiêu đề bắt đầu bằng "BotNest đã sẵn sàng".',
    ];
  } else {
    subject = `Your BotNest widget is ready — ${payload.businessName}`;
    lines = [
      `Your BotNest AI assistant for ${payload.businessName} is ready.`,
      '',
      'INSTALLATION INSTRUCTIONS:',
      '',
      '1. Copy the embed script below',
      '2. Paste it into your website HTML just before the closing </body> tag',
      '3. Visit your website to test the chatbot',
      '4. Start capturing leads instantly',
      '',
      'YOUR EMBED SCRIPT:',
      '',
      embedCode,
      '',
      '──────────────────────────────────',
      `Business: ${payload.businessName}`,
      `Bot ID:   ${payload.botId}`,
      `Website:  ${payload.website}`,
      ...(payload.bookingLink ? [`Booking:  ${payload.bookingLink}`] : []),
      '',
      'Need help? Schedule a setup call: https://calendly.com/rick-bot-nest/30min',
    ];
  }

  const embedCodeHtml = embedCode
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const htmlEmail = isVN ? `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0f1a;font-family:'Segoe UI',Arial,sans-serif;color:#e8edf5">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="600" style="max-width:600px;background:#131726;border-radius:12px;overflow:hidden">
<tr><td style="background:#1a1f35;padding:24px 32px;text-align:center">
<h1 style="margin:0;font-size:22px;color:#f8d97d">🎉 BotNest đã sẵn sàng!</h1>
<p style="margin:8px 0 0;color:#8898c0;font-size:14px">Trợ lý AI cho ${payload.businessName}</p>
</td></tr>
<tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:15px;color:#c8d4ee">Chatbot AI của bạn đã được kích hoạt. Dán đoạn script dưới đây vào website để bắt đầu thu thập khách hàng tiềm năng.</p>
<h2 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#f8d97d;text-transform:uppercase;letter-spacing:0.08em">Script nhúng của bạn</h2>
<div style="background:#0d0f1a;border:1px solid rgba(248,217,125,0.3);border-radius:8px;padding:16px 20px;margin-bottom:24px">
<code style="font-family:'Courier New',monospace;font-size:13px;color:#86efac;white-space:pre-wrap;word-break:break-all">${embedCodeHtml}</code>
</div>
<h2 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#f8d97d;text-transform:uppercase;letter-spacing:0.08em">Hướng dẫn cài đặt</h2>
<ol style="margin:0 0 24px;padding-left:20px;color:#c8d4ee;font-size:14px;line-height:1.8">
<li>Sao chép đoạn script bên trên</li>
<li>Dán vào HTML website của bạn, ngay <strong>trước thẻ đóng &lt;/body&gt;</strong></li>
<li>Lưu và xuất bản website</li>
<li>Truy cập website — chatbot sẽ hiện ở góc dưới bên phải</li>
</ol>
<p style="margin:0 0 8px;font-size:13px;color:#8898c0"><strong style="color:#c8d4ee">Doanh nghiệp:</strong> ${payload.businessName}</p>
<p style="margin:0 0 8px;font-size:13px;color:#8898c0"><strong style="color:#c8d4ee">Website:</strong> ${payload.website}</p>
${payload.bookingLink ? `<p style="margin:0 0 8px;font-size:13px;color:#8898c0"><strong style="color:#c8d4ee">Đặt lịch:</strong> ${payload.bookingLink}</p>` : ''}
<div style="margin-top:28px;text-align:center">
<a href="https://calendly.com/rick-bot-nest/30min" style="display:inline-block;background:#f2bf3a;color:#0d0f1a;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px">Đặt lịch gọi setup miễn phí</a>
</div>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.07);text-align:center">
<p style="margin:0;font-size:12px;color:#8898c0">Cần trợ giúp? Trả lời email này hoặc gửi đến <a href="mailto:rick@bot-nest.com" style="color:#f8d97d;text-decoration:none">rick@bot-nest.com</a></p>
</td></tr>
</table></td></tr></table>
</body></html>` : `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0f1a;font-family:'Segoe UI',Arial,sans-serif;color:#e8edf5">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="600" style="max-width:600px;background:#131726;border-radius:12px;overflow:hidden">
<tr><td style="background:#1a1f35;padding:24px 32px;text-align:center">
<h1 style="margin:0;font-size:22px;color:#f8d97d">🎉 Your BotNest widget is ready!</h1>
<p style="margin:8px 0 0;color:#8898c0;font-size:14px">AI assistant for ${payload.businessName}</p>
</td></tr>
<tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:15px;color:#c8d4ee">Your chatbot is activated and ready to capture leads. Copy the script below and add it to your website.</p>
<h2 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#f8d97d;text-transform:uppercase;letter-spacing:0.08em">Your Embed Script</h2>
<div style="background:#0d0f1a;border:1px solid rgba(248,217,125,0.3);border-radius:8px;padding:16px 20px;margin-bottom:24px">
<code style="font-family:'Courier New',monospace;font-size:13px;color:#86efac;white-space:pre-wrap;word-break:break-all">${embedCodeHtml}</code>
</div>
<h2 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#f8d97d;text-transform:uppercase;letter-spacing:0.08em">Installation Steps</h2>
<ol style="margin:0 0 24px;padding-left:20px;color:#c8d4ee;font-size:14px;line-height:1.8">
<li>Copy the script tag above</li>
<li>Paste it into your website HTML, just <strong>before the closing &lt;/body&gt; tag</strong></li>
<li>Save and publish your site</li>
<li>Visit your site — the chat button will appear in the bottom-right corner</li>
</ol>
<p style="margin:0 0 8px;font-size:13px;color:#8898c0"><strong style="color:#c8d4ee">Business:</strong> ${payload.businessName}</p>
<p style="margin:0 0 8px;font-size:13px;color:#8898c0"><strong style="color:#c8d4ee">Website:</strong> ${payload.website}</p>
${payload.bookingLink ? `<p style="margin:0 0 8px;font-size:13px;color:#8898c0"><strong style="color:#c8d4ee">Booking link:</strong> ${payload.bookingLink}</p>` : ''}
<div style="margin-top:28px;text-align:center">
<a href="https://bot-nest.com/success" style="display:inline-block;background:#f2bf3a;color:#0d0f1a;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px">View Setup Guide</a>
&nbsp;&nbsp;
<a href="https://calendly.com/rick-bot-nest/30min" style="display:inline-block;background:rgba(248,217,125,0.12);color:#f8d97d;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;border:1px solid rgba(248,217,125,0.3)">Book Setup Call</a>
</div>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.07);text-align:center">
<p style="margin:0;font-size:12px;color:#8898c0">Need help? Reply to this email or contact <a href="mailto:rick@bot-nest.com" style="color:#f8d97d;text-decoration:none">rick@bot-nest.com</a></p>
</td></tr>
</table></td></tr></table>
</body></html>`;

  // The Resend SDK resolves with { error } on a rejected send (e.g. an unverified sending
  // domain) rather than throwing, so both paths must be checked or a failure is invisible.
  try {
    const result = await resend.emails.send({
      from: 'BotNest Setup <onboarding@resend.dev>',
      to: target,
      subject,
      text: lines.join('\n'),
      html: htmlEmail,
    });
    if (result.error) {
      console.error('🔥 [ALERT] Setup email rejected by Resend:', JSON.stringify(result.error));
    }
  } catch (err) {
    console.error('🔥 [ALERT] Setup email failed:', err);
  }
}

// ── Lead notification send layer (provider-abstracted) ─────────────────────
//
// Resend's bot-nest.com sending domain is not yet DNS-verified (see the
// migration work-in-progress), which currently blocks delivery to any
// recipient other than the Resend account owner. EMAIL_PROVIDER lets lead
// notifications route through Brevo instead in the meantime, without
// removing the Resend path — flip EMAIL_PROVIDER back to "resend" (or unset
// it; that's the default) once bot-nest.com is verified there again.

type PlainEmailResult = { ok: boolean; messageId?: string; error?: unknown };

function getEmailProvider(): 'resend' | 'brevo' {
  return (process.env.EMAIL_PROVIDER || 'resend').trim().toLowerCase() === 'brevo' ? 'brevo' : 'resend';
}

async function sendPlainTextViaResend(to: string, subject: string, text: string): Promise<PlainEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY missing' };
  const resend = new Resend(apiKey);
  try {
    // The Resend SDK resolves with { error } on a rejected send (e.g. an unverified sending
    // domain) rather than throwing, so both paths must be checked or a failure is invisible.
    const result = await resend.emails.send({ from: 'BotNest Leads <onboarding@resend.dev>', to, subject, text });
    if (result.error) return { ok: false, error: result.error };
    return { ok: true, messageId: result.data?.id };
  } catch (err) {
    return { ok: false, error: err };
  }
}

async function sendPlainTextViaBrevo(to: string, subject: string, text: string): Promise<PlainEmailResult> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) return { ok: false, error: 'BREVO_API_KEY or BREVO_SENDER_EMAIL missing' };

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: process.env.BREVO_SENDER_NAME || 'BotNest Leads', email: senderEmail },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
    });
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    if (!res.ok) return { ok: false, error: body };
    return { ok: true, messageId: (body as { messageId?: string }).messageId };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function sendPlainTextEmail(to: string, subject: string, text: string): Promise<PlainEmailResult> {
  return getEmailProvider() === 'brevo' ? sendPlainTextViaBrevo(to, subject, text) : sendPlainTextViaResend(to, subject, text);
}

export type LeadNotificationPayload = {
  botId: string;
  name: string;
  phone: string;
  email?: string | null;
  notificationEmail?: string | null;
  businessName?: string | null;
  market?: string | null;
};

export type LeadNotificationResult = {
  /** True if the configured provider accepted the send (primary target or fallback). */
  notified: boolean;
  /** True if the primary target failed and delivery fell back to FALLBACK_NOTIFY_ADDRESS. */
  usedFallback: boolean;
  /** Present when the notification could not be sent anywhere. */
  error?: unknown;
};

export async function sendLeadNotification(lead: LeadNotificationPayload): Promise<LeadNotificationResult> {
  const target = lead.notificationEmail || FALLBACK_NOTIFY_ADDRESS;
  const isVN = lead.market === 'vn';

  const timeZone = isVN ? 'Asia/Ho_Chi_Minh' : 'America/New_York';
  const locale = isVN ? 'vi-VN' : 'en-US';
  const tzLabel = isVN ? 'ICT' : 'ET';
  const timestamp = new Date().toLocaleString(locale, { timeZone });

  let subject: string;
  let text: string;

  if (isVN) {
    const emailLines = [
      `Doanh nghiệp: ${lead.businessName || 'Không xác định'}`,
      `Họ tên:       ${lead.name}`,
      `Điện thoại:   ${lead.phone}`,
      `Email:        ${lead.email || 'Không cung cấp'}`,
      `Bot ID:       ${lead.botId}`,
      `Thời gian:    ${timestamp} (${tzLabel})`,
    ];
    subject = 'Khách hàng tiềm năng mới 🚀';
    text = `Một khách hàng tiềm năng mới vừa được thu thập qua BotNest.\n\n${emailLines.join('\n')}\n\nHãy liên hệ lại với khách hàng này sớm nhất có thể.\n\nCần hỗ trợ? Trả lời email này hoặc đặt lịch gọi với BotNest: https://calendly.com/rick-bot-nest/30min`;
  } else {
    const emailLines = [
      `Business: ${lead.businessName || 'Unknown'}`,
      `Name:     ${lead.name}`,
      `Phone:    ${lead.phone}`,
      `Email:    ${lead.email || 'Not provided'}`,
      `Bot ID:   ${lead.botId}`,
      `Time:     ${timestamp} (${tzLabel})`,
    ];
    subject = 'New Lead Captured 🚀';
    text = `A new lead was captured via BotNest.\n\n${emailLines.join('\n')}\n\nFollow up with this lead as soon as possible.\n\nNeed help? Reply to this email or schedule a setup call with BotNest: https://calendly.com/rick-bot-nest/30min`;
  }

  const primary = await sendPlainTextEmail(target, subject, text);
  if (primary.ok) {
    return { notified: true, usedFallback: false };
  }

  console.error(`🔥 [ALERT] Primary lead email failed (provider=${getEmailProvider()}), sending fallback:`, JSON.stringify(primary.error));
  if (target === FALLBACK_NOTIFY_ADDRESS) {
    // Target already IS the fallback address — a second attempt would just repeat the same failure.
    return { notified: false, usedFallback: false, error: primary.error };
  }

  const fallback = await sendPlainTextEmail(FALLBACK_NOTIFY_ADDRESS, subject, text);
  if (!fallback.ok) {
    console.error(`🔥 [ALERT] Fallback lead email ALSO failed (provider=${getEmailProvider()}):`, JSON.stringify(fallback.error));
    return { notified: false, usedFallback: true, error: fallback.error };
  }
  return { notified: true, usedFallback: true };
}

// ── Audit Notification ─────────────────────────────────────────────────────

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
    console.error('🔥 [ALERT] RESEND_API_KEY missing — audit notification cannot be sent');
    return;
  }

  const adminEmail = process.env.ADMIN_EMAIL || FALLBACK_NOTIFY_ADDRESS;
  const resend = new Resend(apiKey);

  const ADMIN_URL = process.env.ADMIN_URL || 'https://admin.bot-nest.com';
  const adminLink = `${ADMIN_URL}?auditId=${payload.auditId}`;

  const opportunityEmoji = payload.opportunityLabel === 'HOT' ? '🔥' : payload.opportunityLabel === 'WARM' ? '🟠' : '🔵';

  let subject: string;
  let lines: string[];

  if (payload.status === 'completed' && payload.websiteGrowthScore != null) {
    subject = `New Growth Audit — ${payload.businessName} — Score ${payload.websiteGrowthScore}/100`;
    lines = [
      `A new Website Growth Audit has completed.`,
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
      `A Website Growth Audit requires manual review.`,
      '',
      `Business: ${payload.businessName}`,
      `Website:  ${payload.websiteUrl}`,
      `Contact:  ${payload.contactName} <${payload.email}>`,
      `Status:   ${payload.status}`,
      `Reason:   ${payload.failureReason || 'Unknown'}`,
      '',
      `The lead has been saved. Please review manually.`,
      '',
      `Admin: ${adminLink}`,
      `Audit ID: ${payload.auditId}`,
    ];
  }

  try {
    await resend.emails.send({
      from: 'BotNest Audits <onboarding@resend.dev>',
      to: adminEmail,
      subject,
      text: lines.join('\n'),
    });
  } catch (err) {
    console.error('🔥 [ALERT] Audit notification email failed:', err);
  }
}
