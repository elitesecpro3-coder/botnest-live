# Warmly Integration — Status, Research, and Open Decisions

Scope of this document: the Warmly visitor-tracking snippet on the public BotNest marketing site (`BotNestWebsite/`) only. It does not cover, and no code in this pass touches, the separate BotNest Lead Engine repository, Apify, OpenRouter, CRM sync, or outbound automation.

## 1. Current state (as of this pass)

- **Install**: every public page's `<head>` loads the exact Warmly snippet (`clientId=6ba3d657a2023a23292fb24cf4adf6cd`, unmodified) via a small inline production-only gate — see `index.html`'s `<head>` for the pattern. It only injects the real `<script src="https://opps-widget.getwarmly.com/warmly.js?...">` tag when `window.location.hostname` is `bot-nest.com` or `www.bot-nest.com`. Everywhere else (localhost, automated tests, Vercel preview/deployment URLs) it does nothing — no request, no credit usage.
- **Privacy policy**: `privacy-policy/index.html` and `vi/privacy-policy/index.html` each have a new "Website Analytics & Visitor Intelligence" section disclosing the use of Warmly, the data categories involved, the purpose, and a link to Warmly's own privacy policy and opt-out form.
- **No consent gate (cookie banner / CMP) has been added.** See section 3 below — this is a decision for you, not something implemented in this pass.
- **No other analytics scripts exist on this site.** `script.js` has one dead, never-executing reference to `window.gtag(...)` guarded by `typeof window.gtag === 'function'` — Google Analytics/gtag.js was never actually loaded anywhere, so this line does nothing today. Left as-is (out of scope; not a tracking mechanism).

## 2. Privacy policy changes

New section added to both language versions, positioned between "How We Use This Information" and "Data Sales" (preserving the existing section order and markup style — `<section class="legal-section"><h2>...</h2><p>...</p><ul>...</ul></section>`):

- Names the categories of data a visitor-intelligence tool can collect (IP address, pages/UTM, user-agent, session/interaction data, time on page, company/professional-profile association).
- States the purpose in plain language (analytics, business-interest understanding, site improvement, lead attribution, sales/marketing follow-up "where permitted by law").
- Links to Warmly's own privacy policy (`https://www.warmly.ai/p/privacy-policy`) and opt-out form (`https://warmly.ai/p/do-not-sell-share-my-data`) — both confirmed live before linking.
- Deliberately does **not** claim "fully GDPR compliant" or "we never collect personal information" anywhere.

## 3. Consent / cookie behavior — decision needed before any gating is implemented

**What Warmly's own documentation actually says** (help.warmly.ai, fetched directly — not inferred):

- Warmly's script collects IP address, user-agent, URLs/UTM, session cookie/status, form fills, chat messages, time on page, and widget interactions.
- It sets a first-party-style cookie to re-identify the same visitor on return visits.
- Per Warmly's own Compliance & Privacy article, two architectural options exist, in their words: *"place both the JavaScript and cookie behind a cookie banner, or place just the cookie behind the cookie banner while allowing the JavaScript to fire."* **No script attribute, function call, or dashboard toggle is documented for the second option** — it's described as something the customer's own webmaster builds, not a Warmly-provided switch. I could not find one anywhere in their docs.
- Per Warmly's own Privacy FAQ: Warmly states it does **not** match individual-level contacts inside the EU — only company-level — and that individual resolution is **US-traffic-only**. This is a material, documented mitigation that already exists regardless of anything BotNest does.
- A documented (but explicitly customer-supplied, not first-class) "Advanced Script Options" example shows wrapping the script tag in a `fetch()` call to a third-party IP-geolocation service (ipapi.co) and skipping the script for a `blockedCountries` list. This adds an extra third-party network call and external dependency for every visitor, and Warmly does not present it as an officially maintained feature.
- No documented integration with a consent management platform (OneTrust, Cookiebot, Google Consent Mode) was found for Warmly specifically.

**The three options you asked about, evaluated against what's actually documented:**

