import { NextFunction, Request, Response, Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { createKnowledgeItem, searchKnowledge } from '../lib/knowledgeSearch';

let _sb: ReturnType<typeof createClient> | null = null;
function getSb() {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}
const supabase = new Proxy({} as ReturnType<typeof createClient>, { get(_t, p) { return (getSb() as any)[p]; } });

const VALID_TYPES = ['faq', 'service', 'pricing', 'policy', 'promotion', 'info'];

export function createKnowledgeRouter(): Router {
  const router = Router();

  // POST /api/knowledge — create a knowledge item and trigger embedding
  router.post('/knowledge', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { botId, type, title, content, metadata } = req.body as {
        botId?: string;
        type?: string;
        title?: string;
        content?: string;
        metadata?: Record<string, unknown>;
      };

      if (!botId) return res.status(400).json({ error: 'botId is required' });
      if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
      if (!content?.trim()) return res.status(400).json({ error: 'content is required' });

      const itemType = VALID_TYPES.includes(type ?? '') ? (type as string) : 'info';

      const id = await createKnowledgeItem(botId, itemType, title.trim(), content.trim(), metadata ?? {});

      return res.status(201).json({ id, message: 'Knowledge item created. Embedding in progress.' });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/knowledge/bulk — create multiple items at once
  router.post('/knowledge/bulk', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { botId, items } = req.body as {
        botId?: string;
        items?: Array<{ type?: string; title: string; content: string; metadata?: Record<string, unknown> }>;
      };

      if (!botId) return res.status(400).json({ error: 'botId is required' });
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items array required' });
      if (items.length > 100) return res.status(400).json({ error: 'Maximum 100 items per bulk upload' });

      const ids: string[] = [];
      const errors: Array<{ index: number; error: string }> = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.title?.trim() || !item.content?.trim()) {
          errors.push({ index: i, error: 'title and content are required' });
          continue;
        }
        try {
          const itemType = VALID_TYPES.includes(item.type ?? '') ? (item.type as string) : 'info';
          const id = await createKnowledgeItem(botId, itemType, item.title.trim(), item.content.trim(), item.metadata ?? {});
          ids.push(id);
        } catch (err) {
          errors.push({ index: i, error: err instanceof Error ? err.message : 'Unknown error' });
        }
      }

      return res.status(201).json({
        created: ids.length,
        errors: errors.length,
        ids,
        errorDetails: errors.length > 0 ? errors : undefined,
      });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/knowledge/:botId — list knowledge items for a bot
  router.get('/knowledge/:botId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { botId } = req.params;
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;

      const query = supabase
        .from('knowledge_items')
        .select('id, type, title, content, metadata, is_active, created_at, updated_at')
        .eq('bot_id', botId)
        .order('created_at', { ascending: false });

      if (type && VALID_TYPES.includes(type)) {
        query.eq('type', type);
      }

      const { data, error } = await query;
      if (error) return next(new Error(error.message));

      return res.json({ items: data ?? [] });
    } catch (err) {
      return next(err);
    }
  });

  // DELETE /api/knowledge/:id — deactivate (soft delete) a knowledge item
  router.delete('/knowledge/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { error } = await supabase
        .from('knowledge_items')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) return next(new Error(error.message));
      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/knowledge/search — test semantic search
  router.post('/knowledge/search', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { botId, query, type } = req.body as {
        botId?: string;
        query?: string;
        type?: string;
      };

      if (!botId || !query) return res.status(400).json({ error: 'botId and query required' });

      const results = await searchKnowledge(botId, query, type ?? null, 5);
      return res.json({ results });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
