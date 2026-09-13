# 08 — API Specification

**Version:** 0.1 · **Date:** 2026-09-13 · **Base URL:** `https://api.atithi.ai/v1`

---

## 1. Conventions

| Aspect | Convention |
|---|---|
| Protocol | HTTPS only (TLS 1.2+), HSTS enforced |
| Format | JSON; `Content-Type: application/json` |
| Naming | `snake_case` fields, plural resource paths |
| IDs | UUID v7 (time-sortable) |
| Timestamps | ISO 8601 UTC (`2026-09-13T10:15:30Z`) |
| Money | Integer **paise** + `currency` to avoid float errors |
| Phone | E.164 (`+919876543210`) |
| Pagination | Cursor: `?limit=50&cursor=<opaque>` → `{ data, next_cursor }` |
| Filtering | Query params; dates as `from`/`to` |
| Idempotency | `Idempotency-Key` header required on all POST that create side effects |
| Versioning | URL path (`/v1`); breaking changes → `/v2` with 6-month overlap |
| Rate limits | Per org; `X-RateLimit-Limit`, `-Remaining`, `-Reset` headers |

### Error format
```json
{
  "error": {
    "code": "lead_not_found",
    "message": "Lead with id 01927... was not found in this organization.",
    "details": { "lead_id": "01927..." },
    "request_id": "req_01927..."
  }
}
```

| HTTP | Meaning |
|---|---|
| 400 | Validation failure (`validation_error` with field-level `details`) |
| 401 | Missing/invalid credentials |
| 403 | Authenticated but not permitted (also returned for cross-tenant access — never 404-leak) |
| 404 | Resource not found within tenant scope |
| 409 | Conflict (duplicate, state transition not allowed) |
| 422 | Semantically invalid (e.g. check-out before check-in) |
| 429 | Rate limited (`Retry-After`) |
| 5xx | Server error; `request_id` required for support |

---

## 2. Authentication & authorization

### 2.1 Dashboard / app (user sessions)
- Session cookie (httpOnly, Secure, SameSite=Lax) issued after login
- Login methods: phone OTP, email magic link, Google OAuth
- Short-lived access token + refresh rotation for the PWA

### 2.2 Machine-to-machine (partners, PMS, webhooks out)
- `Authorization: Bearer <api_key>` — org-scoped, prefixed `atk_live_` / `atk_test_`, shown once, hashed at rest
- Optional IP allowlist per key
- Scopes: `leads:read`, `leads:write`, `calls:read`, `kb:read`, `kb:write`, `webhooks:manage`

### 2.3 Tenant scoping
Every request resolves to exactly one `organization_id`. Property-scoped endpoints validate the property belongs to that org. **No endpoint accepts `organization_id` as a client-supplied parameter.**

### 2.4 Permission matrix

| Resource | Owner | Manager | Staff | ReadOnly |
|---|---|---|---|---|
| Properties (read) | ✅ | ✅ | ✅ | ✅ |
| Properties (write) | ✅ | ✅ | ❌ | ❌ |
| Agent config | ✅ | ✅ | ❌ | ❌ |
| Knowledge base (write) | ✅ | ✅ | ❌ | ❌ |
| Calls (read + recording) | ✅ | ✅ | ✅ own property | ✅ metadata only |
| Leads (read) | ✅ | ✅ | ✅ assigned + unassigned | ✅ |
| Leads (update status) | ✅ | ✅ | ✅ | ❌ |
| Lead reassignment | ✅ | ✅ | ❌ | ❌ |
| Users & roles | ✅ | ✅ (below own role) | ❌ | ❌ |
| Billing | ✅ | ❌ | ❌ | ❌ |
| Data export / deletion | ✅ | ❌ | ❌ | ❌ |

---

## 3. Endpoints

### 3.1 Organizations & properties

```http
GET    /organizations/me
PATCH  /organizations/me

GET    /properties
POST   /properties
GET    /properties/{property_id}
PATCH  /properties/{property_id}
POST   /properties/{property_id}/activate
POST   /properties/{property_id}/pause
GET    /properties/{property_id}/readiness      # onboarding checklist state
```

