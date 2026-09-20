# BotNest Security Hardening — Rubio Multi-Site Prerequisites

Branch: `security/rubio-multisite-hardening` — commit `8ce2cc7` (local only, **not pushed, not merged**).
Date: 2026-09-20.
Status: **Code complete and tested. NOT deployed to Production. Migration NOT applied. No Rubio users/bots created.**
Verified on a non-production Vercel Preview deployment (`botnest-bd89fxeu3-bot-nest.vercel.app`).

Related: [RUBIO-BOTNEST-IMPLEMENTATION.md](RUBIO-BOTNEST-IMPLEMENTATION.md) (audit + Rubio architecture), [RUBIO-BOT-CREATION-PLAN.md](RUBIO-BOT-CREATION-PLAN.md) (bot inventory and rollout).

---

## 1. Vulnerabilities found

| # | Severity | Finding (on `main`) |
|---|---|---|
| V1 | **High** | `/api/knowledge*` (list, create, bulk, delete, search), `/api/onboard`, `/api/createBot`, `/api/create-bot` had **no authentication**. Anyone with a public bot UUID could read, poison or delete a bot's knowledge base; anyone could mint active bots and trigger setup emails. |
| V2 | **High** | `POST /api/create-checkout-session` accepted an arbitrary `botId`. The Stripe webhook then **activated that bot and overwrote its Stripe subscription/customer ids** on payment, and a later cancel would deactivate it — a way for a third party to take another customer's bot offline. |
| V3 | **High** | No binding between a bot and the domains allowed to run it. The only control was a single global `FRONTEND_ORIGINS` list (production: `https://bot-nest.com` only), which both blocks every legitimate customer site and, once extended, would let each listed site use every bot. |
| V4 | Medium | `POST /api/lead` did not check the bot existed/was active before writing, returned raw database error text, had no field limits, and fired notification e-mail per request (spam amplification). |
| V5 | Medium | Rate limiting was per-IP only (60/min general, 30/min chat). Nothing per-bot, nothing specific to leads or admin routes. |
| V6 | Medium | `/api/chat` forwarded unbounded client-supplied history and message text to OpenAI (cost abuse), and put visitor-supplied `context.industry` verbatim into the system prompt. |
| V7 | Low | `bots.system_prompt` existed but the chat route never used it, so per-bot guardrails could not be configured. |
| V8 | Low | `/api/onboard` generated an embed snippet pointing at `https://api.bot-nest.com/widget.js`, which returns 404 in production. |
| V9 | Low | The Vercel entrypoint returned `String(err)` from failed initialization to the client. |
| V10 | Low | `routes/audits.ts` (currently unmounted) compared its admin key with `!==` and accepted it in the query string. |

Not fixed here (see Section 11): broad `anon`/`authenticated` table grants (inert under RLS), full bot rows logged on every request, non-browser Origin spoofing, fire-and-forget e-mail on serverless.

## 2. Fixes implemented

| Area | Change | Files |
|---|---|---|
| Admin auth | `BOTNEST_ADMIN_API_KEY` guard on management routes | `middleware/adminAuth.ts`, `app.ts` |
| Checkout hijack | `botId` in checkout requires the admin key | `routes/createCheckoutSession.ts` |
| Domain lock | `bots.allowed_domains` + one reusable validator + per-bot enforcement | `lib/originPolicy.ts`, `routes/{config,chat,lead}.ts`, migration |
| CORS | Widget-specific CORS layer; global list untouched for other routes | `middleware/widgetCors.ts` |
| Rate limits | Per-IP, per-bot, lead, admin, failed-auth limiters | `middleware/rateLimiter.ts` |
| Input caps | message / history / session / lead field limits | `routes/chat.ts`, `routes/lead.ts` |
| system_prompt | Appended to the model's system message | `routes/chat.ts` |
| Embed URL | Corrected snippet; legacy URL redirects | `routes/onboard.ts`, `api/index.ts` |
| Structure | One `createApp()` shared by the Vercel entrypoint and `server.ts` (previously two divergent copies) | `app.ts`, `api/index.ts`, `server.ts` |
| Hygiene | `supabase/.temp/` gitignored; init error no longer leaks detail; `audits.ts` uses constant-time compare | `.gitignore`, `api/index.ts`, `routes/audits.ts` |

