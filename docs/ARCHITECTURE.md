# Bills – Architecture Plan (v0.1 draft)

Goal: turn the single-household "Hateena Bills" prototype into a sellable, multi-tenant SaaS delivered as a PWA.

## 1. What the reference app does (hateena-v2)

A Hebrew/RTL PWA for a landlord who splits utility bills between a main house and two rental units.

- **Roles**: `admin` (landlord) and `tenant` (one per unit, linked via `users/{uid}.consumerId`).
- **Monthly flow**: tenants submit an electricity reading (photo + OCR via Google Vision) → admin enters the main meters (electricity, water, sewage, fixed payment) → app calculates → admin approves → tenants are emailed (EmailJS) and an Excel report is generated/shared (SheetJS/ExcelJS, WhatsApp share) → admin marks payments paid.
- **Calculation**: main usage = main meter − sub-meters; electricity = usage × rate + fixed payment / 3; water is tiered (quota at rate A, excess at rate B); sewage = water × rate; plus community fee, arnona (property tax), and one-time charges.
- **Data (Firestore)**: `users`, `settings/rates`, `meters/{YYYY-MM}`, `calculations/{YYYY-MM}`, `notifications`; photos in Storage.
- **Screens**: login, home (monthly overview), meters, calc, history (+insights), settings (rates, fees, tenant swap, tenant-view impersonation).

### Why it can't be sold as is
| Problem in prototype | Consequence |
|---|---|
| Names, 3 units, tenant emails, rates hardcoded in code | Single customer only |
| Firebase, Vision and EmailJS keys committed in client JS | Abuse/cost exposure; must be rotated |
| Money as JS floats; calc logic mixed into UI | Rounding errors, untestable |
| One 2,500-line `app.js`, inline `onclick`, global `window.*` | Unmaintainable |
| No tests, no security rules in repo, tenant onboarding by pasting a UID | Not safe or self-serve |
| Hebrew-only, ILS-only, Israeli utilities only | Narrow market |
| Network-first SW with no offline shell | Weak PWA |

**Action item now:** the keys in hateena-v2 are public in a repo and should be treated as leaked (rotate them with the owner). We must not copy them.

## 2. Product scope

**MVP (sellable v1)**
1. Self-serve signup, organization (landlord account), subscription.
2. Properties → units → tenants (invite by email/link, no manual UIDs; tenant swap with move-in/out dates and opening readings).
3. Configurable meters and tariffs (no hardcoded 3 units).
4. Monthly cycle: readings (tenant or manager, photo, OCR suggestion) → calculate → review → approve → statement (PDF + email + share link) → payment tracking.
5. History and basic insights; Hebrew + English, RTL/LTR.

**Later**: payment collection, WhatsApp/push reminders, bank/utility-bill import, multi-currency/countries, accountant export, white-label.

## 3. Hard constraint: run on free resources

Validation runs with **100 design partners, rolled out gradually (round 1 = 20)**. Priority #1 is a **$0 monthly bill** until paying customers exist. Every choice below is picked for a real free tier, and each has a stated upgrade trigger.

