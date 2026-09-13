# 04 — Workflows

**Version:** 0.1 · **Date:** 2026-09-13

This document defines the operational flows of the product. Diagrams are Mermaid; render in VS Code with a Mermaid preview extension or on GitHub.

---

## 1. Master flow — end to end

```mermaid
flowchart TD
    A([Guest dials property number]) --> B{Front desk<br/>answers?}
    B -->|Yes, within 20s| C([Normal human call<br/>- optional: log only])
    B -->|No answer / busy /<br/>unreachable / after hours| D[Conditional forwarding<br/>to Atithi virtual number]
    D --> E[Telephony provider receives call<br/>-> webhook to Atithi]
    E --> F{Tenant resolved<br/>from called number?}
    F -->|No| G[Play generic message<br/>+ alert internal ops]
    F -->|Yes| H{Property active<br/>and within quota?}
    H -->|No| I[Play fallback message<br/>Capture number via DTMF]
    H -->|Yes| J[Load property context:<br/>KB, persona, voice, language set]
    J --> K[AI answers within 2 rings<br/>Greeting + AI disclosure<br/>+ recording consent notice]
    K --> L[Conversation loop<br/>ASR -> LLM+RAG -> TTS]
    L --> M{Intent<br/>classification}
    M -->|Booking enquiry| N[Qualify: dates, pax,<br/>room type, budget, occasion]
    M -->|Existing booking| O[Capture booking ref<br/>-> route to reservations]
    M -->|In-house guest /<br/>complaint / emergency| P[No sales flow<br/>-> immediate escalation]
    M -->|Vendor / job / spam| Q[Politely close<br/>Log, no lead]
    M -->|Wants a human| R[Transfer flow]
    N --> S[Capture contact:<br/>name, number readback,<br/>callback time, WA consent]
    O --> S
    P --> T{Human available<br/>now?}
    T -->|Yes| R
    T -->|No| S
    R --> U{Transfer<br/>succeeded?}
    U -->|Yes| V([Human handles call])
    U -->|No| S
    S --> W[Close call politely<br/>State callback promise]
    W --> X[Post-call pipeline]
    Q --> X
    V --> X
    X --> Y[Transcribe + diarise<br/>Summarise + score<br/>Detect PII + redact]
    Y --> Z[Create / merge Lead]
    Z --> AA[Notify staff:<br/>push + WhatsApp + SMS]
    Z --> AB{Guest consented<br/>to WhatsApp?}
    AB -->|Yes| AC[Send guest WhatsApp:<br/>brochure, tariff, staff contact]
    AB -->|No| AD[Skip guest messaging]
    AA --> AE[Start SLA timer]
    AE --> AF{Contacted<br/>within SLA?}
    AF -->|Yes| AG[Lead -> Contacted]
    AF -->|No| AH[Escalate to manager<br/>+ reassign]
    AH --> AG
    AG --> AI{Outcome}
    AI -->|Won| AJ[Record booking value<br/>-> ROI attribution]
    AI -->|Lost| AK[Record loss reason<br/>-> insights]
    AI -->|No response| AL[Auto follow-up nudge<br/>Phase 2]
```

---

## 2. Call routing — how the call actually reaches us

Three supported routing modes. See [Doc 10](10-telephony-and-india-compliance.md) for telco specifics.

```mermaid
flowchart LR
    subgraph M1["Mode A - Conditional Forwarding (recommended)"]
      A1[Guest dials existing<br/>property number] --> A2[Rings front desk]
      A2 -->|No answer 20s / busy /<br/>switched off| A3[Telco forwards to<br/>Atithi virtual number]
      A3 --> A4[AI answers]
    end
    subgraph M2["Mode B - Atithi Number First"]
      B1[Guest dials Atithi number<br/>published on Google/ads] --> B2[Atithi bridges to<br/>front desk first]
      B2 -->|No answer 20s| B3[AI takes over]
      B2 -->|Answered| B4[Human call<br/>+ call logged and recorded]
    end
    subgraph M3["Mode C - Always AI"]
      C1[Guest dials Atithi number] --> C2[AI answers every call<br/>After-hours / overflow line]
    end
```