**`POST /properties`**
```json
{
  "name": "Coorg Mist Resort",
  "type": "resort",
  "address": { "line1": "Madikeri Road", "city": "Madikeri", "state": "Karnataka", "pincode": "571201" },
  "geo": { "lat": 12.4244, "lng": 75.7382 },
  "timezone": "Asia/Kolkata",
  "primary_language": "en-IN",
  "supported_languages": ["en-IN", "hi-IN", "kn-IN"],
  "check_in_time": "14:00",
  "check_out_time": "11:00",
  "total_rooms": 28,
  "website_url": "https://example.com"
}
```

**`GET /properties/{id}/readiness` →**
```json
{
  "ready_to_activate": false,
  "checks": [
    { "key": "basic_details",   "status": "passed" },
    { "key": "room_types",      "status": "passed",  "detail": "3 room types configured" },
    { "key": "tariffs",         "status": "passed" },
    { "key": "policies",        "status": "warning", "detail": "2 of 6 core policies unset" },
    { "key": "transfer_number", "status": "failed",  "detail": "No escalation target configured" },
    { "key": "phone_routing",   "status": "passed",  "detail": "conditional_forward" },
    { "key": "test_call",       "status": "failed",  "detail": "No successful test call yet" }
  ]
}
```

### 3.2 Agent configuration

```http
GET    /properties/{property_id}/agent-config
PATCH  /properties/{property_id}/agent-config
GET    /properties/{property_id}/agent-config/voices      # available TTS voices by language
POST   /properties/{property_id}/agent-config/preview     # synthesize greeting sample
```

```json
PATCH /agent-config
{
  "agent_name": "Meera",
  "voice_id": "hi-IN-female-warm-01",
  "tone": "warm",
  "greeting_template": "Namaste, thank you for calling {property_name}.",
  "max_call_seconds": 420,
  "recording_enabled": true,
  "transfer_enabled": true,
  "allow_price_ranges": true
}
```
> `allow_firm_quotes` is **not client-settable** in v1; it is gated behind a verified PMS integration.

### 3.3 Business hours & escalation

```http
GET    /properties/{property_id}/business-hours
PUT    /properties/{property_id}/business-hours
GET    /properties/{property_id}/holidays
POST   /properties/{property_id}/holidays
DELETE /properties/{property_id}/holidays/{id}

GET    /properties/{property_id}/escalation-targets
POST   /properties/{property_id}/escalation-targets
PATCH  /properties/{property_id}/escalation-targets/{id}
DELETE /properties/{property_id}/escalation-targets/{id}
```

### 3.4 Phone numbers & routing

```http
GET    /properties/{property_id}/phone-numbers
POST   /properties/{property_id}/phone-numbers/provision
PATCH  /properties/{property_id}/phone-numbers/{id}
GET    /properties/{property_id}/forwarding-instructions?carrier=jio
POST   /properties/{property_id}/test-call
GET    /properties/{property_id}/test-call/{id}
```

**`GET /forwarding-instructions?carrier=jio` →**
```json
{
  "carrier": "jio",
  "target_number": "+918045678901",
  "steps": [
    { "condition": "no_answer",  "ussd": "**61*+918045678901*11*20#", "description": "Forward after 20 seconds of ringing" },
    { "condition": "busy",       "ussd": "**67*+918045678901#",       "description": "Forward when the line is busy" },
    { "condition": "unreachable","ussd": "**62*+918045678901#",       "description": "Forward when switched off or out of coverage" }
  ],
  "verification_code": "*#61#",
  "deactivation_codes": ["##61#", "##67#", "##62#"],
  "notes": "Codes vary by circle and plan. If a code fails, contact your carrier or use the assisted setup option.",
  "help_video_url": "https://help.atithi.ai/forwarding/jio"
}
```
> ⚠️ USSD codes above are **illustrative** and must be verified per carrier and circle before shipping — see [Doc 10](10-telephony-and-india-compliance.md).

**`POST /test-call`** → places a verification call and returns a live-updating result:
```json
{
  "test_call_id": "01927...",
  "status": "in_progress",
  "checks": {
    "forwarding_triggered": null,
    "ai_answered": null,
    "answer_time_ms": null,
    "caller_id_preserved": null,
    "audio_quality_ok": null,
    "kb_question_answered": null,
    "transfer_worked": null
  }
}
```

