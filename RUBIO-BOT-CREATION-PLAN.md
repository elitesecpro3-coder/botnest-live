# Rubio International Enterprizes — Bot Creation Plan

Status: **PLAN ONLY. Nothing in this document has been executed.** No bots, users, schema changes, deploys or env changes exist as a result of it.
Date: 2026-09-20. Read with [RUBIO-BOTNEST-IMPLEMENTATION.md](RUBIO-BOTNEST-IMPLEMENTATION.md) (verified access, live schema, security audit, design rationale).
Source of business facts: the demo site at `D:\BotNest\ArmandoRubioSite\rewebsitedesignpreviewrubiointernational` (`WIX-HANDOFF.md`, `CLIENT-DEMO-CHECKLIST.md`, the 12 HTML pages). Anything not stated there is **TBD** — nothing has been invented.

---

## 1. Proposed 8-bot structure

Tenant: one `users` row, "Rubio International Enterprizes" (`{RUBIO_USER_ID}`), owning all eight bots.

| # | Bot (`business_name`) | Legal entity per hand-off | Role | Demo page it maps to |
|---|---|---|---|---|
| 1 | Rubio International Enterprizes | Rubio International Enterprizes (final legal wording TBD) | Parent hub / router to every business line and to directory-only services | `rubio-enterprizes.html` |
| 2 | Florida Transport Services | Florida Transport Services | Transport umbrella; routes visitors to RuMora / Mando / IAM | `florida-transport-services.html` |
| 3 | RuMora Transport | RuMora Transport, LLC (verified name TBD) | Freight & logistics; quote requests | `rumora-transport.html` |
| 4 | Mando Transport | Mando Transport | Rides **to and from doctor's appointments only** | `mando-transport.html` |
| 5 | IAM Transport | IAM Transport | Broader public/community transportation | `iam-transport.html` |
| 6 | Rubio Tax Services | Rubio Tax Services (LLC) | Tax preparation & return support; also serves Notary Public | `rubio-tax.html` (+ `notary-public.html`) |
| 7 | Rubio Credit & Financial | Rubio Credit & Financial Services | Credit rebuilding / financial support | `rubio-credit.html` |
| 8 | Rubio Health & Wellness | Rubio Health & Wellness | Wellness guidance & product categories | `rubio-wellness.html` |

**Does this align with the deployment architecture?** Yes: these are exactly the eight business lines that have their own dedicated pages, contact CTAs, distinct color identity and distinct scope in the hand-off, and each can carry its own knowledge, lead destination and guardrails. One caveat: the hand-off treats them as **pages of one Wix site**, whereas the request describes separate websites — see Decision 1.

