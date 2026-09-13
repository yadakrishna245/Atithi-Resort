# Atithi Platform — Project Memory

> **Purpose of this file:** this is a persistent, portable context dump for any AI assistant
> (Claude, GPT, or any other model/platform) picking up this project. Paste this file (and
> `summary.md` in this same folder) at the start of a new session so the assistant can resume
> work without re-discovering the whole codebase. Keep this file updated whenever a major
> decision, blocker, or milestone changes.
>
> **Last updated:** 2026-09-13

---

## 1. What this project is

**Atithi** — "One-stop verified stays for India." A full-stack, AWS-serverless hospitality
platform combining two products in one repo:

1. **A direct booking platform** (built, deployed) — a replica/alternative to Agoda, Cleartrip,
   MakeMyTrip, OYO, Goibibo, booking.com, but with the total price shown upfront, real
   verified-stay-only reviews, per-guest data isolation, and support for 10 Indian languages.
2. **An AI receptionist / call-answering system** (fully documented in `docs/`, **not yet built
   in code**) — answers phone calls a hotel's front desk misses, captures the enquiry as a lead,
   and routes it to staff with an SLA/escalation safety net.

### Founding story (why this exists)
A traveller finds a resort on Google, calls to book, nobody answers, he calls again, still no
answer, he books a competing resort instead. The original resort calls back hours later — revenue
already lost, permanently. That incident is the reason both products exist.

---

## 2. Repository layout

```
.
├── docs/                    # 19 numbered product & engineering documents (the source of truth
│                             # for intended behaviour — read these before assuming how something
│                             # is "supposed" to work)
├── packages/shared/          # Zod schemas, shared TS types, pricing engine (used by FE + BE)
├── backend/                  # Lambda handlers, repositories, services, AI grounding logic
├── frontend/                 # React 18 + Vite SPA, Tailwind, 10 Indian languages
├── infrastructure/            # AWS CDK v2 (TypeScript) — DynamoDB, Cognito, Lambda, API Gateway,
│                             # S3 + CloudFront (web hosting)
└── project-memory/            # ← this folder. AI-assistant-facing context, not part of the app.
```

### docs/ index (read these for authoritative intent — code does not yet implement all of it)
| File | Covers |
|---|---|
| 01-product-vision-and-problem.md | Problem statement, market hypothesis |
| 02-prd.md | Product requirements, goals, personas summary |
| 03-personas-and-user-journeys.md | Guest / owner / manager journeys |
| 04-workflows.md | **Master call-answering flow, routing, lead/SLA/escalation** (Mermaid diagrams) |
| 05-system-architecture.md | Full system architecture incl. telephony adapter interface |
| 06-tech-stack.md | Tech choices and rationale |
| 07-data-model.md | Entity-relationship model incl. `escalation_targets`, `calls`, `leads` |
| 08-api-spec.md | Full REST API spec incl. agent-config, business-hours, escalation-targets endpoints |
| 09-ai-agent-design.md | Voice AI persona, system prompt, tools/function-calling, intent taxonomy |
| 10-telephony-and-india-compliance.md | Call forwarding modes, DLT/TRAI compliance |
| 11-security-privacy-dpdp.md | India DPDP Act compliance, PII handling |
| 12-nfrs-and-slas.md | Latency/uptime targets (e.g. ring→AI-answer p95 ≤ 6s) |
| 13-roadmap-and-mvp-scope.md | **What's explicitly IN vs OUT of MVP** (outbound calling is OUT) |
| 14-pricing-and-gtm.md | Pricing tiers, go-to-market, ROI model |
| 15-testing-and-qa.md | Test strategy |
| 16-open-questions-and-decisions.md | Decision log (e.g. D7: shared DB + tenant isolation) |
| 17-glossary.md | Term definitions (containment, SLA timer, escalation chain, etc.) |
| 18-aws-serverless-architecture-and-cost.md | **AWS architecture, cost model, and §6: current deployed environment + live blockers** — read this first for infra status |
| 19-what-we-do-differently.md | Explicit list of trust/anti-pattern fixes vs. incumbent OTAs |

---

## 3. Tech stack

- **Monorepo:** npm workspaces (`packages/shared`, `backend`, `frontend`, `infrastructure`).
- **Backend:** Node.js 22.x Lambda functions (ARM64), esbuild-bundled as **CommonJS** (not ESM —
  see §8 gotchas), TypeScript, Zod validation, Vitest for tests.