| Mode | Pros | Cons | Use when |
|---|---|---|---|
| **A — Conditional forwarding** | Keeps the number already on Google/OTAs/boards; zero marketing change | Requires owner to set forwarding; no visibility into calls the desk *did* answer; telco quirks | Default for most properties |
| **B — Atithi number first** | Full call analytics incl. human-answered calls; no forwarding setup | Owner must update the listed number; porting/CLI considerations | Properties wanting analytics; new listings; ad campaigns |
| **C — Always AI** | Simplest; guaranteed instant answer | No human-first experience | Dedicated after-hours or overflow line; homestays with no desk |

> **Product decision:** support A and B at MVP. C is a config toggle of B.

---

## 3. In-call conversation state machine

```mermaid
stateDiagram-v2
    [*] --> Greeting
    Greeting --> LanguageDetect : caller speaks
    LanguageDetect --> Discovery : language locked
    Discovery --> IntentClassified : intent confidence > threshold
    Discovery --> Clarify : low confidence
    Clarify --> Discovery

    IntentClassified --> Qualify : booking_enquiry
    IntentClassified --> ExistingBooking : existing_booking
    IntentClassified --> Escalate : complaint / emergency / in_house
    IntentClassified --> PoliteClose : vendor / job / spam
    IntentClassified --> Transfer : wants_human

    Qualify --> AnswerQuestions : caller asks something
    AnswerQuestions --> Qualify
    Qualify --> CaptureContact : slots sufficient OR caller ready
    ExistingBooking --> CaptureContact

    CaptureContact --> ConfirmNumber
    ConfirmNumber --> CaptureContact : readback mismatch
    ConfirmNumber --> ConsentCapture : confirmed
    ConsentCapture --> ClosingPromise
    ClosingPromise --> [*]

    Escalate --> Transfer
    Transfer --> HumanConnected : answered
    Transfer --> CaptureContact : no answer / busy
    HumanConnected --> [*]
    PoliteClose --> [*]

    Discovery --> Fallback : ASR failure x3 / silence x2
    Qualify --> Fallback : ASR failure x3
    Fallback --> DTMFCapture
    DTMFCapture --> [*]

    AnswerQuestions --> OutOfScope : question not in KB
    OutOfScope --> Qualify : defer to human, continue
```

### State rules

| State | Max duration | Exit rule | Notes |
|---|---|---|---|
| Greeting | 8 s | Caller speaks or 3 s silence | Must include AI disclosure + recording notice |
| LanguageDetect | 2 turns | Confidence ≥ 0.7 | Default to property's primary language on failure |
| Discovery | 60 s | Intent classified | |
| Qualify | 120 s | Required slots or caller signals done | Never interrogate — max 2 questions per turn |
| AnswerQuestions | — | Returns to Qualify | Grounding guard always active |
| CaptureContact | 60 s | Name + number captured | Fall back to CLI if refused |
| ConfirmNumber | 2 attempts | Readback matched | Then accept CLI |
| Transfer | 25 s ring | Answered or timeout | Announce to human: "AI transfer, booking enquiry" |
| Fallback | 30 s | DTMF number captured | Always reachable |
| **Total call** | **7 min hard cap** | Graceful wrap-up at 6 min | Cost + quality control |

---

## 4. Post-call pipeline

```mermaid
sequenceDiagram
    participant T as Telephony
    participant O as Call Orchestrator
    participant Q as Job Queue
    participant W as Worker
    participant L as LLM
    participant DB as Postgres
    participant N as Notification Svc
    participant WA as WhatsApp API

    T->>O: call.ended (duration, recording URL, CLI)
    O->>DB: update call record (status=completed)
    O->>Q: enqueue post_call_processing
    Q->>W: dispatch
    W->>W: fetch recording + streamed transcript
    W->>W: PII detection + redaction pass
    W->>L: summarise + extract slots + score + sentiment
    L-->>W: structured JSON
    W->>DB: persist transcript, summary, entities
    W->>DB: create or merge Lead
    W->>Q: enqueue notify_staff, notify_guest
    Q->>N: notify_staff(lead)
    N->>WA: staff template message
    N->>N: mobile push + SMS fallback
    Q->>N: notify_guest(lead) [if consent]
    N->>WA: guest template (brochure, tariff, contact)
    W->>DB: start SLA timer (scheduled job)
    Note over DB: SLA breach job fires at T+window
```