## 3. Route protection model

| Class | Routes | Protection |
|---|---|---|
| **Public widget** | `GET /api/config/:botId`, `POST /api/chat`, `POST /api/lead` | No admin key. Per-bot domain policy, widget CORS, rate limits, input caps |
| **Public by design** | `GET /api/health`, `GET /api/session/:id/bot`, `POST /api/create-checkout-session` (**without** `botId`), `POST /api/stripe-webhook` | Global CORS + general rate limit; webhook verifies Stripe signature |
| **Admin / management** | `/api/knowledge` (`GET`, `POST`, `DELETE`, `/bulk`, `/search`), `/api/onboard`, `/api/createBot`, `/api/create-bot`, and `POST /api/create-checkout-session` **with** `botId` | `x-admin-key` (or `Authorization: Bearer`) = `BOTNEST_ADMIN_API_KEY`; 60 req/min/IP; 10 failed attempts/15 min/IP lockout |
| Unmounted | `routes/audits.ts` (audit engine moved to `reputation-app`) | Not reachable; compare hardened in case it is re-mounted |

Audit of other mutating routes: the only routes that create, modify or delete bots/knowledge/config are the ones above plus the Stripe webhook (which acts on signed Stripe events; its indirect abuse path, V2, is closed). `capture_lead` (LLM tool) writes leads but only inside an already origin-checked `/api/chat` request. Admin middleware is mounted at path level (`app.use([...paths], ..., requireAdminKey)`), so a route added later under those prefixes is protected automatically; path matching is case-insensitive like Express routing (tested with `/api/createbot`).