- **Database:** DynamoDB, single-table design, `PAY_PER_REQUEST` billing, PITR + TTL enabled,
  GSI1/GSI2 for city search and secondary access patterns.
- **Auth:** Amazon Cognito User Pool, phone-OTP + email sign-in, 5 groups: `guest`,
  `partner_staff`, `partner_owner`, `platform_support`, `platform_admin`. No client secret
  (public SPA client). API Gateway HTTP API uses a Cognito JWT authorizer.
- **AI:** Provider-agnostic (`AI_PROVIDER=bedrock|openai|anthropic`), used **only** for
  natural-language search parsing, grounded property Q&A, and translation — never allowed to
  invent prices/availability/facts (enforced in `backend/src/ai/groundedAssistant.ts`).
- **Frontend:** React 18 + Vite + Tailwind CSS + AWS Amplify (Cognito auth) + TanStack Query.
  10 Indian languages (see `frontend/src/i18n/`).
- **Infra-as-code:** AWS CDK v2, TypeScript, CommonJS module output (`infrastructure/tsconfig.json`
  uses `CommonJS`/`Node`, not `NodeNext` — required for `ts-node`/CDK CLI compatibility).
- **Region:** `ap-south-1` (Mumbai) — chosen for India data residency per docs.

---

## 4. Current build status — what actually exists in code

**Built and deployed (booking-marketplace side):**
- `backend/src/handlers/`: `search.ts`, `properties.ts`, `bookings.ts`, `partner.ts`, `profile.ts`
- `backend/src/repositories/`: `propertyRepository.ts`, `inventoryRepository.ts`,
  `bookingRepository.ts`, `reviewRepository.ts`, `userRepository.ts`
- `backend/src/ai/`: `provider.ts` (LLM abstraction), `searchParser.ts` (NL search→filters),
  `groundedAssistant.ts` (RAG-grounded property Q&A)
- `backend/src/lib/`: `auth.ts`, `dynamo.ts`, `http.ts`, `idempotency.ts`, `env.ts`
- Full CDK stack (`infrastructure/lib/platform-stack.ts` + `web-stack.ts`): DynamoDB table,
  Cognito pool/groups/client, 25 Lambda functions, HTTP API with 25 routes (6 public, 19 JWT).
- Frontend: search, property detail, checkout, my-bookings, login, partner dashboard pages —
  **just redesigned with a glassmorphism/premium UI (see §9)**.

**NOT yet built (documented only in `docs/`, referenced only as placeholder DynamoDB key
builders in `backend/src/lib/dynamo.ts` — `keys.lead(...)`, `keys.call(...)`):**
- Telephony webhook / call-answering AI agent runtime
- Lead creation, SLA timers, escalation-to-manager logic
- `escalation_targets`, `business-hours`, `agent-config` endpoints from docs/08
- Outbound calling of any kind (explicitly **out of MVP scope** per docs/13)

**If asked "does the AI actually answer phone calls right now?" — the honest answer is NO.**
That entire engine is designed in docs/04, 05, 09, 10 but not implemented. Only the booking
website (search/browse/book a verified property) is real, deployed, working code today.

---

## 5. AWS deployed environment (dev) — live resource IDs

> Source of truth: `infrastructure/platform-outputs.json` (committed) and
> `docs/18-aws-serverless-architecture-and-cost.md` §6.

| Resource | Value |
|---|---|
| AWS Account | `325355907299` |
| IAM user | `krishna` |
| Region | `ap-south-1` |
| CDK stack (data/API/auth) | `AtithiPlatform-dev` — **deployed, healthy** |
| CDK stack (web hosting) | `AtithiWeb-dev` — **blocked, not deployed** (see §6) |
| DynamoDB table | `atithi-main-dev` |
| Cognito User Pool ID | `ap-south-1_J1HbiyZYd` |
| Cognito User Pool Client ID | `u44sigcus4frr6vnv7v9d8br1` |
| API Gateway base URL | `https://838loo47jh.execute-api.ap-south-1.amazonaws.com` |
| Media S3 bucket | `atithi-media-dev-325355907299` |
| Lambda count / runtime / arch | 25 functions, Node.js 22.x, ARM64 |

