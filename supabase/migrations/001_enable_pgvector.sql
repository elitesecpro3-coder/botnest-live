-- Migration 001: Enable pgvector for semantic search
-- SAFE: Extension install is idempotent
-- Requires: Supabase project with pgvector enabled (available on all plans)

CREATE EXTENSION IF NOT EXISTS vector;
