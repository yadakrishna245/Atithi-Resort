# Atithi Platform — 60-Second Summary

*(Read `memory.md` in this same folder for full detail. This file is the quick brief.)*

## What is it
**Atithi** = a direct hotel/resort booking platform for India (Agoda/OYO/MakeMyTrip-style,
but with upfront total pricing and verified-stay-only reviews) **plus** a documented (not yet
built) AI phone receptionist that answers calls hotels miss and turns them into leads.

## What's real vs. what's just a plan
| | Status |
|---|---|
| Booking marketplace (search, property pages, checkout, bookings, partner dashboard) | ✅ **Built and deployed to AWS** |
| Multi-tenant data isolation, Cognito auth, DynamoDB, 25 Lambdas, API Gateway | ✅ **Built and deployed** |
| Premium glassmorphism UI + place-based destination browsing | ✅ **Built 2026-09-13** |
| AI phone receptionist (call answering, leads, SLA, escalation) | 📄 **Fully designed in `docs/04, 05, 09, 10`, zero code written** |
| Public CloudFront URL for the frontend | ❌ **Blocked** — AWS account needs CloudFront verification (Support ticket required) |
| Bedrock-powered smart search / AI Q&A | ❌ **Blocked** — AWS account-wide Bedrock restriction (Support ticket required); degrades gracefully in the meantime |

## Where it's deployed
- AWS account `325355907299`, region `ap-south-1` (Mumbai), stack `AtithiPlatform-dev`.
- Live API: `https://838loo47jh.execute-api.ap-south-1.amazonaws.com`
- Local UI (only way to use it today, since CloudFront is blocked):
  `npm run dev:web` → `http://localhost:5173` (talks to the real live API).

## Two open blockers (need the AWS account owner, not code)
1. CloudFront: *"Your account must be verified before you can add new CloudFront resources."*
   **Re-checked 2026-09-13 (later session) — still blocked, identical error.**
2. Bedrock: *"ValidationException: Operation not allowed"* on every model/provider tried.

Both need an AWS Support case opened. Exact text + diagnostic commands: `docs/18` §6.
There is currently **no CloudFront URL** — do not give the user a fabricated one.

## What to do next (in priority order)
1. Open the two AWS Support tickets (human action).
2. Run a full end-to-end test: signup → list a property → publish inventory → book it →
   cancel it. Never done yet — DB currently has 0 items.
3. When unblocked, deploy the web stack and get the real CloudFront URL.
4. If the user wants the "AI answers the phone" half of the product, that's a from-scratch
   build — nothing exists in code for it yet (only DynamoDB key placeholders).

## Golden rule for any assistant picking this up
Don't assume the phone/AI-receptionist system is implemented just because it's extensively
documented in `docs/`. Verify against `backend/src/handlers/` (currently: `search`, `properties`,
`bookings`, `partner`, `profile` — nothing telephony-related) before telling the user it works.