Frontend `.env` is already populated with the above API/Cognito values. Local dev server:
`npm run dev:web` → `http://localhost:5173`, wired to the **live** deployed API (not a mock).

---

## 6. Known blockers (both are AWS-account-level, not code bugs)

1. **CloudFront cannot be created.** CloudFormation `CREATE_FAILED` on `AtithiWeb-dev` with:
   `"Your account must be verified before you can add new CloudFront resources."`
   This requires an **AWS Support ticket** — cannot be fixed from code or IAM changes. The
   ROLLBACK_COMPLETE stack was cleaned up via `aws cloudformation delete-stack`.
   → **Impact:** no public CloudFront URL exists yet; the only way to use the UI today is the
   local Vite dev server pointed at the live API.
   → **Re-verified 2026-09-13 (later session):** retried `npm run deploy:web -w infrastructure`
   — same `AccessDenied` / "account must be verified" error, same `CREATE_FAILED` on the
   `Distribution` resource. `aws cloudfront list-distributions` confirms zero distributions
   exist in the account. The ROLLBACK_COMPLETE stack was deleted again to keep the account
   clean. **Still blocked — no CloudFront URL exists.** Also found and fixed a stale bug while
   investigating: `infrastructure/package.json`'s `deploy:web` script referenced the stack name
   `AtithiWeb` (missing the `-dev` stage suffix used everywhere else), so it always failed with
   "No stacks match the name(s) AtithiWeb" before even reaching AWS. Fixed to `AtithiWeb-dev`.
2. **Bedrock invocation blocked account-wide.** `ValidationException: Operation not allowed` —
   confirmed via direct `aws bedrock-runtime invoke-model` CLI calls against 4 different
   model/profile identifiers across 2 providers (Anthropic + Amazon), all failed identically.
   This is an account-wide Bedrock restriction, not a wrong-model-id or wrong-region issue
   (the model id was separately corrected to `anthropic.claude-3-haiku-20240307-v1:0`, which is
   valid in `ap-south-1`, but the restriction is unrelated to model choice).
   → **Impact:** natural-language search parsing and grounded Q&A degrade gracefully (return
   `degraded: true`, plain filtered results) instead of crashing — this was verified working —
   but the "smart" AI features cannot actually run until AWS Support lifts the restriction.

**Both blockers require the account owner to open an AWS Support case.** This cannot be done by
an AI assistant. Resume instructions once unblocked are in docs/18 §6.

---

## 7. Bugs found and fixed during multi-agent live testing (all resolved, redeployed, reverified)

1. **All Lambdas crashed at cold start**: `Dynamic require of "node:stream" is not supported`.
   Root cause: Bedrock SDK's CommonJS build got inlined into an ESM Lambda bundle. Fix: switched
   Lambda bundling to CommonJS output, and lazy-load `@aws-sdk/client-bedrock-runtime` via dynamic
   `import()` inside `backend/src/ai/provider.ts` so non-AI handlers don't even pull it in.
2. **Reversed date range on `/search` silently returned empty results** instead of a 400. Root
   cause: `searchFiltersSchema` in `packages/shared/src/schemas.ts` was missing the `.refine()`
   date-order guard that every sibling schema already had. Fixed by adding it.
3. **AI parser failures were invisible to the client** (confident-looking 200 with empty/wrong
   filters). Fixed by adding an explicit `degraded: boolean` field, threaded from
   `backend/src/ai/searchParser.ts` → `InterpretedQuery` type → the `SearchPage.tsx` UI banner,
   which now shows an explicit amber "smart search unavailable" warning instead of failing silently.

**Lesson recorded:** esbuild bundling format matters a lot when a Lambda depends on AWS SDK v3
clients that ship CJS-only code — always test with real deployed HTTP traffic, not just
typecheck/unit tests, since both bugs above were only caught that way.

---

## 8. Testing status (last verified)

- Backend unit/grounding/tenant-isolation tests: **34/34 passing** (`npm test -w backend`).
- Live security/tenant-isolation testing via multi-agent adversarial calls: **19/19 checks PASS**
  — no-token rejection on all 13 personal-data routes, forged/unsigned/malformed JWT rejection,
  no user-enumeration oracle, no data leakage in error response bodies.
