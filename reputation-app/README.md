# BotNest Reputation Shield

A SaaS dashboard for local business online reputation management. Built on Next.js 15 App Router, Supabase, and Stripe.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, React 19) |
| Auth + DB | Supabase (PostgreSQL + Auth + RLS) |
| Payments | Stripe Subscriptions |
| Email | Resend + React Email |
| UI | shadcn/ui + Tailwind CSS |
| Deployment | Vercel |

## Features (MVP)

- **Auth** — Supabase email/password sign-up and sign-in
- **Onboarding** — Business profile wizard (name, industry, Google Business URL, location, contact)
- **Dashboard** — Overview with stats (total reviews, avg rating, negative count, open alerts)
- **Reviews** — Full reviews table with status, rating, sentiment, "Draft reply" action
- **Alerts** — Notification feed for negative reviews, with type and status badges
- **AI Response** — Placeholder UI for GPT-4o-mini draft generation (Growth+ gated)
- **Pricing** — 3 plans: Starter $99/mo, Growth $299/mo, Reputation Shield $499/mo
- **Billing portal** — Stripe Customer Portal for subscription management
- **Settings** — Business profile edit + billing section
- **Admin shell** — Internal views for users, businesses, subscriptions (admin-only)

## Plans

| Plan | Price | Locations | AI Drafts | Review Requests |
|---|---|---|---|---|
| Starter | $99/mo | 1 | No | No |
| Growth | $299/mo | 3 | Yes | Yes |
| Reputation Shield | $499/mo | Unlimited | Yes | Yes |

## Local Development

### Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)

### 1. Clone and install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in all values in `.env.local`. See the file for descriptions of each variable.

### 3. Set up Supabase

**Option A — Supabase cloud (recommended):**

1. Create a project at [supabase.com](https://supabase.com)
2. Copy your project URL and keys into `.env.local`
3. Link the project:
   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```
4. Run the migration:
   ```bash
   npm run migration:up
   ```
5. Generate TypeScript types:
   ```bash
   npm run generate-types
   ```

**Option B — Supabase local:**

```bash
npx supabase start
npm run migration:up
```

### 4. Set up Stripe

1. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and log in:
   ```bash
   stripe login
   ```

2. Push products and prices from fixtures:
   ```bash
   stripe fixtures stripe-fixtures.json
   ```

3. In a separate terminal, forward webhooks:
   ```bash
   npm run stripe:listen
   ```
   Copy the `whsec_...` value into `STRIPE_WEBHOOK_SECRET` in `.env.local`.

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database Schema

All tables use Row-Level Security (RLS). Users can only read/write their own data.

```
auth.users (Supabase managed)
  └── businesses          (one per user at MVP)
        └── business_locations (one primary + future multi-location)
        └── reviews             (imported from Google, manual at MVP)
              └── review_alerts (auto-created by trigger on rating <= 3)

subscriptions / prices / products (managed by Stripe webhook)
```

### Key design decisions

- `user_id` is **denormalized** on all tables (including `business_locations` and `reviews`) — this keeps RLS policies simple (`auth.uid() = user_id`) without joins.
- `reviews.is_negative` is a **generated column** (`rating <= 3`) — no application logic needed.
- A **database trigger** (`on_review_inserted`) auto-creates a `review_alerts` record when a review with `rating <= 3` is inserted.

## Route Map

```
/                     -> Redirects to /dashboard (auth) or /login (no auth)
/login                -> Sign in
/signup               -> Sign up
/onboarding           -> Business setup wizard (required before dashboard)
/dashboard            -> Overview (stats + recent reviews)
/reviews              -> Full reviews table
/alerts               -> Notification feed
/response?reviewId=X  -> AI response draft (Growth+ gated)
/settings             -> Business profile + billing
/pricing              -> Public pricing page

/admin                -> Admin overview (admin only)
/admin/customers      -> All businesses
/admin/subscriptions  -> All Stripe subscriptions

/manage-subscription  -> Stripe Customer Portal (redirect)
/api/webhooks         -> Stripe webhook handler
/auth/callback        -> Supabase OAuth callback
```

## Environment Variables

See [`.env.local.example`](.env.local.example) for all required variables with descriptions.

Required for local dev:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `NEXT_PUBLIC_SITE_URL`

Optional:
- `ADMIN_EMAIL` — email that gets admin access (in addition to `user_metadata.role=admin`)
- `OPENAI_API_KEY` — for AI draft generation (Phase 3, not yet implemented)

## Admin Access

Set `ADMIN_EMAIL=your@email.com` in `.env.local`. That email address will have access to `/admin/*` routes. Alternatively, set `user_metadata.role = 'admin'` on a Supabase user via the dashboard.

## Email Preview

```bash
npm run email:dev
```

Opens React Email preview at [http://localhost:3001](http://localhost:3001).

## Deployment (Vercel)

1. Push to GitHub
2. Import into Vercel
3. Set all environment variables from `.env.local.example` in Vercel project settings
4. Set `NEXT_PUBLIC_SITE_URL` to your production URL
5. Add your production domain to Supabase **Auth > URL Configuration > Redirect URLs**
6. In Stripe dashboard, create a production webhook pointing to `https://yourdomain.com/api/webhooks`

## Roadmap (Phase 3+)

- [ ] Google Business API — automated review sync (requires Google verification)
- [ ] AI response draft generation (OpenAI GPT-4o-mini)
- [ ] Review request campaigns (email + SMS)
- [ ] Weekly reputation report email
- [ ] Twilio SMS alerts (Growth+)
- [ ] Multi-location dashboard
- [ ] Competitor monitoring
