-- BotNest Supabase Schema

create table bots (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  prompt text not null,
  created_at timestamptz default now()
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