### Notary pages — no separate bots
- **Notary Public** → uses **Rubio Tax Services bot (#6)**. The hand-off makes it a child page of Tax, "associated with Rubio Tax Services, LLC", same phone, same audience. A second bot would duplicate knowledge and split leads for no architectural benefit. Add Notary Public facts as knowledge items on bot #6 once the client supplies them (services, commission language, area, hours, pricing, disclaimer). The Notary page simply embeds bot #6's script tag.
- **Notary Signing Agent** → **no separate bot now; route via Rubio International (#1)**. It is associated with a *different* legal entity (Rubio Accounting and Bookkeeping Services, LLC) whose site status the client hasn't confirmed, and it sits under "Notary / Translation" in the site map (not under Tax). Until scope is confirmed, the page should embed bot #1, whose knowledge says "signing-agent inquiries: call 1 (877) 277-6266 (demo number — TBD)". **Trigger for a 9th bot:** the Accounting & Bookkeeping entity gets its own domain, lead destination or materially different knowledge/legal wording.
- Directory-only services (Translation, Document Filing, Human Rights Advocacy, Consultants, US Diplomacy) have no page and no approved copy → routing statements in bot #1 only, no descriptions.

---

## 2. Shared tenant strategy

1. Insert **one** row into `public.users` (required by `bots_user_id_fkey`). `email` is `UNIQUE NOT NULL`; `plan` must be `'starter'` or `'pro'`. Email/plan are TBD (Decision 3).
2. Every Rubio `bots.user_id = {RUBIO_USER_ID}`. Grouping/reporting query: `select … from bots where user_id = '{RUBIO_USER_ID}'` (indexed by `bots_user_id_idx`).
3. **Leave `stripe_subscription_id` / `stripe_customer_id` NULL** on all Rubio bots. Stripe lookups use `.single()`; a shared id would make webhook matching fail silently. Set `plan`, `status`, `usage_limit` manually; bill outside the Stripe webhook path (or one subscription per bot).
4. **Never `DELETE FROM users` for Rubio.** `bots.user_id → users ON DELETE CASCADE` and `leads.bot_id → bots ON DELETE CASCADE` would erase the bots and all their leads.
5. Name bots with a `Rubio | …` internal label in `bots.name` and a `rubio-…` value in `bots.slug` (both informational; unused by code, no unique constraint live).
6. No `organizations` table now. Revisit only if Rubio needs its own login/dashboard.

---

## 3. Data required per bot

Template — copy once per bot. Columns marked **[live]** are consumed by the running API today; **[needs code]** means the value can be stored but nothing reads it until the change listed in Section 7.

| Field | DB column / where stored | Consumed today? | Status |
|---|---|---|---|
| business_name | `bots.business_name` | [live] widget title, prompt, emails | see per-bot table |
| internal label | `bots.name` (`Rubio \| …`) | informational | derived |
| slug | `bots.slug` | informational | derived (`rubio-…`) |
| website/domain | `bots.website` | informational (Stripe success page); not enforced | **TBD** (Decision 1) |
| allowed_domains | `bots.allowed_domains text[]` (new) | **[needs code]** | **TBD** |
| industry | `bots.industry` | [live] prompt | derived from hand-off |
| description (business + hard scope rules) | `bots.description` | [live] prompt "Description:" | draft from hand-off, needs client approval |
| system_prompt (guardrails, tone rules) | `bots.system_prompt` | **[needs code]** — chat route ignores it today | TBD |
| welcome message | `bots.welcome_message` | [live] widget | TBD (client-approved text) |
| tone | `bots.tone` | stored/returned, **not in prompt** | TBD |
| lead qualification questions/flow | `knowledge_items` (type `faq`/`policy`) + prompt rules | [live] via RAG | TBD |
| lead destination email | `bots.notification_email` + `tools.lead_capture.config.notify_email` | [live] | **TBD** |
| escalation contact | `tools.escalate` (`is_enabled`, `config.email`) + `bots.fallback_contact` | [live] | TBD |
| phone | inside `fallback_contact` text, welcome message and knowledge | [live] text only | demo `1 (877) 277-6266` — **not final** |
| email(s) | `notification_email`, knowledge | [live] | **TBD** |
| booking link | `bots.booking_link` (+ `tools.booking`) | [live] | TBD (none provided) |
| language(s) | `bots.market` (`us`/`vn`); UI limited to en/vi | [live] | English; Spanish = Decision 5 |
| theme/widget options | none in schema/widget | **not supported** | optional Phase C (`widget_theme jsonb` + widget change) |
| usage caps | `bots.usage_limit` (default 500) | [live] | set explicitly per bot (TBD) |
| activation | `bots.is_active`, `bots.status` | [live] | create inactive, activate per bot after verification |

### Per-bot facts and constraints (from the hand-off; everything else TBD)

| Bot | Known scope / CTA | Hard guardrails to encode | Client input still missing |
|---|---|---|---|
| 1 Rubio International | Hero "A family of trusted business services." Router to Tax, Credit & Financial, Health & Wellness, Florida Transport Services, Notary Public, Notary Signing Agent, plus directory items. CTA "Call Rubio International". Navy. | Route, don't answer other entities' specifics; don't describe directory-only services beyond "available — call" | final logo, legal entity wording, email, verified address, hours, directory-service descriptions |
| 2 Florida Transport Services | Umbrella for RuMora / Mando / IAM; "service routing guidance". Blue/aqua. | Route to the right company; don't quote rates/areas | logos, service areas, hours, rates, booking/contact flow, insurance/payment, regulatory wording |
| 3 RuMora Transport | Freight & logistics; "Get a quote"; four-step freight process. Dark steel/orange. | No carrier/compliance claims unless approved | verified legal name, territory, capabilities, dispatch hours, quote fields, email |
| 4 Mando Transport | **Transportation to and from doctor's appointments only.** | **Must not** offer errands, shopping, events, tourism or general public transport; no insurance/payment promises | eligibility rules, service area, hours, vehicle/accessibility, payment/insurance, booking process, disclaimers |
| 5 IAM Transport | Broader public/community transportation; contrasts with Mando. Green/aqua. | Errands, general appointments, events, fees, membership, insurance only as **client-approved** content; **never guarantee insurance coverage** | service model (fee-for-service/membership/both), payment/insurance wording, area, hours, vehicles |
| 6 Rubio Tax Services (+ Notary Public) | Tax preparation and return support; "Call for an appointment", "Request a call back". Notary Public associated with Rubio Tax Services, LLC. Green. | No tax advice/outcome/credential claims until approved; notary scope only as approved | credentials/claims, service descriptions, email, address, hours, intake fields, legal disclaimers, notary scope/area/pricing |
| 7 Rubio Credit & Financial | "Rebuild your credit. Reopen your future."; assessment CTA. Violet. | No approved-claims/fee/outcome statements until approved; do not collect SSN/financial account data in chat | approved credit claims, compliance language, partners, fees, email, hours, area |
| 8 Rubio Health & Wellness | Wellness guidance and product categories. Teal. | No medical/health claims; no product/price statements until catalog approved | product catalog, claims/compliance language, ecommerce decision, email, hours, shipping/returns |

Per the hand-off, the **shared phone `1 (877) 277-6266` is a demo number** — use it only in placeholder copy and replace before go-live.

---

## 4. Embed-code pattern

Use the script host that is proven live (`bot-nest.com`), **not** `api.bot-nest.com/widget.js` (404 in production):

```html
<script src="https://bot-nest.com/widget.js"
        data-bot-id="00000000-0000-0000-0000-000000000000"
        data-api-url="https://api.bot-nest.com"></script>
```
- One tag per page, each with that page's bot id (widget falls back to the first `script[data-bot-id]`).
- `data-lang` only recognizes `vi`; omit for English.
- **Wix:** install via Settings → Custom Code (Body – end), scoped to the specific pages; do **not** use an Embed-HTML element (runs in an iframe with a different origin and will fail the domain check). Requires a Wix Premium plan with the domain connected.
- Page → bot mapping: Home hub → 1; Florida Transport → 2; RuMora → 3; Mando → 4; IAM → 5; Tax and Notary Public → 6; Credit → 7; Wellness → 8; Notary Signing Agent → 1.

---

## 5. Domain security plan (summary)

Full rationale in the implementation doc §5–6. Decisions:
- New column `bots.allowed_domains text[] NOT NULL DEFAULT '{}'`; empty = legacy behavior, non-empty = enforced on `config`, `chat`, `lead` before any DB write.
- Match on Origin host (fallback: Referer only when Origin is absent), https-only except explicitly listed `localhost`/`127.0.0.1`. **Matching is exact-host: `example.com` does NOT admit `www.example.com` — list both.** `*.example.com` must be written explicitly; wildcards over `*.vercel.app` / `*.wixsite.com` / `*.com` are rejected. So each Rubio bot's `allowed_domains` should contain both the apex and the `www` host once real domains are known.
- **Implemented on branch `security/rubio-multisite-hardening` (commit `8ce2cc7`) — see [BOTNEST-SECURITY-HARDENING.md](BOTNEST-SECURITY-HARDENING.md). Section 7 below lists the changes as originally planned; the hardening doc is the source of truth for what was actually built (e.g. the admin key env var is `BOTNEST_ADMIN_API_KEY`, and rate limits + `createApp()` refactor were added).**
- Dedicated widget CORS layer (reflect origin on preflight, decide per-bot in handler); everything else keeps global `FRONTEND_ORIGINS`. **Do not add Rubio domains to `FRONTEND_ORIGINS`** — that would open them to all bots.
- Residual risk: non-browser callers can forge Origin → pair with admin-route auth and rate limits (Phase B).
- If all eight bots sit on one Wix host, `allowed_domains` is identical for all eight (protects against other domains only).

---

## 6. SQL / schema changes

### 6.1 Required migration (additive; **not applied**) — `supabase/migrations/20260920000001_bots_allowed_domains.sql`
```sql
alter table public.bots
  add column if not exists allowed_domains text[] not null default '{}'::text[];

comment on column public.bots.allowed_domains is
  'Approved host patterns for the public widget. Empty = unrestricted (legacy). Entries: example.com (also www), www.example.com, *.example.com, localhost.';
```
PG 17 adds a constant-default column as metadata only (no rewrite). Existing rows = `{}` = unchanged behavior. Optional later: an immutable validator function + CHECK constraint on entry format (CHECK cannot contain a subquery).

### 6.2 Rubio seed (TEMPLATE — placeholders in `<>`, **do not run until approved and filled**)
```sql
begin;

insert into public.users (email, plan)
values ('<RUBIO_TENANT_EMAIL_TBD>', '<starter|pro TBD>')
returning id;   -- capture as {RUBIO_USER_ID}

-- one statement per bot; created INACTIVE and unbilled
insert into public.bots
  (user_id, business_name, name, slug, website, industry, description,
   welcome_message, fallback_contact, notification_email, market,
   plan, usage_limit, lead_capture_enabled, is_active, status, allowed_domains)
values
  ('{RUBIO_USER_ID}', '<business_name>', 'Rubio | <label>', 'rubio-<slug>', '<https://domain TBD>',
   '<industry>', '<approved description>', '<approved greeting>', '<fallback contact TBD>',
   '<lead email TBD>', 'us', '<plan TBD>', <cap TBD>, true, false, 'pending', '{<approved domains TBD>}')
returning id, business_name;   -- ids become each page's data-bot-id

-- default tools per bot (mirrors /api/onboard; unique on (bot_id,type))
insert into public.tools (bot_id, type, name, config, is_enabled) values
  ('{BOT_ID}', 'lead_capture', 'Lead Capture', '{"require_email": false, "notify_email": "<TBD>"}', true),
  ('{BOT_ID}', 'booking', 'Appointment Booking', '{"provider":"calendly","url":""}', false),
  ('{BOT_ID}', 'knowledge_search', 'Knowledge Search', '{"similarity_threshold":0.65,"max_results":5}', true),
  ('{BOT_ID}', 'escalate', 'Human Escalation', '{"email":"<TBD>"}', false);

commit;
```
Run through `supabase db query --linked --file <script>` only after review, and create knowledge items through an authenticated admin path (after 7.1 lands) so embeddings are generated.

### 6.3 Not proposed now
`organizations` table; per-bot theme column (`widget_theme jsonb`); revoking `anon`/`authenticated` table grants (hardening backlog).

---

## 7. Code files that would change (none changed yet)

| # | File | Change | Why |
|---|---|---|---|
| 7.1 | `apps/api/src/routes/knowledge.ts`, `onboard.ts`, `createBot.ts` (+ new `apps/api/src/middleware/adminAuth.ts`; mounted in `api/index.ts` and `server.ts`) | Require `x-admin-key` (timing-safe compare against a new `ADMIN_API_KEY` env var on `botnest-api`; same pattern as `routes/audits.ts`). Callers to update: `apps/admin/pages/index.tsx`, `scripts/e2e-test.mjs`, `scripts/check-stripe.mjs`. The public website does **not** call these routes. | Closes unauthenticated knowledge read/poison/delete and bot minting — highest-severity finding |
| 7.2 | new `apps/api/src/lib/originPolicy.ts` | `resolveRequestOrigin(req)`, `normalizeHost`, `hostMatches(host, entry)`, `checkBotOrigin(bot, req)` → allow / legacy / deny | Core domain enforcement |
| 7.3 | `apps/api/src/lib/supabaseClient.ts` | Add `allowed_domains?: string[] \| null` to `BotConfigRow` (and `CreateBotConfigInput`) | Type only; `select('*')` already returns it |
| 7.4 | `apps/api/src/routes/config.ts`, `chat.ts`, `lead.ts` | Call `checkBotOrigin` right after `getBotConfig` and before conversation/lead writes; deny → 403 `domain_not_allowed`. `lead.ts`: load the bot first, reject unknown/inactive bots, stop returning raw DB errors | Server-side enforcement independent of CORS; fixes lead validation gap |
| 7.5 | `apps/api/api/index.ts` (**live entrypoint**) and `apps/api/src/server.ts` | Replace single global `cors()` with: widget CORS layer for `/api/config`, `/api/chat`, `/api/lead`; keep strict `FRONTEND_ORIGINS` CORS for all other routes. Put logic in a shared `middleware/widgetCors.ts` so both files stay in sync | The two entrypoints duplicate app wiring; only `api/index.ts` is deployed |
| 7.6 | `apps/api/src/routes/chat.ts` (`buildDynamicPrompt`) | Append non-empty `bots.system_prompt` as "ADDITIONAL INSTRUCTIONS" | Lets per-bot guardrails (Mando scope etc.) live in the documented column; existing bots have null → unchanged |
| 7.7 | `apps/api/src/routes/onboard.ts` | Embed snippet host → `https://bot-nest.com/widget.js` | `api.bot-nest.com/widget.js` is a 404 in production |
| 7.8 | `apps/api/src/middleware/rateLimiter.ts` (Phase B) | Add per-bot limiter (key `botId`) for chat/lead + tighter lead limiter | Limits spoofed-origin abuse |
| 7.9 | `apps/api/src/tests/` | New `originPolicy.test.ts` (node `--test`, like existing tests) | See Section 9 |
| 7.10 | `.gitignore` | Add `supabase/.temp/` | Link artifacts created by `supabase link` |
| 7.11 (optional, Phase C) | `apps/widget/src/widget.ts`, `config.ts`, rebuild `dist` and copy to `BotNestWebsite/widget.js` | `es` UI strings; `widget_theme` support | Only if Spanish UI / per-brand colors are required; the three `widget.js` copies must stay identical |

---

## 8. Migration / rollout sequence

**Phase 0 — housekeeping (local only)**
1. Add `supabase/.temp/` to `.gitignore`.
2. Recreate the remote-only migration `20260914175618_secure_botnest_public_schema.sql` in `supabase/migrations/` (DDL captured in the audit) so local and remote histories match.
3. Get the client answers for Decisions 1–7 (implementation doc §8).

**Phase 1 — security prerequisites (no Rubio data yet)**
4. Add `ADMIN_API_KEY` to `botnest-api` (Production + Preview; name only here — value generated by you, never pasted in chat).
5. Implement 7.1, 7.2–7.5, 7.6, 7.7, 7.9, 7.10 on a branch.
6. Apply migration 6.1 (additive) to `botnest-prod`. Code tolerates the column being absent (`?? []`), so order is safe either way; apply first.
7. Deploy to a **Vercel Preview** of `botnest-api` (note: Preview env points at the same production Supabase project — test only with a nonexistent id or an inactive test bot).
8. Run Section 9 tests; then promote to production. Confirm the existing five bots and bot-nest.com widget still behave identically (legacy path).

**Phase 2 — pilot (requires your explicit approval)**
9. Insert the Rubio `users` row and **one** pilot bot (recommend #1 Rubio International — pure routing, lowest risk), inactive, with `allowed_domains` = the approved domain(s) (+ exact preview/staging host if needed).
10. Add knowledge items via the authenticated admin route; add tools.
11. Set `is_active=true, status='active'` only after review; install the embed on the staging page via Wix Custom Code; run the browser + curl tests below.

**Phase 3 — remaining seven bots**, one at a time, each: insert inactive → knowledge → tests → activate → embed.

**Phase 4 — go-live hardening:** per-bot rate limits (7.8), replace demo phone, confirm lead emails arrive, watch `v_bot_usage`. Optional Phase C widget work.

Do **not** add Rubio domains to `FRONTEND_ORIGINS`.

---

## 9. Verification / testing sequence

**Unit (`originPolicy.test.ts`)** — legacy (empty list) allows; exact/apex↔www/wildcard/localhost matching; `https://evil.com`, `https://example.com.evil.com`, `https://evilexample.com`, `http://example.com`, `null`, missing Origin (restricted → deny, legacy → allow); uppercase/port/trailing-dot normalization; Referer fallback; wildcard does not match the apex.

**Integration (against Preview, inactive/test bot only)**
1. Legacy bot, no Origin → 200 (unchanged). Legacy bot, `Origin: https://bot-nest.com` → 200 with ACAO. Legacy bot, foreign Origin → blocked (unchanged).
2. Restricted test bot, matching Origin on `config`, `chat`, `lead` → allowed, ACAO present.
3. Restricted bot, foreign Origin / no Origin / `null` → 403 `domain_not_allowed`, **no conversation or lead row written** (verify via read-only counts).
4. Preflight `OPTIONS /api/chat` from an allowed and a foreign origin → 204; foreign real POST → 403.
5. Admin routes without `x-admin-key` → 401; with key → works. Public website flows (`create-checkout-session`, `session/:id/bot`) still work.
6. Inactive Rubio placeholder → `config` 403 `inactive`, `chat` 403.

**Browser (staging Wix page via Custom Code)** — widget loads, greeting shows, chat replies, lead submission arrives at the approved email, Mando bot refuses non-medical rides, IAM bot doesn't promise insurance, wrong-domain embed (a scratch page on another host) fails.

**Regression** — bot-nest.com widget (EN and `/vi`), Stripe checkout success page embed retrieval, existing test bots.

---

## 10. Rollback strategy

| Layer | Action | Data impact |
|---|---|---|
| Code | Vercel **Instant Rollback** of `botnest-api` to the previous deployment (or revert the branch) | None; the extra column is inert |
| Schema | Leave `allowed_domains` in place (harmless). If it must go: `alter table public.bots drop column allowed_domains;` — only after code no longer references it | Loses only Rubio domain lists |
| Individual bot | `update bots set is_active=false, status='suspended' where id='{BOT_ID}'` → `config` and `chat` immediately return 403 `inactive`. Remove the Wix Custom Code tag | None |
| Bad pilot data (bot has **zero leads**) | Delete by explicit ids in this order: `knowledge_items` and `tools` and `conversations`/`messages` where `bot_id` = id (no FKs to `bots`), then the `bots` row | Only that bot |
| Bot with leads | **Do not delete** — deactivate. `delete from bots` cascades to `leads` | — |
| Rubio tenant | **Never `DELETE FROM users`** (cascades to bots and leads) | — |
| Safety net | Before Phase 2, export the affected rows (Rubio `users`/`bots`/`tools`/`knowledge_items`) with read-only `db query -o json` to a local backup; take a Supabase dashboard backup point if the plan allows | — |

---

## 11. Open decisions (need your input)

1. One Wix domain with pages vs. separate domains per business → `website` / `allowed_domains` values.
2. Production phone numbers (current shared number is a demo number).
3. Rubio `users` row email and plan.
4. Lead-destination email per bot; escalation contacts.
5. Spanish support (widget UI is en/vi only; the bot itself replies in the visitor's language).
6. Client-approved guardrail wording per business (tax/credit/wellness/transport).
7. ~~Approve code changes 7.1–7.7~~ — implemented, merged to `main`, pushed, and **live in Production** (see [BOTNEST-SECURITY-HARDENING.md](BOTNEST-SECURITY-HARDENING.md) update 2026-09-25). Two more additive migrations (widget theme, "Powered by BotNest") are written but not yet applied — see that doc's §16–18.

---

## 12. Exact draft rows — prepared 2026-09-25, **NOT executed**

Source of truth for content: the Rubio website project's own `RUBIO-BOT-CONFIGS.md` (business names, descriptions, `system_prompt` text, welcome messages, qualification fields, and — new as of 2026-09-25 — `widget_theme` and branding values, all reproduced there in full; not duplicated here to avoid two copies drifting apart).

### Rubio `users` row — BLOCKED, do not create

| Column | Value | Why |
|---|---|---|
| `id` | left to `gen_random_uuid()` default | no reason to pre-mint one |
| `email` | **UNKNOWN — blocks this row** | `NOT NULL UNIQUE` on `users.email`; no real Rubio-controlled email address has been provided, and none has been invented in its place |
| `plan` | TBD (`'starter'` or `'pro'` — the only two values the `CHECK` constraint allows) | cosmetic only; nothing in the codebase reads `users.plan` today |
| `created_at` | default `now()` | — |

**Per this task's own stop rule: a real email is mandatory and still unknown, so the `users` row — and therefore all 8 bot rows, which depend on it via `bots.user_id` — is not created. Nothing below this point was run.**

### The 8 bot rows (template — for review only, blocked by the above)

Every row below would additionally carry `usage_limit` (suggest `500`, matching every other non-Covenant bot), `lead_capture_enabled = true`, `is_active = false`, `status = 'pending'` (create inactive, activate after review — per §8 of this document), `notification_email = null` (per your instruction: use no destination rather than substitute your own email; a null destination safely falls back to BotNest's own controlled fallback address, never a personal inbox), and no `stripe_*` fields.

| Site key | `business_name` | `industry` | `market` | `widget_theme` | `show_powered_by` | `allowed_domains` (local test only — see §7 below) |
|---|---|---|---|---|---|---|
| `rubio` | Rubio International Enterprizes | Multi-business holding / parent organization | `us` | `{"primary":"#0b1f3b","accent":"#0071e3","background":"#ffffff","text":"#172233"}` | `true` | `{localhost,127.0.0.1}` |
| `floridaTransport` | Florida Transport Services | Transportation umbrella | `us` | `{"primary":"#0a1d2e","accent":"#1d7fe8","background":"#ffffff","text":"#18252d"}` | `true` | `{localhost,127.0.0.1}` |
| `rumora` | RuMora Transport | Freight & logistics transportation | `us` | `{"primary":"#1c2836","accent":"#cc5500","background":"#ffffff","text":"#141b22"}` | `true` | `{localhost,127.0.0.1}` |
| `mando` | Mando Transport | Non-emergency medical transportation | `us` | `{"primary":"#0d2237","accent":"#2563eb","background":"#ffffff","text":"#16313b"}` | `true` | `{localhost,127.0.0.1}` |
| `iam` | IAM Transport | Public / community transportation | `us` | `{"primary":"#102a3a","accent":"#1a9a76","background":"#ffffff","text":"#17323d"}` | `true` | `{localhost,127.0.0.1}` |
| `tax` | Rubio Tax Services | Tax preparation (+ notary public) | `us` | `{"primary":"#0d3b2e","accent":"#16a877","background":"#ffffff","text":"#16241f"}` | `true` | `{localhost,127.0.0.1}` |
| `credit` | Rubio Credit & Financial | Credit repair / financial services | `us` | `{"primary":"#1a1740","accent":"#6a4cff","background":"#ffffff","text":"#1b1836"}` | `true` | `{localhost,127.0.0.1}` |
| `wellness` | Rubio Health & Wellness | Health & wellness products/guidance | `us` | `{"primary":"#0f3f3a","accent":"#16a085","background":"#ffffff","text":"#1c332e"}` | `true` | `{localhost,127.0.0.1}` |

`description`, `system_prompt`, and `welcome_message` per bot: use the exact drafts in the Rubio project's `RUBIO-BOT-CONFIGS.md` (sections 1–8) verbatim — they are long enough that reproducing them a second time here risks the two copies silently diverging after a future edit.

`allowed_domains` shown above is the **local-testing-only** value (`localhost`, `127.0.0.1`) — see Section 7 (domain security) of this document and the Rubio project's `RUBIO-LOCAL-BOT-TESTING.md`. It must be replaced with the real production host(s) once known, and the local-only entries removed at that time.

### What actually happens once the email is provided

1. Insert the `users` row with the real email and confirmed plan; capture the returned `id`.
2. Insert the 8 `bots` rows above (via `INSERT ... RETURNING id`, capturing each `id`).
3. Insert the matching `tools` rows per bot (mirrors `/api/onboard`'s defaults — lead_capture on, knowledge_search on, booking off until a real `booking_link` exists, escalate off until an escalation email is confirmed).
4. Paste each returned bot `id` into the Rubio website project's `assets/js/botnest-sites.js`.
5. Only then proceed to local testing (`RUBIO-LOCAL-BOT-TESTING.md`), then production cutover.
