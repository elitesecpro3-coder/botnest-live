-- Website Growth Audit Engine
-- Stores one record per audit request from the marketing site form.

create type audit_status as enum (
  'pending',
  'processing',
  'completed',
  'failed',
  'manual_review',
  'reviewed',
  'contacted'
);

create table if not exists public.website_audits (
  id                        uuid primary key default gen_random_uuid(),

  -- Contact / lead info
  contact_name              text not null,
  business_name             text not null,
  email                     text not null,
  phone                     text,
  business_type             text,
  website_url               text not null,

  -- Processing state
  status                    audit_status not null default 'pending',
  failure_reason            text,

  -- Scores (0-100 integers, null until completed)
  website_growth_score      integer check (website_growth_score between 0 and 100),
  opportunity_score         integer check (opportunity_score between 0 and 100),  -- internal only

  -- Score breakdown per category (stored as jsonb for flexibility)
  category_scores           jsonb,   -- {conversion: 14, mobile: 10, performance: 11, ...}

  -- Extracted site signals (raw structured data from scraper)
  extracted_data            jsonb,

  -- AI-generated analysis
  findings                  jsonb,   -- array of Finding objects
  strengths                 jsonb,   -- array of strength strings
  executive_summary         text,
  recommendations           jsonb,   -- array of recommendation strings
  recommended_package       text,    -- 'starter' | 'growth' | 'scale'
  sales_angle               text,    -- internal sales brief
  opportunity_label         text,    -- 'HOT' | 'WARM' | 'LOW_PRIORITY'

  -- Raw metadata for debugging / cost tracking
  raw_analysis_metadata     jsonb,   -- tokens used, model, duration, etc.

  -- Report HTML (generated, stored for fast retrieval)
  report_html               text,

  -- Timestamps
  created_at                timestamptz not null default now(),
  processing_started_at     timestamptz,
  completed_at              timestamptz,
  reviewed_at               timestamptz,
  contacted_at              timestamptz
);

-- Index for admin list view (newest first)
create index idx_website_audits_created_at on public.website_audits (created_at desc);
-- Index for status filtering
create index idx_website_audits_status on public.website_audits (status);
-- Index for email dedup check
create index idx_website_audits_email on public.website_audits (email);

-- RLS: service-role key bypasses RLS. No public access.
alter table public.website_audits enable row level security;

-- No policies means zero public access — only service-role can touch this table.
