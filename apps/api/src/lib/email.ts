import { Resend } from 'resend';

const FALLBACK_NOTIFY_ADDRESS = 'rick@bot-nest.com';
const WIDGET_API_URL = 'https://botnest-live-production.up.railway.app';

export type SetupEmailPayload = {
  businessName: string;
  botId: string;
  website: string;
  bookingLink?: string | null;
  notificationEmail?: string | null;
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

  const embedCode = [
    `<script src="${WIDGET_API_URL}/widget.js"`,
    `  data-bot-id="${payload.botId}"`,
    `  data-api-url="${WIDGET_API_URL}">`,
    `</script>`,
  ].join('\n');

  const lines = [
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

  await resend.emails.send({
    from: 'BotNest Setup <leads@bot-nest.com>',
    to: target,
    subject: `Your BotNest widget is ready — ${payload.businessName}`,
    text: lines.join('\n'),
  });
}

export type LeadNotificationPayload = {
  botId: string;
  name: string;
  phone: string;
  email?: string | null;
  notificationEmail?: string | null;
};

export async function sendLeadNotification(lead: LeadNotificationPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('🔥 [ALERT] RESEND_API_KEY missing — email system disabled');
    return;
  }

  const target = lead.notificationEmail || FALLBACK_NOTIFY_ADDRESS;
  const resend = new Resend(apiKey);
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  const emailLines = [
    `Name:    ${lead.name}`,
    `Phone:   ${lead.phone}`,
    `Email:   ${lead.email || 'Not provided'}`,
    `Bot ID:  ${lead.botId}`,
    `Time:    ${timestamp} (ET)`,
  ];

  const message = {
    from: 'BotNest Leads <leads@bot-nest.com>',
    subject: 'New Lead Captured 🚀',
    text: `A new lead was captured via BotNest.\n\n${emailLines.join('\n')}\n\nNeed help? Reply to this email or schedule a setup call with BotNest: https://calendly.com/rick-bot-nest/30min`,
  };

  try {
    await resend.emails.send({ ...message, to: target });
  } catch (err) {
    console.error('🔥 [ALERT] Primary email failed, sending fallback:', err);
    if (target !== FALLBACK_NOTIFY_ADDRESS) {
      await resend.emails.send({ ...message, to: FALLBACK_NOTIFY_ADDRESS });
    }
  }
}
