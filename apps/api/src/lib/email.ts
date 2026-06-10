import { Resend } from 'resend';

const FALLBACK_NOTIFY_ADDRESS = 'rick@bot-nest.com';
const WIDGET_API_URL = 'https://botnest-live-production.up.railway.app';

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
    `<script src="${WIDGET_API_URL}/widget.js"`,
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

  await resend.emails.send({
    from: 'BotNest Setup <leads@bot-nest.com>',
    to: target,
    subject,
    text: lines.join('\n'),
  });
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

export async function sendLeadNotification(lead: LeadNotificationPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('🔥 [ALERT] RESEND_API_KEY missing — email system disabled');
    return;
  }

  const target = lead.notificationEmail || FALLBACK_NOTIFY_ADDRESS;
  const resend = new Resend(apiKey);
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

  const message = {
    from: 'BotNest Leads <leads@bot-nest.com>',
    subject,
    text,
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