**Idempotency:** every job keyed by `call_id` + `job_type`; retries are safe. Notification sends deduped by `(lead_id, channel, template)` within 10 minutes.

---

## 5. Lead lifecycle

```mermaid
stateDiagram-v2
    [*] --> New : created by post-call pipeline
    New --> Contacted : staff marks contacted
    New --> Attempted : staff called, unreachable
    New --> Escalated : SLA breached
    Escalated --> Contacted
    Attempted --> Contacted : reached on retry
    Attempted --> Lost : 3 failed attempts
    Contacted --> Quoted : quote/payment link sent
    Contacted --> Lost : not interested
    Quoted --> Won : booking confirmed + value recorded
    Quoted --> Lost : chose competitor / dropped
    Quoted --> Nurture : future dates
    Nurture --> Quoted : re-engaged
    Won --> [*]
    Lost --> [*]
```

### SLA & escalation policy (configurable per property)

| Condition | Default SLA | Escalation |
|---|---|---|
| Business hours, hot lead | 15 min | Manager alerted at breach; lead reassigned |
| Business hours, warm/cold | 60 min | Manager alerted at breach |
| After hours | By next business-hour start + 30 min | Owner alerted at breach |
| Complaint / in-house guest | 5 min | Duty manager + owner alerted immediately |

---

## 6. Escalation & human transfer

```mermaid
flowchart TD
    A[Escalation trigger] --> B{Trigger type}
    B -->|Caller asks for human| C[Acknowledge immediately]
    B -->|Complaint or emergency| C
    B -->|AI confidence low 3 turns| C
    B -->|Caller frustrated - sentiment| C
    C --> D{Within business hours<br/>and transfer number set?}
    D -->|No| E[Explain, capture details,<br/>promise callback with priority flag]
    D -->|Yes| F[Dial transfer target<br/>whisper: 'AI transfer - booking enquiry']
    F --> G{Answered<br/>within 25s?}
    G -->|Yes| H[Bridge caller to human<br/>AI drops off<br/>Recording continues if consented]
    G -->|No| I{Secondary target<br/>configured?}
    I -->|Yes| J[Try next in escalation chain]
    J --> G
    I -->|No| E
    E --> K[Lead flagged: transfer_failed<br/>Priority = High]
    H --> L[Log as transferred<br/>Containment = false]
```

**Escalation chain example:** Front desk → Reservations mobile → Duty manager → Owner. Max 2 hops, 25 s each, hard cap 60 s total before falling back to capture.

---

## 7. Knowledge base authoring & update

```mermaid
flowchart LR
    A[Owner provides source] --> B{Source type}
    B -->|Website URL| C[Crawl allowed pages]
    B -->|PDF brochure / tariff| D[Parse and OCR]
    B -->|Manual entry| E[Structured forms]
    C --> F[LLM extraction into<br/>structured KB schema]
    D --> F
    F --> G[Draft KB - status: pending_review]
    E --> G
    G --> H[Owner reviews field by field<br/>with source citation]
    H --> I{Approved?}
    I -->|No| J[Edit inline]
    J --> H
    I -->|Yes| K[Publish version N+1]
    K --> L[Chunk + embed -> vector store]
    L --> M[Cache invalidation<br/>live within 60s]
    M --> N[Smoke test: 10 canned<br/>questions answered correctly]
    N -->|Fail| O[Block publish, flag to Ops]
    N -->|Pass| P([KB live])
```

**Continuous improvement loop**

```mermaid
flowchart LR
    A[Calls] --> B[Unanswered / deferred<br/>questions logged]
    B --> C[Weekly clustering<br/>by similarity]
    C --> D[Top 10 gaps -> owner digest<br/>'Guests asked this 14 times']
    D --> E[One-tap: add answer]
    E --> F[KB updated]
    F --> A
```

> This loop is a **retention feature**: the agent visibly gets smarter about *their* property every week.

---

## 8. Onboarding workflow (ops + product)