### 3.5 Knowledge base

```http
GET    /properties/{property_id}/knowledge-base
GET    /properties/{property_id}/knowledge-base/versions
POST   /properties/{property_id}/knowledge-base/publish
POST   /properties/{property_id}/knowledge-base/rollback

POST   /properties/{property_id}/kb/ingest            # URL or file -> draft
GET    /properties/{property_id}/kb/ingest/{job_id}
POST   /properties/{property_id}/kb/ingest/{job_id}/approve

GET    /properties/{property_id}/room-types
POST   /properties/{property_id}/room-types
PATCH  /properties/{property_id}/room-types/{id}
DELETE /properties/{property_id}/room-types/{id}

GET    /properties/{property_id}/room-types/{id}/tariffs
PUT    /properties/{property_id}/room-types/{id}/tariffs

GET    /properties/{property_id}/policies
PUT    /properties/{property_id}/policies

GET    /properties/{property_id}/faqs
POST   /properties/{property_id}/faqs
PATCH  /properties/{property_id}/faqs/{id}
DELETE /properties/{property_id}/faqs/{id}

GET    /properties/{property_id}/unanswered-questions
POST   /properties/{property_id}/unanswered-questions/{id}/answer

POST   /properties/{property_id}/kb/test-query         # "what would the agent say if asked X?"
```

**`POST /kb/test-query`** — lets an owner sanity-check the agent before going live:
```json
// request
{ "question": "Do you allow pets?", "language": "en-IN" }

// response
{
  "answer": "Yes, we welcome well-behaved pets in our garden cottages. There is a cleaning charge of ₹500 per stay.",
  "grounded": true,
  "sources": [{ "chunk_id": "01927...", "category": "policy", "excerpt": "Pets allowed in garden cottages..." }],
  "confidence": 0.93,
  "would_defer_to_human": false
}
```

**`PUT /policies`**
```json
{
  "policies": [
    { "key": "cancellation", "value_text": "Free cancellation up to 7 days before check-in. 50% charge within 7 days.", "is_ask_team": false },
    { "key": "pets",         "value_text": "Allowed in garden cottages, ₹500 cleaning charge.", "is_ask_team": false },
    { "key": "alcohol",      "value_text": "", "is_ask_team": true }
  ]
}
```

### 3.6 Calls

```http
GET    /calls?property_id=&from=&to=&intent=&language=&status=&has_lead=&q=
GET    /calls/{call_id}
GET    /calls/{call_id}/transcript
GET    /calls/{call_id}/recording          # 302 -> signed URL, 15-min TTL, access audited
GET    /calls/{call_id}/events
GET    /calls/live?property_id=            # SSE stream of in-progress calls
POST   /calls/{call_id}/flag               # mark for QA review
```

**`GET /calls/{id}` →**
```json
{
  "id": "01927...",
  "property_id": "01927...",
  "from_e164": "+919876543210",
  "to_e164": "+918045678901",
  "routing_mode": "conditional_forward",
  "started_at": "2026-09-13T18:42:11Z",
  "answered_at": "2026-09-13T18:42:14Z",
  "ended_at": "2026-09-13T18:44:38Z",
  "ring_to_answer_ms": 2840,
  "duration_seconds": 147,
  "status": "completed",
  "end_reason": "agent_ended",
  "language_detected": "hi-IN",
  "was_transferred": false,
  "contained": true,
  "analysis": {
    "intent_primary": "booking_enquiry",
    "intent_confidence": 0.96,
    "summary": "Guest from Bengaluru enquired about a 2-night stay 24-26 Dec for 2 adults and 1 child. Asked about pet policy and driving distance. Shared contact and consented to WhatsApp.",
    "sentiment": "positive",
    "extracted_slots": {
      "check_in_date": "2026-12-24",
      "check_out_date": "2026-12-26",
      "adults": 2, "children": 1,
      "room_type": "Garden Cottage",
      "occasion": "family"
    },
    "grounding_violations": 0,
    "quality_score": 0.91
  },
  "lead_id": "01927...",
  "latency": { "p50_ms": 810, "p95_ms": 1420 }
}
```

### 3.7 Leads

