# Rubio International Enterprizes — BotNest Multi-Site Implementation (Revision 3)

Status: **Security hardening is implemented and tested on branch `security/rubio-multisite-hardening` (commit `8ce2cc7`, local, not pushed) and verified on a non-production Vercel Preview. It is NOT deployed to Production, the `allowed_domains` migration is NOT applied, and no Rubio users/bots exist.**
Revision 3 date: 2026-09-20. Sections 1-8 below describe the audit of the code **as it was on `main`** (before hardening); Section 0 records what has changed since.
Companion documents: [BOTNEST-SECURITY-HARDENING.md](BOTNEST-SECURITY-HARDENING.md) (what was fixed, how, tests, limits, rollback, manual steps) and [RUBIO-BOT-CREATION-PLAN.md](RUBIO-BOT-CREATION-PLAN.md) (bot inventory, per-bot template, SQL, sequence, rollback, tests).

## 0. What changed since the audit (hardening branch)

| Audit finding (Section 5) | Status on the branch |
|---|---|
| Unauthenticated `/api/knowledge*`, `/api/onboard`, `/api/createBot` | Fixed: `BOTNEST_ADMIN_API_KEY` required, fail-closed (503 if unset), constant-time compare, key never logged |
| `create-checkout-session` with a `botId` lets anyone re-key/activate another bot via the Stripe webhook | Fixed: targeting an existing `botId` now requires the admin key (public website flow unaffected) |
| No bot-to-domain binding; global CORS blocks legitimate customer sites | Fixed: `bots.allowed_domains` + server-side per-bot origin check on config/chat/lead + widget-specific CORS. Rubio domains go in `allowed_domains`, **never** in `FRONTEND_ORIGINS` |
| `/api/lead` unvalidated, leaks raw DB errors | Fixed: bot must exist and be active, origin enforced, field caps, generic errors |
| Per-IP-only rate limits | Improved: per-IP and per-bot limits for chat/lead, strict admin limits + failed-auth lockout (best-effort on serverless, see limitations) |
| `system_prompt` ignored | Fixed: appended to the system prompt (legacy bots unchanged) |
| Embed snippet host 404 | Fixed: `https://bot-nest.com/widget.js`; the old `api.bot-nest.com/widget.js` URL now 302-redirects there |

Still true and unchanged: Rubio `users` row and bots do not exist; open decisions in Section 8 (domains, phone, emails, Spanish, guardrail wording) still block bot creation. **Rubio bots must be created only after the manual steps in BOTNEST-SECURITY-HARDENING.md Section 13 are done.**

---

## 1. Access status

### Vercel — VERIFIED
| Check | Result |
|---|---|
| Authenticated user | `elitesecpro3-coder` (was `artifexrapidsolutions-8269` in revision 1 — wrong account) |
| Team visible | `bot-nest` ("elitesecpro3-coder's projects") — the real BotNest team |
| Projects visible | `botnest-website` (prod `https://bot-nest.com`), `botnest-api` (prod `https://api.bot-nest.com`), `botnest-live-site` (`botnest-live-site.vercel.app`, not part of this work) |
| Local links | `BotNestWebsite/.vercel` → `prj_SrHkDJI599EeHiBjC8lI5gdqekSH` (botnest-website); `apps/api/.vercel` → `prj_VBUglBYJbPdnG9019vILJQiEn6Sb` (botnest-api). Both IDs match the live projects. **Links are correct and were not modified.** |
| Domains in team | `bot-nest.com` only (`api.bot-nest.com` is attached to `botnest-api`) |
| Env var names, `botnest-api` | `RESEND_API_KEY`, `NODE_ENV`, `API_PUBLIC_URL`, `FRONTEND_ORIGINS`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` — all **Production + Preview**; **none in Development** |
| Env var names, `botnest-website` | none |

Non-secret values read for the audit (temp file deleted immediately): `FRONTEND_ORIGINS = https://bot-nest.com` (single origin), `API_PUBLIC_URL = https://api.bot-nest.com`.

