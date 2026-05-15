-- BotNest Supabase Schema

create table bots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  slug text unique,
  name text,
  business_name text,
  website text,
  booking_link text,
  tone text,
  plan text,
  market text,
  prompt text,
  usage_count integer default 0,
  usage_limit integer default 500,
  welcome_message text,
  system_prompt text,
  fallback_contact text,
  lead_capture_enabled boolean default true,
  is_active boolean default false,
  notification_email text,
  industry text,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid references bots(id),
  session_id text,
  name text,
  phone text,
  email text,
  source text default 'widget',
  message text,
  created_at timestamptz default now()
);

create table usage (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid references bots(id),
  session_id text,
  type text,
  created_at timestamptz default now()
);

-- Sample seed for Felix Lash Studio
insert into bots (slug, name, prompt) values ('felix-lash', 'Felix Lash Studio', 'You are the Felix Lash Studio chatbot. Answer questions about lash services, pricing, and booking.');

-- ─── Lifecycle fields (run as a migration on existing databases) ────────────
-- status: internal lifecycle state — pending | active | past_due | suspended | canceled
-- stripe_status: mirrors Stripe subscription status verbatim
-- stripe_subscription_id / stripe_customer_id: required for webhook correlation
-- payment_failed_at: timestamp of first failed invoice (for grace period logic)
-- suspended_at / canceled_at: audit trail
-- deleted_at: soft-delete marker (null = not deleted)

alter table bots add column if not exists status text not null default 'pending';
alter table bots add column if not exists stripe_status text;
alter table bots add column if not exists stripe_subscription_id text;
alter table bots add column if not exists stripe_customer_id text;
alter table bots add column if not exists payment_failed_at timestamptz;
alter table bots add column if not exists suspended_at timestamptz;
alter table bots add column if not exists canceled_at timestamptz;
alter table bots add column if not exists deleted_at timestamptz;

-- Backfill: any bot that is already is_active=true should be status='active'
update bots set status = 'active' where is_active = true and status = 'pending';

-- Index for webhook lookups by Stripe IDs
create index if not exists bots_stripe_subscription_id_idx on bots (stripe_subscription_id);
create index if not exists bots_stripe_customer_id_idx on bots (stripe_customer_id);