| Option | What it would mean technically | Feasibility found in docs | Trade-off |
|---|---|---|---|
| **A. Full gate** (script only loads after consent) | Reuse the same hostname-gate pattern already shipped, add a consent-check condition before injecting the tag (e.g. a small first-party banner writing `localStorage`) | Fully supported — this is exactly the pattern Warmly's own geo-blocking example uses | Cleanest, lowest legal risk, but zero visibility into any visitor who hasn't consented, including the US B2B accounts you most want signal on |
| **B. JS/company-ID allowed, person-cookie deferred** | Let the script run immediately (company identification), suppress/delay only the person-identifying cookie until consent | No documented mechanism exists for this. Warmly describes it as conceptually possible but gives no API, flag, or configuration to actually do it from the website side | Would need to ask Warmly support directly whether such a mode exists before building anything — building it blind risks silently not working (the cookie may still get set) while giving you false confidence |
| **C. Geographic gating** | Wrap the script in an IP-geolocation check and skip EU/UK/other regulated visitors | Documented only as a customer-supplied example, not a maintained Warmly feature; adds a third-party geolocation dependency and network round-trip to every page view | Only meaningfully reduces risk Warmly hasn't already reduced itself (see EU/US point above) — the marginal benefit is small since Warmly already restricts person-level EU matching |

**My recommendation:** given that (1) Warmly already restricts individual-level identification to US traffic and never matches EU individuals, (2) BotNest's own content and pricing are US-market-only with no stated EU customer base, (3) Option B has no documented way to actually build it, and (4) CCPA's core requirement is an opt-out mechanism/disclosure rather than pre-collection consent (unlike GDPR) — the lowest-risk option that doesn't sacrifice the US B2B account-intelligence value is: **ship the disclosure (done, section 2) and the production-only gate (done, section 4), and do not add a blocking consent gate at this time.** If BotNest later markets into the EU/UK, or if your counsel wants a more conservative posture regardless, Option A is the one with an actual supported implementation path — I'd build it as a small first-party banner (not a third-party CMP) gating the same hostname-check script.

