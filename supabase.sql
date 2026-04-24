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
  prompt text,
  usage_count integer default 0,
  usage_limit integer default 500,
  welcome_message text,
  system_prompt text,
  fallback_contact text,
  lead_capture_enabled boolean default true,
  is_active boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid references bots(id),
  session_id text,
  name text,
  email text,
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