```http
GET    /leads?property_id=&status=&priority=&assigned_to=&from=&to=&q=
GET    /leads/{lead_id}
PATCH  /leads/{lead_id}
POST   /leads/{lead_id}/status
POST   /leads/{lead_id}/assign
POST   /leads/{lead_id}/notes
POST   /leads/{lead_id}/outcome
POST   /leads/{lead_id}/resend-whatsapp
GET    /leads/{lead_id}/activities
POST   /leads                                # manual lead creation
GET    /leads/export?format=csv
```

**`POST /leads/{id}/status`**
```json
{ "status": "contacted", "note": "Spoke to guest, sending quote for garden cottage." }
```
Invalid transitions return `409` with allowed next states.

**`POST /leads/{id}/outcome`**
```json
{
  "booked": true,
  "booking_reference": "CMR-2026-1183",
  "booking_value": 1450000,
  "currency": "INR",
  "nights": 2,
  "rooms": 1,
  "confirmed_at": "2026-09-13T20:05:00Z"
}
```
> `booking_value` in paise (₹14,500.00 = `1450000`).

### 3.8 Analytics & reporting

```http
GET /analytics/overview?property_id=&from=&to=
GET /analytics/calls?property_id=&group_by=day|hour|intent|language
GET /analytics/leads?property_id=&group_by=status|source|priority
GET /analytics/sla?property_id=
GET /analytics/roi?property_id=&from=&to=
GET /analytics/quality?property_id=
GET /reports/roi.pdf?property_id=&from=&to=
```

**`GET /analytics/roi` →**
```json
{
  "period": { "from": "2026-08-01", "to": "2026-08-31" },
  "calls_answered_by_ai": 94,
  "calls_that_would_have_been_missed": 94,
  "leads_captured": 71,
  "leads_contacted_within_sla": 59,
  "leads_won": 11,
  "attributed_booking_value": 10430000,
  "subscription_cost": 499900,
  "overage_cost": 42000,
  "roi_multiple": 19.2,
  "currency": "INR"
}
```

### 3.9 Users & team

```http
GET    /users
POST   /users/invite
PATCH  /users/{user_id}
DELETE /users/{user_id}
POST   /users/{user_id}/duty-status          # on/off duty for lead routing
GET    /me
PATCH  /me/notification-preferences
```

### 3.10 Billing

```http
GET    /billing/subscription
POST   /billing/subscription/change-plan
POST   /billing/subscription/cancel
GET    /billing/usage?period=current
GET    /billing/invoices
GET    /billing/invoices/{id}/pdf
POST   /billing/payment-method/setup-intent
GET    /billing/plans
```

**`GET /billing/usage` →**
```json
{
  "period": { "start": "2026-09-01", "end": "2026-09-30" },
  "properties": [
    {
      "property_id": "01927...",
      "ai_call_minutes": { "used": 412, "included": 500, "overage": 0 },
      "whatsapp_messages": { "used": 186, "included": 500, "overage": 0 },
      "calls_handled": 118
    }
  ],
  "estimated_bill": { "base": 499900, "overage": 0, "tax": 89982, "total": 589882, "currency": "INR" }
}
```

### 3.11 Integrations & outbound webhooks

```http
GET    /integrations
POST   /integrations
PATCH  /integrations/{id}
DELETE /integrations/{id}
POST   /integrations/{id}/test
POST   /integrations/{id}/sync

GET    /webhooks
POST   /webhooks
DELETE /webhooks/{id}
GET    /webhooks/{id}/deliveries
POST   /webhooks/{id}/deliveries/{delivery_id}/retry
```

### 3.12 Compliance

```http
POST   /privacy/data-requests           # access | correction | erasure
GET    /privacy/data-requests/{id}
GET    /privacy/export                  # full org export (async job)
DELETE /privacy/contacts/{phone_hash}   # erase a caller's data
```

---

## 4. Inbound webhooks (from telephony providers)

Endpoint: `POST /webhooks/telephony/{provider}`

**Security (all mandatory):**
1. HMAC-SHA256 signature verification (`X-Atithi-Signature` or provider header)
2. Timestamp within ±5 minutes (replay protection)
3. Source IP allowlist per provider
4. Idempotency on `provider_call_id` + `event_type`
5. Respond `200` within 2 s; do heavy work asynchronously

