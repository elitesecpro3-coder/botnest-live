import 'dotenv/config';

import cors from 'cors';
import express, {
  NextFunction,
  Request,
  Response,
} from 'express';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Chat endpoint
app.post('/api/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-1106-preview', // gpt-4.1-mini alias
      messages,
      max_tokens: 256
    });
    res.json({ reply: completion.choices[0].message?.content });
  } catch (err) {
    next(err);
  }
});

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
