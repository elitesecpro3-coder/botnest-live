import { BotConfig } from '../config/botConfigs';

export function buildSystemPrompt(botConfig: BotConfig): string {
  const serviceList = botConfig.services.join(', ');
  const rulesList = botConfig.rules.join(' ');
  const leadGuidance = botConfig.leadCaptureEnabled
    ? 'When relevant, guide toward booking and collect name plus phone naturally. Email is optional.'
    : 'Do not request personal contact details unless user asks.';

  return [
    `You are the chatbot for ${botConfig.businessName} (${botConfig.industry}).`,
    `Tone: ${botConfig.tone}.`,
    `Services: ${serviceList}.`,
    `Booking link: ${botConfig.bookingLink}.`,
    leadGuidance,
    rulesList,
    'Keep responses concise, business-focused, and action-oriented.',
    'Use short replies and avoid long paragraphs.',
    'If details are unknown, do not invent facts. Offer booking or contact next step instead.'
  ].join(' ');
}
