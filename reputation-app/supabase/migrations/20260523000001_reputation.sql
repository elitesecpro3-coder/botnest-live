-- ============================================================
-- BotNest Reputation Shield — Core Schema
-- Migration: 20260523000001_reputation
-- ============================================================
-- Designed for multi-tenant isolation via RLS.
-- Every table with user data is protected: users see ONLY
-- their own records. Admin access is handled at the app layer.
-- ============================================================


-- ── BUSINESSES ───────────────────────────────────────────────
-- One user can own one or more businesses.
-- MVP: one business per user; schema supports multi later.
create table businesses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  name            text not null,
  website         text,
  google_profile_url text,         -- Google Business Profile link (manual at MVP)
  contact_email   text,
  contact_phone   text,
  industry        text,
  onboarding_completed_at timestamptz,
  created_at      timestamptz default timezone('utc', now()) not null,
  updated_at      timestamptz default timezone('utc', now()) not null
);

alter table businesses enable row level security;
create policy "Users manage own businesses"
  on businesses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index businesses_user_id_idx on businesses (user_id);


-- ── BUSINESS LOCATIONS ───────────────────────────────────────
-- Each business can have multiple locations (Starter: 1, Shield: multi).
create table business_locations (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses on delete cascade not null,
  user_id         uuid references auth.users not null,  -- denormalized for RLS simplicity
  name            text not null default 'Primary Location',
  address         text,
  city            text,
  state           text,
  zip             text,
  country         text default 'US',
  google_place_id text,            -- for future Google API integration
  google_review_link text,         -- shareable review link
  is_primary      boolean default true,
  created_at      timestamptz default timezone('utc', now()) not null,
  updated_at      timestamptz default timezone('utc', now()) not null
);

alter table business_locations enable row level security;
create policy "Users manage own locations"
  on business_locations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index business_locations_business_id_idx on business_locations (business_id);
create index business_locations_user_id_idx    on business_locations (user_id);


-- ── REVIEWS ──────────────────────────────────────────────────
-- Stores review records. Source is 'google' at MVP.
-- At MVP: inserted manually or via future API sync.

create type review_source   as enum ('google', 'yelp', 'facebook', 'manual');
create type review_sentiment as enum ('positive', 'neutral', 'negative');
create type response_status  as enum ('pending', 'drafted', 'responded', 'ignored');

create table reviews (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses on delete cascade not null,
  location_id     uuid references business_locations on delete set null,
  user_id         uuid references auth.users not null,  -- denormalized for RLS

  -- Review content
  source          review_source not null default 'google',
  external_id     text,                  -- ID from the source platform (e.g. Google review ID)
  author_name     text,
  author_avatar   text,
  rating          smallint not null check (rating >= 1 and rating <= 5),
  review_text     text,
  review_date     timestamptz,

  -- Processing
  sentiment       review_sentiment,      -- computed or AI-assigned
  response_status response_status not null default 'pending',
  responded_at    timestamptz,
  response_text   text,                  -- the response that was sent

  -- AI draft
  ai_draft        text,                  -- generated draft response (Phase 3)

  -- Flags
  is_negative     boolean generated always as (rating <= 3) stored,
  is_flagged      boolean default false, -- manually flagged for attention

  created_at      timestamptz default timezone('utc', now()) not null,
  updated_at      timestamptz default timezone('utc', now()) not null,

  unique (source, external_id)           -- prevent duplicate imports
);

alter table reviews enable row level security;
create policy "Users manage own reviews"
  on reviews for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index reviews_business_id_idx on reviews (business_id);
create index reviews_user_id_idx     on reviews (user_id);
create index reviews_rating_idx      on reviews (rating);
create index reviews_is_negative_idx on reviews (is_negative);
create index reviews_review_date_idx on reviews (review_date desc);


-- ── REVIEW ALERTS ────────────────────────────────────────────
-- Triggered when a new low-rating review is detected.

create type alert_type   as enum ('low_rating', 'no_response', 'competitor', 'spike');
create type alert_status as enum ('new', 'seen', 'resolved', 'dismissed');

create table review_alerts (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references businesses on delete cascade not null,
  user_id     uuid references auth.users not null,
  review_id   uuid references reviews on delete cascade,

  alert_type  alert_type not null default 'low_rating',
  status      alert_status not null default 'new',
  title       text not null,
  message     text,

  -- Email notification tracking
  email_sent_at timestamptz,
  sms_sent_at   timestamptz,       -- future: Twilio SMS (Growth+)

  seen_at     timestamptz,
  resolved_at timestamptz,
  created_at  timestamptz default timezone('utc', now()) not null
);

alter table review_alerts enable row level security;
create policy "Users manage own alerts"
  on review_alerts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index review_alerts_business_id_idx on review_alerts (business_id);
create index review_alerts_user_id_idx     on review_alerts (user_id);
create index review_alerts_status_idx      on review_alerts (status);
create index review_alerts_created_at_idx  on review_alerts (created_at desc);


-- ── AUTO-ALERT TRIGGER ───────────────────────────────────────
-- Automatically create a low_rating alert when a review with
-- rating <= 3 is inserted.
create or replace function handle_new_review_alert()
returns trigger as $$
begin
  if new.rating <= 3 then
    insert into review_alerts (
      business_id, user_id, review_id,
      alert_type, status, title, message
    ) values (
      new.business_id,
      new.user_id,
      new.id,
      'low_rating',
      'new',
      case new.rating
        when 1 then '1-star review needs your attention'
        when 2 then '2-star review posted'
        else        '3-star review — consider responding'
      end,
      coalesce(
        'From ' || new.author_name || ': "' || left(new.review_text, 120) || '…"',
        'A ' || new.rating || '-star review was posted.'
      )
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_review_inserted
  after insert on reviews
  for each row execute procedure handle_new_review_alert();


-- ── UPDATED_AT AUTO-UPDATE ───────────────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger businesses_updated_at
  before update on businesses
  for each row execute procedure set_updated_at();

create trigger business_locations_updated_at
  before update on business_locations
  for each row execute procedure set_updated_at();

create trigger reviews_updated_at
  before update on reviews
  for each row execute procedure set_updated_at();


-- ── DEMO SEED DATA ───────────────────────────────────────────
-- Placeholder: real data inserted via app after onboarding.
-- Run seed.sql separately for development demo data.