| Layer | Choice (free tier) | Limits that matter | Upgrade trigger |
|---|---|---|---|
| Frontend | **React + TypeScript + Vite**, TanStack Query, Tailwind (RTL logical properties), i18next | – | – |
| PWA | `vite-plugin-pwa` (Workbox): precached shell, IndexedDB offline queue, update prompt, Web Push (VAPID, free) | – | – |
| Hosting | **Cloudflare Pages** (unlimited bandwidth, preview deploys, free custom domain) | 500 builds/mo | – |
| Backend | **Supabase Free**: Postgres + RLS, Auth, Storage, Edge Functions | 500 MB DB, 1 GB storage, 50k MAU, 500k function calls; **project pauses after 7 days of inactivity** | Pro ($25/mo) before first paying customer or when storage nears 1 GB |
| Pause protection | GitHub Actions cron pings the DB every few days | – | Disappears on Pro |
| Billing engine | Pure TS package `@bills/engine`, integer agorot, fully tested, runs client (preview) and server (authoritative) | – | – |
| OCR | **On-device Tesseract.js** (digits only) or Gemini free API via Edge Function; always a suggestion the user confirms | Gemini free quota is rate-limited | Paid vision API per-scan if volume grows |
| Statements | Client-side PDF (pdf-lib / React-PDF) + shareable link; Excel export kept | – | – |
| Email | **Resend free** (3,000/mo, 100/day) via Edge Function | Fine for 100 partners × few mails/mo | Paid tier |
| Payments | None collected in-app for the pilot; Stripe later (no monthly fee, only per-transaction) | – | Phase 4 |
| Errors / CI | Sentry free, GitHub Actions free, Vitest, Playwright | 2,000 GitHub Actions min/mo for private repos | – |

**Why not Firebase:** Storage now requires the paid Blaze plan, and Cloud Functions need Blaze too, which means a card on file and uncapped overage risk. Supabase Free covers all four needs without a card.

**Capacity check (round 1 → 100 partners):** 100 orgs × ~5 payable items × 12 months of images is ~6,000 photos. Compressed client-side to ~150 KB that is ~900 MB, right at the 1 GB storage cap. Hence image compression and the retention policy in section 6 are required from day one, not "later". The relational data (readings, statements) is tiny: far below 500 MB.

### Stack notes
- Server-side secrets (OCR, email, retention job) only in Edge Functions; the client gets only the public anon key.
- The engine package is shared by client and server so previews always match approved numbers.
- Everything is infra-as-code (`/supabase` migrations) so we can move to Pro or self-host without rework.

## 4. Domain model

```
PlatformUser(super_admin flag) – our staff, outside any organization
Organization(retention_months, plan, status: pilot|active|suspended) ──< Membership(user, role: owner|manager|tenant)
ImpersonationSession(super_admin, target_org, target_user?, reason, mode: read_only|full, expires_at)
Organization ──< Property ──< Unit ──< Tenancy(tenant_user, from, to)
Property ──< Meter(type: electricity|water|gas, parent_meter_id?, unit_id?)
Meter ──< Reading(period, value, source: tenant|manager|ocr, photo, status)
Property ──< TariffSet(effective_from, rates JSON: unit prices, tiers/quota)
Property ──< ChargeRule(kind: fixed|per_unit|shared_split|one_time, scope, amount/split)
Property ──< BillingPeriod(YYYY-MM, status: open|calculated|approved)
BillingPeriod ──< Statement(unit, tenancy) ──< LineItem(kind, qty, rate, amount)
Statement ──< Payment(amount, date, method)
PayableItem(property, kind: electricity|water|arnona|...) ──< ItemImage(period, storage_path, size, expires_at)   # max 1 per item per month
AuditLog(actor_user, effective_org, action, ...), Notification, Subscription
```

Key rules:
- The reference's "main minus sub-meters" is modeled by `parent_meter_id` (a unit's consumption = meter − children).
- Tiered water, fixed-cost splits (÷N or by %), arnona, community fee are `ChargeRule`s, so any property can configure them.
- Tariffs are versioned by effective date; approved statements store a **snapshot** of inputs and line items and are immutable (corrections = adjustment line next month).
- Every table carries `organization_id`; RLS policies enforce membership. Tenants can only see their own tenancy's readings/statements.

## 5. Repository layout (monorepo, pnpm workspaces)

```
/apps/web            React PWA
/packages/engine     billing calculations + tests
/packages/shared     types, zod schemas, i18n keys
/supabase            migrations, RLS policies, edge functions, seed
/docs                architecture, ADRs, runbooks
/.github/workflows   CI (lint, typecheck, test, e2e, deploy preview)
```

## 6. Platform admin console, impersonation, image retention

