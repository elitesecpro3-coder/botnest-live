# BotNest Local Dev Setup

## Prerequisites
- Node.js 18+
- pnpm (npm i -g pnpm)
- Supabase project (https://app.supabase.com)
- OpenAI API key

## Setup
1. Copy `.env.example` to `.env` and fill in values.
2. Run Supabase SQL in your project (see supabase.sql).
3. Install deps: `pnpm install`
4. Start API: `pnpm dev:api`
5. Start Widget: `pnpm dev:widget` (build: `pnpm --filter widget build`)
6. Start Admin: `pnpm dev:admin`

## Embedding Widget
Add this to your site:
```html
<script src="https://your-cdn.com/widget.js" data-bot-id="felix-lash" data-api-url="http://localhost:4000"></script>
```

## Notes
- Add more bots in Supabase `bots` table.
- Usage and leads tracked per bot.
- No customer auth, no RAG, no dashboard (MVP).