### Supabase — VERIFIED and LINKED
- CLI: `npx supabase@latest` (v2.117.0), authenticated. No global install, no change to repo `package.json`.
- Projects visible: `botnest-prod` (`jszjlmvscyubgxjvgepj`, us-east-1, ACTIVE_HEALTHY, PG 17) and `reputation-shield-prod` (`bjuybrkqojhagnaxdpxu`, INACTIVE — separate project, not used by BotNest API).
- `supabase link --project-ref jszjlmvscyubgxjvgepj` executed. It wrote only local files under `supabase/.temp/` (**not gitignored — add `supabase/.temp/` to `.gitignore` before committing**). No remote change.
- All schema inspection was read-only `SELECT`s via `supabase db query --linked`. (The CLI initialises a temporary `cli_login_postgres` role on first use — standard CLI behaviour.)

---

## 2. Live schema (botnest-prod)

Public tables (all RLS enabled): `bots` (31 cols), `users` (4), `leads` (15), `conversations` (12), `messages` (7), `knowledge_items` (10), `tools` (7), `escalations` (9), `tool_calls` (9), `website_audits` (27). Views (security_invoker): `v_active_conversations`, `v_bot_usage`, `v_leads_with_context`. There is **no `usage` table** (present in `supabase.sql`, never applied). Extensions: `vector`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault`.

Custom functions: `search_knowledge`, `upsert_conversation`, `increment_conversation_turns`, `update_conversation_discovered`, `get_recent_messages`, `set_updated_at` (all pinned to `search_path = pg_catalog, public`).

Migration history on the remote: exactly one, `20260914175618 secure_botnest_public_schema` (RLS on `users/bots/leads`, service-role-only policies, `security_invoker` views, function search_path pinning). **This migration is not present in the local `supabase/migrations/` folder** — local migrations 001–011 were applied by hand via the SQL editor and are not in the remote history. Pull or recreate it locally before adding new migrations so history does not diverge.

**Policies:** every table has a single policy `Service role full access` (`TO service_role`, `true`). `anon`/`authenticated` have no policy, so RLS denies them. *Hardening note (not blocking):* table-level GRANTs for `anon`/`authenticated` are still ALL (including TRUNCATE/DELETE). RLS makes this inert today, but revoking those grants would remove a single point of failure.

`bots` key columns: `id uuid PK default gen_random_uuid()`, `user_id uuid NOT NULL`, `business_name text NOT NULL`, `website text`, `industry`, `description`, `tone NOT NULL default 'professional'`, `welcome_message`, `system_prompt`, `fallback_contact`, `booking_link`, `notification_email`, `lead_capture_enabled bool`, `market`, `plan`, `is_active bool default false`, `status text NOT NULL default 'pending'`, `usage_count/usage_limit`, `stripe_*`, `slug`, `name`, `prompt`, lifecycle timestamps. **No `services` column, no theme column, no allowed-domain column.**

Live data (aggregate only): 5 bots, all owned by one `users` row; 1 real production bot (BotNest's own, `bot-nest.com`, 17 leads, 34 knowledge items) plus 4 test bots (`example.com`-style hosts). **There are no external paying-customer bots yet**, so introducing per-bot restrictions cannot break an existing customer.

---

## 3. Verified answers about the multi-bot model (with corrections)

**Corrections to revision 1**
1. **`bots.user_id` IS a real foreign key**: `bots_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`. Revision 1 said it was a bare UUID — wrong. `users` is a small custom table (`id, email UNIQUE NOT NULL, plan CHECK IN ('starter','pro'), created_at`), **not** `auth.users`.
2. `bots.slug` has **no unique constraint** in the live DB (only `supabase.sql` declares one). Still unused by code.
3. `https://api.bot-nest.com/widget.js` returns **404** in production (the `/widget.js` route exists only in `server.ts`, not in the Vercel entrypoint `api/index.ts`). The live embed loads the script from `https://bot-nest.com/widget.js` (static site). `onboard.ts` generates a snippet pointing at the 404 URL — that generated snippet is broken in production.

**A. Can one new Rubio customer UUID be shared by all Rubio bots?** Yes — but "customer UUID" must be a row in `users` first (FK). Steps: insert one `users` row for Rubio, then insert the bots referencing its `id`. `bots_user_id_idx` already exists, so `where user_id = …` is indexed. Today all 5 bots already share one `user_id`, proving many-bots-per-user works at the DB level.

