import { Resend } from 'resend';

const NOTIFY_ADDRESS = 'rick@bot-nest.com';

export type LeadNotificationPayload = {
  botId: string;
  name: string;
  phone: string;
  email?: string | null;
};

export async function sendLeadNotification(lead: LeadNotificationPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping lead notification');
    return;
  }

  const resend = new Resend(apiKey);
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  const emailLines = [
    `Name:    ${lead.name}`,
    `Phone:   ${lead.phone}`,
    `Email:   ${lead.email || 'Not provided'}`,
    `Bot ID:  ${lead.botId}`,
    `Time:    ${timestamp} (ET)`,
  ];

  await resend.emails.send({
    from: 'BotNest Leads <leads@bot-nest.com>',
    to: NOTIFY_ADDRESS,
    subject: 'New Lead Captured 🚀',
    text: `A new lead was captured via BotNest.\n\n${emailLines.join('\n')}\n\nLog in to your dashboard to follow up.`,
  });
}
