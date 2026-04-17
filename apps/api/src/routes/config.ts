import {
  Request,
  Response,
  Router,
} from 'express';

import { botConfigs } from '../config/botConfigs';
import { toFrontendBotConfig } from '../lib/toFrontendBotConfig';

export function createConfigRouter(): Router {
  const router = Router();

  router.get('/config/:botId', (req: Request<{ botId: string }>, res: Response) => {
    const { botId } = req.params;
    const botConfig = botConfigs[botId];

    if (!botConfig) {
      return res.status(404).json({ error: `Unknown botId: ${botId}` });
    }

    return res.json(toFrontendBotConfig(botId, botConfig));
  });

  return router;
}