- Infrastructure verification against CDK definitions: DynamoDB config/PITR/TTL, Cognito groups,
  Lambda count/runtime/arch, API Gateway route auth types — **all match intended design**.
- **Not yet tested:** a full real end-to-end user journey (signup → property onboarded →
  inventory published → booking created → cancellation/refund) against live DynamoDB. The
  database currently has **0 items**. This is the most valuable next verification step.

---

## 9. Frontend design system (added 2026-09-13)

Redesigned with an Apple-style glassmorphism ("frosted glass") aesthetic plus a custom resort
scene, and added Agoda/OYO/MakeMyTrip-style place-based discovery:

- `frontend/src/assets/resort-hero.svg` — hand-authored vector illustration (sunset, infinity
  pool, palm silhouettes, lit villas) used as the hero background. **Not a hotlinked photo** —
  this sandbox has no outbound internet access (verified via failed HTTP HEAD requests), so an
  external stock-photo URL would risk showing broken images. If a real photo is later obtained,
  drop it at `frontend/src/assets/` and swap the `import heroBg from '...'` in `SearchPage.tsx`.
- `frontend/src/index.css` — new `@layer components` utilities: `.glass`, `.glass-panel`,
  `.glass-card`, `.glass-chip`, `.btn-glass-primary`, `.gradient-text`.
- `frontend/tailwind.config.js` — added `boxShadow.glass/glass-lg/glow`, `borderRadius['4xl']`.
- `frontend/src/components/DestinationsStrip.tsx` — new component: a horizontally scrollable
  row of 8 curated Indian destinations (Goa, Coorg, Manali, Udaipur, Munnar, Jaipur, Rishikesh,
  Alleppey). Clicking a card sets the `?city=` URL param and triggers the real `/search` API call
  — same UX pattern as tapping a destination tile on Agoda/OYO/MakeMyTrip home screens.
- `frontend/src/pages/SearchPage.tsx` — restructured around a `mode: 'filters' | 'natural'` state
  so a stale natural-language result never lingers after picking a destination/filter. Added a
  glass hero + floating glass search card, glass filter chips, glass result cards with a
  deterministic per-property gradient placeholder "photo" band (`gradientFor(name)` hash), and a
  glass empty-state (trust bullets) instead of a blank screen when no city is selected yet.
- `frontend/src/App.tsx` — header is now a blurred/translucent sticky nav with gradient-text logo.
- Verified: `npm run build -w frontend` passes clean; live-tested in browser at
  `http://localhost:5173` — hero renders, destination click sets `?city=coorg` and shows the
  correct (currently empty, since DB has 0 items) results state.

---

## 10. Conventions and gotchas (read before editing)

- **Infra module system:** `infrastructure/tsconfig.json` must stay `CommonJS`/`Node`, not
  `NodeNext` — CDK CLI + `ts-node` compatibility. `infrastructure/bin/app.ts` uses `__dirname`,
  not `import.meta.url`.
- **Lambda bundling:** do NOT set `format: OutputFormat.ESM` in the `NodejsFunction` bundling
  options in `infrastructure/lib/platform-stack.ts` — this breaks any handler that transitively
  touches the Bedrock SDK. Default (CommonJS) is correct.
- **Zod schemas for route bodies:** `backend/src/lib/http.ts`'s `RouteOptions<TBody>` binds
  `ZodType<TBody, ZodTypeDef, unknown>` (the **output** type), not `ZodSchema<TBody>` (input
  type) — needed so `.default()` fields resolve to non-optional in the handler body.
- **Any Zod schema with a check-in/check-out date pair MUST have the same `.refine()` date-order
  guard** as `dateRangeSchema`/`availabilityQuerySchema`/`createBookingSchema` in
  `packages/shared/src/schemas.ts` — this was a real production bug once (see §7.2).
- **AI failures must never be silent** — always propagate a `degraded: boolean` (or equivalent)
  end-to-end to the UI rather than returning a confident-looking but wrong response (see §7.3).
- **City slugs** are produced by `citySlugOf()` in `backend/src/repositories/propertyRepository.ts`
  — lowercase, hyphenated, trimmed (`city.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')...`).
  The curated destination list in `DestinationsStrip.tsx` uses matching plain slugs
  (`'goa'`, `'coorg'`, `'manali'`, etc.).
