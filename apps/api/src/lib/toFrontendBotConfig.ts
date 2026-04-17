import { BotConfig } from '../config/botConfigs';

export type FrontendBotConfig = {
  botId: string;
  businessName: string;
  industry: string;
  welcomeMessage?: string;
  bookingLink: string;
  leadCaptureEnabled: boolean;
  fallbackContact?: string;
  tone: string;
  services: string[];
};

export function toFrontendBotConfig(botId: string, botConfig: BotConfig): FrontendBotConfig {
  return {
    botId,
    businessName: botConfig.businessName,
    industry: botConfig.industry,
    welcomeMessage: botConfig.welcomeMessage,
    bookingLink: botConfig.bookingLink,
    leadCaptureEnabled: botConfig.leadCaptureEnabled,
    fallbackContact: botConfig.fallbackContact,
    tone: botConfig.tone,
    services: botConfig.services,
  };
}
