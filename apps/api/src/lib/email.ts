import { Resend } from 'resend';

const FALLBACK_NOTIFY_ADDRESS = 'rick@bot-nest.com';

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
    text: `A new lead was captured via BotNest.\n\n${emailLines.join('\n')}\n\nLog in to your dashboard to follow up.`,
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