Admin auth details: the header value is compared with `crypto.timingSafeEqual` over SHA-256 digests (equal length, constant time); **fail-closed** — if the env var is unset or shorter than 32 characters every management request gets `503 admin_api_not_configured` (never open); missing/wrong key gets `401`; keys in the query string are **not** accepted; the key and attempted keys are never logged (tested by capturing all console output). The key is server-side only — do not put it in browser code (`apps/admin`'s legacy page runs in the browser and can no longer call these routes; see limitations).

## 4. Domain validation behavior

`bots.allowed_domains text[] NOT NULL DEFAULT '{}'`.

| `allowed_domains` | Request | Result |
|---|---|---|
| `{}` (all existing bots) | any | **Legacy behavior, unchanged:** no Origin -> allowed; Origin present -> allowed only if in `FRONTEND_ORIGINS` (or that list is empty); Referer ignored. Foreign origin -> now a clean `403` (was a `500`). |
| non-empty | Origin host matches an entry, https (or explicit loopback) | Allowed; `Access-Control-Allow-Origin` echoes the origin |
| non-empty | Origin present but no match / `Origin: null` / malformed / `http` on a non-loopback host | `403 {"error":"domain_not_allowed"}`, no CORS headers |
| non-empty | **No Origin** and valid Referer host matches | Allowed (Referer is a fallback only when Origin is absent) |
| non-empty | No Origin and no/invalid/foreign Referer | `403` |
| unknown bot id | any | Legacy rule (demo behavior preserved) |

Rules:
- Enforcement happens in the route handler **before** any conversation, message, lead, usage or OpenAI activity for that request (tested: denied requests produce zero writes and zero OpenAI calls).
- A non-empty list of only invalid entries **fails closed** (never degrades to legacy).
- Denied restricted-bot responses do not reveal whether the bot is inactive.

Normalization (`lib/originPolicy.ts`): trim and lowercase; strip protocol, path, query, fragment, port, trailing dot; IDNs punycoded by the URL parser; IPv6 literals unsupported. Entries are **exact host matches**:

| Entry written | Stored/matched as | Admits |
|---|---|---|
| `https://Example.com/x?y=1#z` | `example.com` | `example.com` only |
| `www.example.com` | `www.example.com` | that host only (apex not implied, and vice-versa) |
| `localhost`, `http://localhost:3000` | `localhost` | any port, http or https |
| `127.0.0.1` | `127.0.0.1` | any port, http or https |
| `preview-domain.vercel.app` | same | that exact host |
| `*.example.com` | `*.example.com` | any subdomain at any depth, **not** the apex; only when written explicitly |
| `*.com`, `*.co.uk`, `*.vercel.app`, `*.wixsite.com`, `*.127.0.0.1` | rejected | — (would authorize whole platforms/TLDs) |

Loopback is the only host that may use `http`. `/api/onboard` accepts an optional `allowedDomains` array, normalizes it, and rejects the request (400) if any entry is invalid rather than silently dropping it.

**What this is and is not:** browsers set `Origin`/`Referer` and page scripts cannot forge them, so this stops **other websites** from embedding a restricted bot in a browser. It is **not authentication**: curl, scripts and servers can send any `Origin`/`Referer`. It must be combined with the rate limits, the per-bot `usage_limit`, and the platform-level controls in Section 13.

## 5. CORS model

- **Widget routes** (`/api/config`, `/api/chat`, `/api/lead`) bypass the global list. `OPTIONS` preflight cannot know the bot (the id is in the body), so it returns `204` reflecting the caller's origin (`Allow-Methods: GET, POST, OPTIONS`, `Allow-Headers: Content-Type`, `Max-Age: 600`, `Vary: Origin`) and touches nothing. The **real** request is decided per bot in the handler, which sets `Access-Control-Allow-Origin` only on allowed requests. A denied request gets a `403` with no CORS headers, so a foreign page can neither read it nor tell why. Rate-limit `429` responses reflect the origin so the widget sees a normal error instead of a network failure (they contain no bot data).
- **All other routes** keep the original strict `FRONTEND_ORIGINS` behavior (blocked origins still get an error with no CORS headers; verified live on Preview).
- `bot-nest.com` (`FRONTEND_ORIGINS=https://bot-nest.com`) is unaffected: legacy bots still work from it (verified live against BotNest's own bot).
- **Rubio domains never go in `FRONTEND_ORIGINS`.** They go in each bot's `allowed_domains`.

## 6. Rate limiting

Implementation: `express-rate-limit` (already a dependency), keyed with `ipKeyGenerator` (IPv6-safe), created per app by `createRateLimiters()`. No new infrastructure.

| Scope | Limit | Key |
|---|---|---|
| All `/api` (includes `config`) | 60/min | IP (unchanged; there is no separate config limiter because this already caps config lookups) |
| `/api/chat` | 30/min (unchanged) | IP |
| `/api/chat` | 200/hour | IP |
| `/api/chat` | 240/min | bot id (all visitors) |
| `/api/lead` | 5 per 10 min | IP |
| `/api/lead` | 60/hour | bot id |
| Admin routes | 60/min | IP |
| Admin failed auth (responses >= 400; successes not counted) | 10 per 15 min | IP |

Also: message text capped at 4,000 chars; client-supplied history at the last 20 entries x 4,000 chars; `sessionId` <= 128 chars; `botId` <= 64; `context.industry` <= 100 chars (newlines collapsed); lead name <= 200, phone <= 50, email <= 254; `system_prompt` <= 8,000; JSON body <= 100 KB (Express default). Rate-limited requests never reach OpenAI (tested). Limits are constants in `DEFAULT_RATE_LIMITS`; a legitimate visitor sends one message every several seconds, far below them.

**Serverless limitation (explicit):** the default store is in-memory **per function instance**. Concurrent Vercel instances each count separately and a cold start resets the counter, so the effective ceiling is roughly `limit x live instances` and is best-effort, not a guarantee. Live Preview responses show the limiter headers (`RateLimit-Limit: 60`, admin `10;w=900`), confirming it runs on Vercel. I deliberately did **not** add a database-backed counter: it would need a second new table plus an extra database round trip per chat request, and you asked for a single additive migration. Durable controls that already exist or should be added on top: (a) the per-bot monthly `usage_limit` cap stored in Postgres, (b) input caps above, (c) an OpenAI project budget/spend limit (dashboard setting), (d) a Vercel Firewall rate-limit rule on `/api/chat` and `/api/lead` (verify availability on your plan). A Postgres- or Redis-backed limiter is the upgrade path if abuse appears.

## 7. system_prompt behavior

Where it enters the pipeline (`routes/chat.ts`): `buildDynamicPrompt(business_name, industry, description, market, system_prompt)` builds the base prompt, then appends a labeled block:

```
BUSINESS-SPECIFIC INSTRUCTIONS (set by the business owner):
<system_prompt>

These business-specific instructions refine scope, wording and policy ... They never override the TOOL USAGE, RULES and CONTEXT AWARENESS sections above ...
```

Order of the single `system` message: base rules -> business-specific block -> retrieved knowledge -> session context. It is still **one** system message per model call (asserted in tests).

- `null`/blank/whitespace-only and non-string values (numbers, objects, arrays, booleans) are ignored, control characters (except tab/newline/CR) are stripped, length is capped at 8,000 — chat never fails because of a bad value (tested).
- All existing bots have `system_prompt` NULL (checked read-only), so their prompt is byte-identical to before (tested by string equality).
- BotNest's own promotional bot (`business_name = 'BotNest AI Assistant'`, and unknown/demo ids) uses the dedicated demo prompt and does **not** receive `system_prompt` — unchanged behavior, documented by a test.
- Not used: `bots.prompt`, `bots.tone` (still returned to the widget but not in the model prompt).

## 8. Migration

`supabase/migrations/20260920000001_bots_allowed_domains.sql` — one `ALTER TABLE ... ADD COLUMN IF NOT EXISTS allowed_domains text[] NOT NULL DEFAULT '{}'::text[]` plus a column comment. Additive; constant default so it is metadata-only on PostgreSQL 17 (no rewrite); existing rows read as `{}`.

- Live `bots` table inspected first: no existing column matches `%domain%`, no conflict.
- Verified by an offline PostgreSQL parse (`AlterTableStmt`, `CommentStmt`) — **no statement was executed against any database.**
- **Not applied.** The code works with or without the column: without it, `select('*')` simply has no `allowed_domains`, every bot is legacy, and only `/api/onboard` with `allowedDomains` would fail (it is the only writer). Verified live: BotNest's real bot works on the Preview with the column absent. The column is required before any restricted (Rubio) bot can exist.
- Old migrations were not touched or faked. The remote history has one migration (`20260914175618`) that is absent locally; do **not** run `supabase db push` (local `001`-`011` files are un-versioned and would be re-run) — see Section 13 for the apply procedure.

## 9. Environment variables (names only)

| Name | Where | Purpose |
|---|---|---|
| `BOTNEST_ADMIN_API_KEY` | `botnest-api` Production + Preview | **New, required** for management routes; >= 32 chars; server-side only |
| `FRONTEND_ORIGINS` | existing (`https://bot-nest.com`) | Unchanged; legacy bots + non-widget routes. Do not add Rubio domains |
| `WIDGET_JS_URL` | optional | Overrides the widget script URL (default `https://bot-nest.com/widget.js`) used by generated snippets, e-mails and the `/widget.js` redirect |
| `BOTNEST_DISABLE_DEMO_CHAT` | optional, `true` to enable | Stops serving the free demo chatbot to unknown bot ids (`404`); off by default to preserve behavior |
| `API_PUBLIC_URL` | existing | Unchanged (used as `data-api-url`) |

No rate-limit service credentials are needed. **Status of `BOTNEST_ADMIN_API_KEY` in Vercel: needs your action (Section 13, step 1).**

## 10. Testing performed

`npm test` in `apps/api`: **119 tests, 119 pass** (19 pre-existing + 100 new). The route tests run the **real `createApp()`** middleware/router stack against an in-memory fake Supabase/OpenAI (global `fetch` is replaced before any client is created; unrecognised calls are recorded and asserted empty), so **no test touched the real database, OpenAI or the network.**

| Your case | Where | Result |
|---|---|---|
| A. legacy bot `{}` | `widgetRoutes` + `originPolicy` | config/chat/lead work with no admin key; bot-nest.com origin gets CORS; foreign origin still blocked; unknown bots keep demo behavior |
| B. restricted, permitted domain | `widgetRoutes` | config/chat/lead succeed, ACAO echoed, `www` works only because listed, session-bound chat works |
| C. restricted, forbidden domain | `widgetRoutes` | 403, no CORS headers, **zero** DB writes and OpenAI calls; lookalikes/subdomains/`http` rejected; inactive state not revealed |
| D. no Origin/Referer | `widgetRoutes` + unit | 403 on all three; `Origin: null` rejected even with allowed Referer; allowed Referer accepted only when Origin absent; foreign Referer rejected |
| E. chat rate limit | `widgetRoutes` | 3 OK then 429; 4th never reaches OpenAI; other IP unaffected; per-hour and per-bot limits; 429 carries readable CORS |
| F. lead rate limit | `widgetRoutes` | per-IP and per-bot; leads not written once limited |
| G. admin, no key | `adminRoutes` | 401 on all 9 route variants (incl. case variant, query-string key, empty header); nothing written |
| H. admin, wrong key | `adminRoutes` | 401 incl. near-miss keys and wrong Bearer |
| I. admin, correct key | `adminRoutes` | reaches every handler; Bearer works; **fail-closed 503** with no/short server key; key never appears in logs |
| J. system_prompt | `widgetRoutes` | reaches the single system message after core rules; legacy prompt byte-identical; malformed values safe; cap/strip; BotNest own bot unchanged |
| K. embed snippet | `adminRoutes` + `entrypoint` | contains `https://bot-nest.com/widget.js`, never `api.bot-nest.com/widget.js`; `/widget.js` on the entrypoint 302s to it |

Additional: failed-auth lockout (and successes not counted); overall admin rate; checkout-with-`botId` needs the key while the public flow does not; onboarding domain normalization/validation; input caps; preflight and global-CORS separation; log hygiene. **Mutation check:** disabling the chat origin gate made 7 tests fail; restored. **Type check:** `tsc --noEmit` error list is identical to the pre-change baseline (35 pre-existing lines in files such as `knowledgeSearch.ts`/`memory.ts`; zero new). The test script now uses `ts-node/register/transpile-only` because those pre-existing type errors would otherwise abort any test that imports the app.

**Live Preview (non-production; same production database, no writes):** `/api/health` 200; `/widget.js` 302 to `https://bot-nest.com/widget.js`; admin route 503 (Preview has no key — fail-closed confirmed); BotNest's real bot config with `Origin: https://bot-nest.com` -> 200 + ACAO; same with `https://evil.example` -> 403, no ACAO; `POST /api/chat` for the real bot from a foreign origin -> 403 before any processing; widget preflight -> 204 with reflected origin; lead for an unknown bot -> 404; non-widget route from a foreign origin -> still blocked.

**Not tested** (no safe way yet): a live restricted bot (column not applied, no Rubio/test bot created), a live chat completion on Preview (would spend OpenAI tokens), a live rate-limit flood, a Wix/browser end-to-end run, the migration itself.

## 11. Known limitations

1. Origin/Referer are spoofable by non-browser clients (Section 4).
2. Rate limits are best-effort per instance on serverless (Section 6).
3. Unknown bot ids still get the free demo chat (cost exposure, mitigated by IP limits) unless `BOTNEST_DISABLE_DEMO_CHAT=true`.
4. If all Rubio bots live on **one** Wix host, `allowed_domains` is identical for all and cannot stop page A using bot B (Origin has no path).
5. Wix "Embed HTML" iframes have a different origin and will (correctly) be denied; use Wix Settings > Custom Code. Wix editor/preview origins are untested — add exact hosts if needed.
6. Wildcard validation is heuristic (no public-suffix list).
7. Legacy bots (`{}`) remain limited to `FRONTEND_ORIGINS`, i.e. only `bot-nest.com` in browsers — as today. Any external customer bot needs a non-empty `allowed_domains`.
8. `getBotConfig` still logs the full bot row (incl. notification e-mail, Stripe ids) on every request — recommend removing.
9. `anon`/`authenticated` roles still hold ALL table grants (RLS makes them inert) — recommend revoking.
10. Lead-notification e-mail is fire-and-forget after the response; on serverless it may be dropped (pre-existing). `usage_count` is a non-atomic read-modify-write (pre-existing).
11. `apps/admin/pages/index.tsx` (browser page pointing at an old Railway URL, unauthenticated) can no longer create bots; untracked local scripts `scripts/e2e-test.mjs`, `scripts/check-stripe.mjs` call protected routes and need `x-admin-key`. The admin key must never be embedded in browser code.
12. One shared admin key (no per-user audit trail); 10 failed attempts lock that IP for 15 minutes (even with the right key).
13. The widget's built-in fallback API URL is still the old Railway host (only used when `data-api-url` is missing; all real snippets include it). Widget files were not modified.
14. Preview deployments share the production database and this project's Preview environment has no admin key yet.

## 12. Rollback

| What | How | Data impact |
|---|---|---|
| Code | Vercel **Instant Rollback** to the previous production deployment, or `git revert 8ce2cc7` and redeploy | None |
| Migration | Leave the column (inert). If it must go, after code rollback: `alter table public.bots drop column if exists allowed_domains;` | Loses only domain lists (none exist yet) |
| Admin key | Remove `BOTNEST_ADMIN_API_KEY`; old code ignores it. New code without it keeps management routes closed (503) by design | None |
| A limiter is too tight | Raise the constant in `DEFAULT_RATE_LIMITS` and redeploy | None |
| Preview deployment | `vercel remove botnest-bd89fxeu3-bot-nest.vercel.app --scope bot-nest` | None |
| Deployment-protection bypass token | Revoke in Vercel > `botnest-api` > Settings > Deployment Protection > Protection Bypass for Automation | None |

## 13. Manual steps required before deploying

**Side effects of this session you should know about**
- A Preview deployment exists (`botnest-bd89fxeu3-bot-nest.vercel.app`, `target: null`, not production).
- `vercel curl` auto-created a **Deployment Protection bypass token** on `botnest-api`.
- `BOTNEST_ADMIN_API_KEY` exists in **Production only**, stored as a write-only Secret whose value **nobody knows** (this CLI version defaults to Secret and I did not keep a copy). My attempt to replace it with a readable value was blocked by the permission classifier, so I stopped. It is harmless until the new code deploys, but the new code would then reject every admin call. Replace it as below.
- Git on this PC needed per-command workarounds (`safe.directory`, and `core.fsync=none` because `D:` is a USB SSD that returns intermittent fsync errors). No global git config was changed.

**Steps (in order)**
1. **Set the admin key** (you run this; the value stays on your machine):
   ```powershell
   cd D:\BotNest\BotNestFrontEnd\apps\api
   $b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
   $key = [Convert]::ToBase64String($b).Replace('+','-').Replace('/','_').TrimEnd('=')
   vercel env rm BOTNEST_ADMIN_API_KEY production --yes --scope bot-nest
   $key | vercel env add BOTNEST_ADMIN_API_KEY production --type config --scope bot-nest
   $key | vercel env add BOTNEST_ADMIN_API_KEY preview    --type config --scope bot-nest
   ```
   `--type config` matches the project's other variables and keeps it readable via `vercel env pull`; drop it (default Secret) if you prefer to keep the key only in a password manager.
2. Review the branch (`git log`, `git diff main...security/rubio-multisite-hardening`). If you push, note Vercel's Git integration may build a Preview from the push.
3. **Apply the migration** (required before creating any restricted bot; optional before deploying the code): run the file with `npx supabase@latest db query --linked --file supabase/migrations/20260920000001_bots_allowed_domains.sql`, confirm the column exists, and record it in migration history (`supabase migration repair --status applied 20260920000001`, which may need the database password). Do not use `db push`.
4. Deploy to Production (merge to `main`, or `vercel deploy --prod` from `apps/api`) only after steps 1-3, then re-run the Preview checks against production: `/api/health`, `/widget.js` redirect, admin route 401 without key / 200 with key, real-bot config from `https://bot-nest.com` (200) and a foreign origin (403), and one manual chat on bot-nest.com (EN and `/vi`).
5. Give `x-admin-key` to anything that calls management routes (your local scripts, any future admin tooling).
6. Platform layers: set an OpenAI project spend limit; add a Vercel Firewall rate-limit rule for `/api/chat` and `/api/lead` (check plan availability).
7. Optional hardening backlog: remove the full-row `console.log` in `getBotConfig`; revoke `anon`/`authenticated` grants; set `BOTNEST_DISABLE_DEMO_CHAT=true` if the demo bot is not needed for unknown ids; revoke the bypass token and delete the Preview deployment when finished.
8. Only then proceed with the Rubio steps (Rubio `users` row, inactive bots, `allowed_domains` with both apex and `www` hosts, pilot bot).