**I have not implemented any consent-gating behavior.** This needs your (or counsel's) sign-off on which posture to take before I write it.

## 4. Protecting the 250 monthly credits from internal/test traffic

**What I implemented (code-level, already live in this pass):** the production-only hostname gate described in section 1. This is the most reliable protection available from the website side — it guarantees Warmly's script never fires from this repo's local dev server, from any automated test/Playwright run, or from a Vercel preview/deployment URL, because none of those ever present `window.location.hostname` as `bot-nest.com`/`www.bot-nest.com`.

**What I could not do from the website side, and why:** a true per-visitor Block List (excluding your office/residential IP or a specific company once it's already resolving as bot-nest.com traffic) is a Warmly-dashboard-side concept, not something expressible in the public `clientId` snippet. I have no Warmly API key or dashboard login in this repo (confirmed — `.env.local` here contains only a Vercel-generated OIDC token, nothing Warmly-related), and I was not going to hardcode your IP into a public repository even if I had it, per your explicit instruction.

**What I found in Warmly's public documentation about this specific capability:** I could not find an officially-documented, exactly-named "Block List" feature page in Warmly's public help center via search or direct fetch. What I did confirm from their docs:
- Warmly already auto-filters bots, data centers, VPNs, and "outlook scramblers" before any identification happens (built-in, not configurable).
- "Segments 2.0" can exclude companies matching certain criteria from alerts/workflows (this governs who gets notified, not whether a visit is identified/counted at all).
- A third-party review mentioned a "domain blocklist" concept for do-not-engage accounts (competitors, existing customers), but I could not confirm this from Warmly's own docs or confirm it prevents credit consumption specifically.

**Manual action for you to take:** since you referred to a "Block List" by name, it most likely exists as a dashboard-only setting not covered in their public help articles (common for settings pages). Please check, in your own Warmly workspace:
1. **Settings** (the same area the docs point to for the install snippet) — look for "Block List," "Excluded Companies," "Suppression," or "Domain Exclusions."
2. If found, add your office's public IP address (not your residential IP, unless that's genuinely where test traffic originates) and/or `bot-nest.com`'s own domain if it offers a "don't identify my own company" option.
3. If you don't see it under Settings, Warmly's support (the chat widget inside their own dashboard, or a support contact) can confirm the exact location — I'd rather tell you honestly that I couldn't verify the exact click path than invent one.

## 5. Production verification

See the chat report for this pass for the full verification log (exact-one-loader check across all 23 files, production fetch confirming the snippet serves correctly, a real-browser check against the live site, and a hostname-gate test proving the script does not fire for non-production hostnames).

## 6. The 2-credit event (Warm Visitors: 1, Warm Accounts: 1)

See the chat report — short version: this very likely came from my own real-browser production verification in the previous pass (navigating actual headless Chrome to `https://bot-nest.com/` and confirming Warmly's `createSession` call succeeded), not from a live customer visit. I'm treating this as the most likely explanation with supporting evidence, not a certainty, since I have no access to Warmly's own session logs to confirm it directly.

## 7. Signals this website can eventually expose to a future Lead Engine (documentation only — nothing built)

This is an inventory of what could be made available later, once a Lead Engine integration is explicitly scoped and built in its own repository. Nothing here is implemented, scheduled, or wired up:

- **Company visit** — an identified company visiting the site (available today via Warmly's dashboard/webhook; not exposed anywhere outside Warmly from this repo).
- **Identified visitor** — a person-level match, where Warmly has legitimately resolved one (US traffic only, per their own documented policy).
- **Page viewed** — URL, page title, referrer.
- **Timestamp** — when the visit/page view occurred.
- **Referrer / UTM parameters** — campaign attribution data already captured by Warmly's script.
- **Repeat visit** — Warmly's cookie-based re-identification already supports detecting returning visitors.
- **Session/activity evidence** — pages-per-session, time-on-page, session ID, as shown in Warmly's own webhook payload examples (section 8).

No scoring (HOT/WARM), no automatic outreach, no CRM sync, and no OpenRouter/Apify involvement exists anywhere in this repo. That is Lead Engine scope, explicitly out of bounds for this pass.

## 8. Webhook reconnaissance (no endpoint created, no data sent anywhere new)

From Warmly's own documentation (`help.warmly.ai/articles/7839413626-setting-up-webhooks`):

- **Where it's configured**: Free tier — Settings → Webhooks in the Warmly dashboard, click "Get Started" and enter a webhook URL. (Paid tier uses a different path, Orchestrator → New Orchestration, which is not relevant to your current plan.)
- **Payload structure (documented example fields)**:
  - Contact-level event: email, LinkedIn URL, name, title; company name/website/industry/employee count/revenue; "Seen At" timestamp, referrer, captured URL, session ID, pages viewed (with timestamps and active seconds), UTM parameters; optionally chat session logs.
  - Company-level event: domain plus enriched company fields (legal name, founding year, tech stack, social handles), same session/activity data as above.
- **Authentication/security**: the only documented requirement is that the destination URL must be HTTPS. No signing secret, HMAC, custom header, or API-key mechanism is documented for the Free tier webhook.
- **Retry behavior**: not documented anywhere I could find. Treat this as unknown — any future consumer of this webhook should be built to tolerate missed or duplicate deliveries rather than assuming guaranteed-once delivery.
- **Is this available on your current tier?** The Free tier documentation says unfiltered person-level visitor events can go to one webhook destination. I cannot confirm from outside your dashboard whether this is actually turned on in your specific workspace — that's a one-click check for you in Settings → Webhooks.
- **Company-level events on your tier**: company-level webhook events as their own distinct event type appear to require the paid Orchestrator. However, the person-level event payload itself already includes company-enrichment fields (per the documented example), so you likely already get company context embedded in each person-level event without needing the paid tier.
- **What the Lead Engine would need later, safely**: (1) confirm the Free-tier webhook is actually enabled in Settings → Webhooks and get the configured URL; (2) since there's no documented signing/auth, the receiving endpoint should treat the payload as unauthenticated and verify it some other way (e.g., a secret query-string token you control on the receiving end, IP allowlisting if Warmly publishes sender IPs, or simply accepting that this is a low-sensitivity signal feed); (3) design for idempotent processing given undocumented retry behavior.

Nothing was created, enabled, or sent in this phase — this section is reconnaissance only, as instructed.

## 9. Security

- The `clientId` in the snippet (`6ba3d657a2023a23292fb24cf4adf6cd`) is public browser-side configuration, not a secret — Warmly's own install instructions put it directly in client-side HTML. It is not a private API key.
- No Warmly private API key, Apify token, OpenRouter key, `.env` content, or Vercel credential was read, modified, exposed, or committed. `.env.local` in this project was checked for variable names only (to confirm no Warmly key exists here) — its one variable is a Vercel-generated OIDC token unrelated to Warmly.
- The production-only gate is plain `window.location.hostname` comparison — standard web-platform JavaScript, not an undocumented Warmly API call.

## 10. Known limitations / residual risk

- No consent gate exists yet (see section 3) — a decision is pending from you.
- The exact Warmly cookie name/expiration isn't documented publicly; the privacy policy describes the category of data and purpose rather than cookie-level specifics, since Warmly itself doesn't publish those specifics.
- "Block List" / internal-traffic dashboard exclusion could not be confirmed by exact name or UI path from public documentation — flagged for your manual check (section 4).
- Webhook retry/auth behavior is undocumented by Warmly; anything built against it later should assume no guarantees.