```json
{
  "provider": "exotel",
  "event": "call.incoming",
  "call_sid": "abc123",
  "from": "+919876543210",
  "to": "+918045678901",
  "direction": "inbound",
  "forwarded_from": "+919845012345",
  "timestamp": "2026-09-13T18:42:11Z"
}
```

**Response instructs call handling:**
```json
{
  "action": "connect_to_agent",
  "agent_session_url": "wss://rt.atithi.ai/session/01927...",
  "record": true,
  "max_duration_seconds": 420
}
```

Handled events: `call.incoming`, `call.answered`, `call.dtmf`, `call.transfer_completed`, `call.transfer_failed`, `call.completed`, `call.failed`, `recording.available`.

---

## 5. Outbound webhooks (to customers)

Subscribe to events; we POST a signed payload with retries (exponential backoff over 24 h, then dead-lettered).

| Event | Fires when |
|---|---|
| `call.completed` | AI call ends and analysis is ready |
| `lead.created` | New lead captured |
| `lead.status_changed` | Any status transition |
| `lead.sla_breached` | SLA window elapsed without contact |
| `booking.won` | Outcome recorded as booked |
| `kb.gap_detected` | New clustered unanswered question |

```json
{
  "id": "evt_01927...",
  "type": "lead.created",
  "created_at": "2026-09-13T18:44:45Z",
  "organization_id": "01927...",
  "property_id": "01927...",
  "data": {
    "lead_id": "01927...",
    "contact": { "name": "Ravi Kumar", "phone": "+919876543210", "whatsapp_consent": true },
    "check_in_date": "2026-12-24",
    "check_out_date": "2026-12-26",
    "adults": 2, "children": 1,
    "priority": "hot",
    "score": 87,
    "summary": "Family stay enquiry for Christmas week, asked about pets and distance.",
    "call_id": "01927..."
  }
}
```

**Headers:** `X-Atithi-Signature: t=<unix>,v1=<hmac_sha256>`, `X-Atithi-Event-Id`, `X-Atithi-Delivery-Attempt`.
Consumers must verify the signature and treat delivery as **at-least-once**.

---

## 6. Realtime agent session protocol (internal)

Between the telephony webhook handler and the voice agent worker (WebSocket, internal only, mTLS):

```
client -> server : { "type": "session.init", "call_id", "property_id", "from", "locale_hint" }
server -> client : { "type": "session.ready", "greeting_audio_url", "config": {...} }
client -> server : { "type": "audio.chunk", "seq", "pcm_base64" }
server -> client : { "type": "audio.chunk", "seq", "pcm_base64" }
server -> client : { "type": "agent.state", "state": "listening|thinking|speaking" }
server -> client : { "type": "transcript.partial" | "transcript.final", "speaker", "text" }
server -> client : { "type": "action.transfer", "to": "+91...", "whisper": "AI transfer - booking enquiry" }
server -> client : { "type": "action.hangup", "reason": "completed" }
client -> server : { "type": "dtmf", "digit": "1" }
client -> server : { "type": "session.end", "reason": "caller_hangup" }
```

---

## 7. Rate limits

| Consumer | Limit |
|---|---|
| Dashboard session | 600 req/min/user |
| API key (read) | 300 req/min/org |
| API key (write) | 60 req/min/org |
| `POST /leads` | 100/min/org |
| KB publish | 10/hour/property |
| Test call | 5/hour/property |
| Telephony webhooks | Not limited (allowlisted, but shed load gracefully) |

---

## 8. API design rules for this product

1. **Never block a live call on the control-plane API.** The realtime plane reads from Redis-cached context; a control-plane outage must not drop calls.
2. **Recording access is always audited** and served via short-TTL signed URLs — never a permanent public link.
3. **Cross-tenant access returns 403, not 404** — and raises a security alert.
4. **All monetary values are integers in paise.**
5. **Every mutating endpoint accepts `Idempotency-Key`** — telephony and notification retries are frequent.
6. **Pagination everywhere.** No unbounded list endpoints, ever.

---

**Next:** [09 — AI Agent Design](09-ai-agent-design.md)
