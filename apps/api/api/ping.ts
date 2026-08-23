import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.json({ pong: true, env: !!process.env.OPENAI_API_KEY });
}