### Super-user console (`/admin`, only for `platform_users.is_super_admin`)
- **Users & organizations**: list/search, create, invite, suspend/reactivate, reset access, change role, see last activity and plan/status.
- **Pilot management**: cohort tag (round 1 / 2 / …), invited vs activated vs active-this-month, simple usage numbers per org (units, statements, storage used) to track the 100-partner validation and the free-tier budget.
- **Platform metrics**: total DB/storage use against the free-tier caps, with alerts.
- **Audit log viewer**.
- Separate route and role check; not reachable by customers, enforced by RLS and Edge Functions, not just by hiding the UI.

### "Act as customer" (impersonation)
- Super admin picks an org (and optionally a specific user) and gets a session that sees exactly what that customer sees.
- **Implementation:** the super admin keeps their own identity. An Edge Function creates an `ImpersonationSession` (requires a reason, expires in e.g. 60 min). RLS helpers like `is_member(org)` return true for a member **or** a super admin with an active session for that org, so there is no shared password or token swapping.
- **Safety:** persistent "Viewing as X, exit" banner; default `read_only` mode with an explicit switch to `full`; every write records both the real actor and the effective org in `AuditLog`; sessions auto-expire; customer-visible "support accessed your account" entry (trust and privacy).

### Image retention ("1 image per payable item per month")
- Unique constraint `(item_id, period)`: replacing the photo overwrites the old file, so storage stays bounded.
- Client compresses before upload (max ~1600 px, JPEG/WebP ~150 KB) to protect the 1 GB cap.
- **Aging:** `organizations.retention_months` (default 6, configurable per org and by super admin, `0` = keep forever / paid feature). A scheduled job (`pg_cron` + Edge Function) deletes expired files and rows nightly and logs counts. Readings and statements stay forever; only the image goes.
- Warning in the UI before an image expires; manual "download all images" export for the owner.
- Storage bucket private, signed URLs, per-org path prefix enforced by Storage policies.

## 7. Security and compliance
- Secrets only in env/Supabase vault; only the public anon key ships to the client.
- RLS on every table with policy tests; signed URLs for meter photos; private bucket.
- Roles checked server-side; audit log for approvals and rate changes.
- Rate limiting on OCR/email functions; email verification; optional MFA for owners.
- Privacy: Israeli Privacy Protection Law/GDPR basics, data export and delete, ToS and privacy policy.
- Backups (Supabase PITR), Sentry, uptime monitoring.

## 8. Roadmap

| Phase | Deliverable |
|---|---|
| 0 – Foundation | Monorepo, CI, i18n/RTL, Supabase free project, auth, schema + RLS, keep-alive cron |
| 1 – Engine | `@bills/engine` reproducing the reference calc, with golden tests from real hateena months |
| 2 – Core flow | Property/unit/tenant setup, readings, calc, approve, statement PDF/email |
| 3 – Admin console | Super-admin users/orgs page, pilot cohorts, audit log, **act-as-customer** |
| 4 – Pilot round 1 | 20 design partners onboarded, image upload + compression, retention job, feedback loop |
| 5 – PWA polish | Offline queue, push, OCR, install prompt |
| 6 – Pilot rounds 2–5 | Scale to 100 partners, watch free-tier metrics, decide Pro upgrade point |
| 7 – Monetization | Stripe plans, landing page, legal |

(Phase 3 comes before the pilot because you need the console and impersonation to support the first 20 partners.)

## 9. Open decisions
1. **Market**: Israel-only first (Hebrew, ILS, arnona/va'ad bayit)? I assume yes for the pilot.
2. **Tenants**: accounts to submit readings and view statements, or manager-only in v1? I assume both, as in the reference.
3. **Pricing** (later): per unit, flat tiers, or per property?
4. **App name and domain** ("Bills" is generic; check trademark and domain).
5. **Team**: solo with Claude, or will your friend contribute too?
6. **Supabase and Cloudflare accounts**: do you already have them, or should I walk you through creating them (both free, no card)?