**B. Will it break current queries/assumptions?** No. Nothing in `apps/api` filters or joins on `user_id`; it is only written on insert (`createBot.ts`, `onboard.ts`, `stripeWebhook.ts` all use one hardcoded UUID `c5ea980f-…`, which equals the sole existing `users.id`). Views don't reference it. The `reputation-app` `user_id` columns reference `auth.users` in a different schema/project and are unrelated.

**C. Referenced by FKs / auth logic?** FK: yes (`bots → users`, cascade). Auth logic: no code reads `user_id` for authorization anywhere in `apps/api`. **Danger:** because of `ON DELETE CASCADE`, deleting the Rubio `users` row would delete all Rubio bots and (via `leads_bot_id_fkey … ON DELETE CASCADE`) all their leads. `conversations`, `messages`, `knowledge_items`, `tools` have **no FK** to `bots`, so they would be orphaned, not deleted. Rollback procedures must never `DELETE FROM users`.

**D. UUID typed?** Yes, `uuid NOT NULL`.

**E. Does any code assume one bot per user?** No. Full-repo search found no `.eq('user_id')`/`.single()` on `user_id` in `apps/api`. **However**, two lookups assume one bot per Stripe id: `getBotByStripeSubscriptionId` / `getBotByStripeCustomerId` use `.single()`. If several Rubio bots shared one `stripe_subscription_id` or `stripe_customer_id`, those lookups would fail (return null) and Stripe webhooks/lifecycle would silently stop matching. **Leave all `stripe_*` columns NULL on Rubio bots** (or use one subscription per bot).

**Conclusion:** the shared-`users`-row strategy is safe with zero schema change. An `organizations` table is not needed now.

---

## 4. How the widget/embed works (verified live)

```html
<script src="https://bot-nest.com/widget.js"
        data-bot-id="00000000-0000-0000-0000-000000000000"
        data-api-url="https://api.bot-nest.com"></script>
```
(sample UUID; this is exactly the pattern on the live bot-nest.com pages.) `widget.js` byte-identical in three places (repo `apps/widget/dist`, repo `BotNestWebsite/widget.js`, live `bot-nest.com/widget.js`, SHA-256 prefix `5CEC5F50…`). The widget reads `data-bot-id` / `data-api-url` / `data-lang` from its script tag, then:

1. `GET {api}/api/config/{botId}` → `businessName, industry, welcomeMessage, bookingLink, leadCaptureEnabled, fallbackContact, tone, services(always []), market`
2. `POST {api}/api/chat` `{botId, message, sessionId, context}`
3. `POST {api}/api/lead` `{botId, name, phone, email}` (also written by the `capture_lead` LLM tool)

Widget limits found: UI strings exist only for **English and Vietnamese** (`data-lang="vi"` or `market='vn'`; anything else = English); colors are hardcoded (no theme config); no per-bot theme.

**How the bot's behavior is actually built (important for Rubio):** `chat.ts` calls `buildDynamicPrompt(business_name, industry, description, market)` + RAG hits from `knowledge_items` + fixed tool rules. **`bots.system_prompt`, `bots.prompt`, and `tone` are never read by the chat route** (only `welcome_message`, `booking_link`, `fallback_contact`, `notification_email`, `market` etc. are). So today, per-bot behavior can only be shaped via `description` and `knowledge_items`. A small code change (Section 8 of the creation plan) is recommended so guardrails can live in `system_prompt`.

---

## 5. Public embed security audit (current exact behavior)

Route-by-route (production, `apps/api/api/index.ts`):

| Route | Auth | Bot/origin binding | Notes |
|---|---|---|---|
| `GET /api/config/:botId` | none | none | Returns config to any caller; unknown id → demo config (200); `is_active=false` → 403 |
| `POST /api/chat` | none | none | Per-IP limit 30/min; per-bot `usage_limit` cap (paid OpenAI); creates conversations/messages keyed by client-chosen `sessionId` |
| `POST /api/lead` | none | none | No bot existence/active check before insert (bad id → FK error text returned in a 500); notification email fired to the bot's `notification_email` → spam vector |
| `GET/POST/DELETE /api/knowledge*` | **none** | none | List, create, bulk-create, delete (by item id only), search — for **any** bot id |
| `POST /api/onboard`, `/createBot`, `/create-bot` | **none** | n/a | Anyone can create an **active** bot; `/onboard` can trigger a setup email to an arbitrary address |
| `POST /api/create-checkout-session`, `/stripe-webhook`, `GET /api/session/:id/bot` | Stripe-mediated | n/a | Not part of widget path |