- **i18n:** `useI18n()` / `t(key)` requires `key` to be a typed `TranslationKey` from
  `frontend/src/i18n/translations.ts` — do not pass arbitrary strings to `t()`. New decorative
  marketing copy (e.g. destination taglines, trust bullets) is fine as plain hardcoded JSX text,
  it does not need to go through `t()`.
- **Tenant isolation is enforced in 5 independent layers** — see README.md "The two guarantees,
  enforced in code" section for the full list and file references. Do not weaken any single layer
  even if it looks redundant with another.
- **AWS CLI** is installed per-user at `%LOCALAPPDATA%\Programs\Amazon\AWSCLIV2` (added to user
  PATH) — no admin rights were available/used. If a fresh terminal doesn't see `aws`, refresh
  `$env:Path` from both Machine and User scope in that session.
- **No outbound internet access** from the terminal in this sandbox (verified: `Invoke-WebRequest`
  to external hosts times out). Don't assume image/CDN URLs are reachable without testing, and
  prefer local/generated assets over hotlinked ones.

---

## 11. Continuation plan / next steps

1. **AWS Support tickets** (external, human/account-owner action — cannot be done by an AI
   assistant): (a) CloudFront account verification, (b) Bedrock "Operation not allowed"
   account-wide restriction. Exact error text and diagnostic commands are in docs/18 §6.1.
2. **Full end-to-end booking journey test** (can be done immediately, not yet done): create a
   test partner account and walk signup → property onboarded → inventory published → booking
   created (tests the atomic DynamoDB transaction/overbooking guard) → cancellation (tests refund
   calculation). This is the one major code path that has only been schema/auth/infra-tested so
   far, not exercised against real live business logic.
3. **Once CloudFront is unblocked:** redeploy `AtithiWeb-dev` (`npm run deploy:web`), then get the
   real CloudFront URL and run `aws cloudfront create-invalidation` for `/*` after any frontend
   change — command already documented in docs/18 §6.1.
4. **Once Bedrock is unblocked:** re-test natural-language search and grounded property Q&A live;
   confirm `degraded` flips back to `false`.
5. **Longer-term / bigger scope:** the telephony/AI-receptionist engine described in docs/04, 05,
   09, 10 (lead capture, SLA timers, escalation chain, transfer-to-human) is fully designed but
   not implemented — this is the "other half" of the product and the next major feature if the
   user wants to build it.

---

## 12. Command cheat sheet

```bash
# Install everything (run once, or after adding a dependency)
npm install

# Local development
npm run dev:web              # Vite dev server, http://localhost:5173, wired to LIVE deployed API
npm run dev:api              # local backend dev (if used)

# Quality gates
npm test -w backend          # unit + grounding + tenant-isolation tests
npm run typecheck --workspaces --if-present
npm run build -w frontend    # tsc -b && vite build
npm run build --workspaces --if-present

# Infra (from repo root; CDK app lives in infrastructure/)
npx cdk synth --app "npx ts-node --prefer-ts-exts infrastructure/bin/app.ts" --output infrastructure/cdk.out
npm run deploy -w infrastructure       # deploys AtithiPlatform-dev (data/API/auth)
npm run deploy:web -w infrastructure   # deploys AtithiWeb-dev (S3+CloudFront) — currently blocked

# AWS CLI sanity checks (region ap-south-1)
aws sts get-caller-identity
aws apigatewayv2 get-apis --region ap-south-1
aws dynamodb describe-table --table-name atithi-main-dev --region ap-south-1
aws cognito-idp describe-user-pool --user-pool-id ap-south-1_J1HbiyZYd --region ap-south-1
```

---

## 13. How to resume work in a new AI session

1. Read `project-memory/summary.md` first (30-second brief), then this file for full detail.
2. Check `docs/18-aws-serverless-architecture-and-cost.md` §6 for the latest deployment/blocker
   status — it may have changed if AWS Support resolved either blocker since this file was last
   updated.
3. Do **not** assume the AI-receptionist/telephony engine exists in code — verify against §4 of
   this file and the actual `backend/src/handlers/` directory before making claims to the user.
4. Prefer editing existing files over creating new ones; this is a mature, working codebase with
   established conventions (§10) — follow them rather than introducing new patterns.
5. If AWS CLI commands are needed, confirm credentials are still configured
   (`aws sts get-caller-identity`) before assuming the account/session in §5 is still valid.