```mermaid
sequenceDiagram
    actor Owner
    participant App as Atithi Web App
    participant KB as KB Service
    participant Tel as Telephony Service
    participant Ops as Atithi Ops

    Owner->>App: Sign up (phone OTP)
    App->>Owner: Create Org + Property
    Owner->>App: Property details, hours, contacts
    Owner->>App: Upload brochure / paste website
    App->>KB: Ingest + extract
    KB-->>Owner: Draft KB for review
    Owner->>KB: Edit + approve
    Owner->>App: Choose voice, languages, greeting
    App->>Tel: Provision virtual number (tenant-mapped)
    Tel-->>App: Number assigned
    App->>Owner: Telco-specific forwarding instructions (Jio/Airtel/Vi/BSNL)
    Owner->>Owner: Dials USSD forwarding codes
    Owner->>App: Click "Run test call"
    App->>Tel: Place test call to property number
    Tel->>Tel: Simulate no-answer -> forwards
    Tel->>App: Call lands on AI
    App-->>Owner: Live test transcript + pass/fail checks
    alt Test fails
        App->>Ops: Auto-create onboarding ticket
        Ops->>Owner: WhatsApp assisted setup
    else Test passes
        Owner->>App: Invite staff, set SLA + escalation chain
        App->>Owner: Activate agent, start 14-day trial
    end
```

---

## 9. Billing & metering workflow

```mermaid
flowchart LR
    A[Call ends] --> B[Compute billable minutes<br/>ceil to 6s increments]
    B --> C[Write usage_event<br/>idempotent by call_id]
    C --> D[Aggregate per property<br/>per billing period]
    D --> E{Within plan<br/>allowance?}
    E -->|Yes| F[No extra charge]
    E -->|No| G[Accrue overage]
    G --> H{Soft cap<br/>reached?}
    H -->|Yes| I[Notify owner<br/>80% / 100% / 150%]
    H -->|Hard cap| J[Degrade: capture-only mode<br/>short call, no long Q&A]
    D --> K[Month end: invoice via Razorpay<br/>base + overage + GST]
    K --> L{Payment<br/>successful?}
    L -->|Yes| M[Receipt + continue]
    L -->|No| N[Dunning: D+1, D+3, D+7<br/>then suspend AI, keep dashboard]
```

**Never hard-stop silently.** If a tenant hits a hard cap or fails payment, the AI still answers with a short "capture your number" flow — losing a guest's call must never be the failure mode.

---

## 10. Incident / degradation workflow

```mermaid
flowchart TD
    A[Health monitors] --> B{Component failing}
    B -->|ASR vendor| C[Failover to secondary ASR]
    B -->|LLM vendor| D[Failover to secondary LLM<br/>reduced feature set]
    B -->|TTS vendor| E[Failover to secondary TTS<br/>or cached phrases]
    B -->|Telephony| F[Failover to secondary carrier<br/>DID re-route]
    B -->|Full pipeline| G[Emergency capture-only IVR]
    C --> H[Alert on-call + status page]
    D --> H
    E --> H
    F --> H
    G --> H
    H --> I[Post-incident: affected calls<br/>flagged, tenants notified,<br/>leads reprocessed if possible]
```

**Degradation ladder (worst case last):**
1. Full conversational AI
2. AI with reduced KB (cached answers only)
3. Scripted short capture: greeting → "please share your name and number" → confirm → end
4. DTMF capture: "press 1 to leave your number"
5. Voicemail + immediate staff alert with recording

---

## 11. Data lifecycle workflow

```mermaid
flowchart LR
    A[Call audio + transcript] --> B[Encrypted at rest<br/>tenant-scoped keys]
    B --> C[PII detection + redaction<br/>in derived artefacts]
    C --> D{Retention policy<br/>per tenant}
    D -->|Recording default 90d| E[Auto-delete audio]
    D -->|Transcript default 12m| F[Auto-delete transcript]
    D -->|Lead/CRM data| G[Retain while account active]
    G --> H{Deletion request<br/>DPDP}
    H --> I[Verify identity]
    I --> J[Delete within 30 days<br/>across primary, backups, vector store]
    J --> K[Deletion certificate<br/>+ audit entry]
```

---

**Next:** [05 — System Architecture](05-system-architecture.md)