**Can a third party use a valid bot UUID on another domain?**
- **Browser on another domain:** *Currently blocked, by accident of configuration.* Production `FRONTEND_ORIGINS` contains only `https://bot-nest.com`; the global CORS middleware rejects every other origin with a 500 without CORS headers (verified live: `Origin: https://evil.example` → 500; `https://www.bot-nest.com` → also 500; `https://bot-nest.com` → 200 with `Access-Control-Allow-Origin`). This is a *global* allow-list, not per-bot. Consequences: (a) it also means **no customer site — including any Rubio site — can use the widget in a browser today**; (b) the moment origins are added to that list, every listed origin can use every bot.
- **Non-browser client (curl/script/server):** *Not blocked at all.* Requests without an `Origin` header pass CORS unconditionally (verified: `GET /api/config/…` and `GET /api/knowledge/…` return 200 with no Origin and no credentials). A caller with a bot UUID (public in page source) can chat (costing OpenAI money and consuming that bot's `usage_limit`, which can lock the real customer out), submit fake leads (spam + notification emails), and — worse — **read, inject and delete that bot's knowledge base** (`/api/knowledge*`), which lets an attacker poison what a Rubio bot tells visitors.
- Rate limiting is per-IP only (60/min general, 30/min chat); nothing is per-bot.

**Severity ranking for the Rubio launch**
1. **High** — unauthenticated `/api/knowledge*`, `/api/onboard`, `/api/createBot`. Independent of domain restriction; origin checks would not fix it. Must be gated (shared admin secret header) before Rubio goes live.
2. **High** — no binding between bot and domain; global CORS is the only control and it blocks legitimate customers.
3. **Medium** — `/api/lead` no bot validation, spam/email amplification; no per-bot rate limit.
4. **Low** — broad `anon`/`authenticated` table grants (inert under RLS); raw DB errors returned to clients.

---

## 6. Recommended design: per-bot `allowed_domains`

**Choice: a `text[]` column on `bots`, not a `bot_domains` table.** Rationale: `getBotConfig()` already does `select('*')` on `bots` for every config/chat call, so the check costs zero extra queries; a bot has a handful of domains; one atomic row edit; `NOT NULL DEFAULT '{}'` is a metadata-only change on PG 17 (no table rewrite) and every existing row keeps legacy behavior. A join table only pays off if domains needed their own metadata or cross-bot uniqueness — not the case here.

Semantics:
- `allowed_domains = '{}'` (default) → **legacy behavior exactly as today** (global `FRONTEND_ORIGINS` for browser origins; requests without Origin allowed). No existing bot changes.
- non-empty → enforce on `config`, `chat`, `lead` **before** any conversation/message/lead is written.
- Entry forms (**as implemented**): every entry is matched as an **exact host**. `example.com` does **not** admit `www.example.com` — list both if both are used. `*.example.com` must be written explicitly (any depth, never the apex). `localhost` / `127.0.0.1` (any port, http or https) only if explicitly listed; an exact Vercel/Wix preview host. Wildcards over shared hosting suffixes (`*.vercel.app`, `*.wixsite.com`, ...) and over public-suffix-like bases (`*.com`, `*.co.uk`) are rejected because they would authorize every tenant of those platforms. (Revision 2 of this document said an apex entry also admitted `www`; the implementation is deliberately stricter.)
- Origin resolution: `Origin` header → else `Referer` origin → else none. `Origin: null` (sandboxed iframes) is treated as none. Non-`https` origins are denied unless the host is `localhost`/`127.0.0.1`. Port ignored; host lowercased, trailing dot stripped.
- Restricted bot + no/unmatched origin → HTTP 403 `{error:'domain_not_allowed'}` (no CORS headers), warn-log `botId + origin` only.
- CORS: widget endpoints (`/api/config`, `/api/chat`, `/api/lead`) need a dedicated CORS layer — preflight `OPTIONS` cannot know the bot (botId is in the body), so it reflects the origin, and the *real* per-bot decision is made server-side in the handler; ACAO is set on the actual response only if allowed. All other routes keep the strict global `FRONTEND_ORIGINS` list.
- **Not relying on CORS alone:** the server-side check runs regardless of CORS, and it also covers `capture_lead` because that tool runs inside an already-checked `/api/chat` request.
- **Spoofing limits (be explicit with the client):** browsers cannot forge `Origin`, so this stops other websites from embedding a Rubio bot. A non-browser client can forge `Origin`/`Referer` with a valid UUID. Therefore domain-locking is *necessary, not sufficient*; pair it with (i) auth on admin routes (item 1 above) and (ii) per-bot + per-IP rate limits and a lead-spam control (Phase B in the creation plan). A signed short-lived session token issued by `/config` and required by `/chat`/`/lead` is an optional later hardening.
- **Wix caveat:** Wix "Embed HTML" elements run in an iframe on a Wix static-file origin, which will (correctly) fail the domain check. Install the script through Wix **Settings → Custom Code** (needs a Premium plan) so it runs on the real page origin. Wix preview/editor origins need testing and, if used, exact-host entries added temporarily.
- **One domain vs. many:** the Rubio Wix hand-off describes the family as **pages inside one Wix site** with domains undecided. `Origin` has no path, so if all eight bots live on one host, domain-locking can only stop *other domains* from using them — it cannot stop the Tax page from loading the Mando bot id. That is acceptable but must be a conscious decision (see Open Decisions).

---

## 7. Rubio structure (summary — details in the creation plan)

- Tenant = one new `users` row ("Rubio International Enterprizes") → 8 `bots` rows sharing its `id`.
- 8 bots: Rubio International (parent hub), Florida Transport Services (umbrella), RuMora Transport, Mando Transport, IAM Transport, Rubio Tax Services, Rubio Credit & Financial, Rubio Health & Wellness. This matches the 8 business-line pages in the demo site exactly.
- **Notary Public** (child of Tax; "associated with Rubio Tax Services, LLC") → **no separate bot**; served by the Rubio Tax bot.
- **Notary Signing Agent** (associated with a *different* entity, Rubio Accounting and Bookkeeping Services, LLC, whose site status is unknown) → **no separate bot for now**; use the parent Rubio International bot (routing) until that entity's site/scope is confirmed. Conditional trigger for a 9th bot: that entity gets its own domain/lead destination.
- Directory-only services (Translation, Document Filing, Human Rights Advocacy, Consultants, US Diplomacy) have no pages and no confirmed content → handled by the parent bot's routing only.
- Create bots **inactive** (`is_active=false`, `status='pending'`) first; a placeholder inactive bot already returns 403/`inactive` from both `config` and `chat`.

---

## 8. Open decisions / blockers before creating any Rubio bot

1. Domain plan: one Wix domain with 8 pages, or up to 8 domains? (drives `allowed_domains`, Wix Custom Code install, CORS)
2. The shared phone `1 (877) 277-6266` is labeled a **demo** number in the hand-off — confirm production numbers per business.
3. Rubio `users` row needs a real email (UNIQUE NOT NULL) and plan (`starter`/`pro`) — client/BotNest-owned address TBD.
4. Lead destination email per bot (`notification_email`) — none provided.
5. Spanish: the demo checklist asks whether pages need English + Spanish; the widget UI supports only en/vi.
6. Guardrail wording (tax/credit/wellness/transport claims) needs client legal review; nothing has been invented.
7. ~~Authorize the code changes~~ — done on the hardening branch (see Section 0); still awaiting your review, the manual steps, and deployment.

Explicitly not done: no bot/users rows created, no SQL writes or migrations applied, no Production deploy, no secrets printed, no Vercel/Supabase project created or unlinked. (Hardening-session side effects — a Preview deployment, a Vercel deployment-protection bypass token, and a `BOTNEST_ADMIN_API_KEY` variable in Production whose value is unknown — are listed in BOTNEST-SECURITY-HARDENING.md Section 13.)
