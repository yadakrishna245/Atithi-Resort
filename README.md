<div align="center">

# 🏨 Atithi

### *One-stop verified stays for India*

**Verified stays · Honest prices · Someone always answers**

<br/>

![AWS](https://img.shields.io/badge/AWS-Serverless-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)
![React](https://img.shields.io/badge/React_18-Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![CDK](https://img.shields.io/badge/AWS_CDK-v2-232F3E?style=for-the-badge&logo=amazonaws&logoColor=FF9900)
![DynamoDB](https://img.shields.io/badge/DynamoDB-Single_Table-4053D6?style=for-the-badge&logo=amazondynamodb&logoColor=white)

![Deploy](https://img.shields.io/badge/deploy-one--click-brightgreen?style=flat-square)
![Region](https://img.shields.io/badge/region-ap--south--1-orange?style=flat-square)
![Tests](https://img.shields.io/badge/guard_tests-34%2F34_passing-success?style=flat-square)
![Languages](https://img.shields.io/badge/languages-10_Indian-blueviolet?style=flat-square)

<br/>

*A full-stack, AWS-serverless hospitality platform. Guests book verified properties with the*
*total price shown upfront — and properties never lose a booking to an unanswered phone call.*

</div>

---

## 📖 Table of contents

- [Why this exists](#-why-this-exists)
- [The two products](#-the-two-products)
- [One-click deploy](#-one-click-deploy)
- [Deployment workflow (detailed)](#-deployment-workflow-detailed)
- [Contributor git workflow](#-contributor-git-workflow)
- [Architecture](#-architecture)
- [The two guarantees, enforced in code](#-the-two-guarantees-enforced-in-code)
- [What we do differently](#-what-we-do-that-the-big-otas-dont)
- [Repository layout](#-repository-layout)
- [Honest status](#-honest-status)
- [Documentation index](#-documentation-index)

---

## 💡 Why this exists

> A real incident. The reason the whole company exists.

```mermaid
flowchart LR
    A["🧳 Traveller finds<br/>a resort on Google"]:::guest --> B["📞 Calls to book"]:::guest
    B --> C{"Front desk<br/>answers?"}:::decision
    C -->|"❌ No — busy / after hours"| D["📞 Calls again…<br/>still nothing"]:::bad
    D --> E["🏃 Books a<br/>COMPETITOR"]:::bad
    E --> F["💸 Resort calls back hours later —<br/>revenue gone, permanently"]:::lost
    C -->|"✅ With Atithi"| G["🤖 AI answers · captures lead ·<br/>alerts staff in 60s"]:::good
    G --> H["🎉 Booking saved"]:::good

    classDef guest fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#1e3a8a;
    classDef decision fill:#fef9c3,stroke:#ca8a04,stroke-width:2px,color:#713f12;
    classDef bad fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#7f1d1d;
    classDef lost fill:#fecaca,stroke:#b91c1c,stroke-width:3px,color:#7f1d1d;
    classDef good fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d;
```

That single incident produced **two products**, both in this repo.

---

## 🎯 The two products

```mermaid
flowchart TB
    subgraph P1["🏨 Direct Booking Platform — ✅ BUILT & DEPLOYED"]
        direction LR
        S["🔍 Verified search<br/>10 languages"]:::built
        PR["💰 Upfront total price<br/>zero drip fees"]:::built
        BK["📅 Atomic booking<br/>no overbooking"]:::built
        RV["⭐ Verified-stay<br/>reviews only"]:::built
        S --> PR --> BK --> RV
    end
    subgraph P2["📞 AI Receptionist — 📄 DESIGNED, PHASE 2"]
        direction LR
        CALL["☎️ Answers missed calls"]:::planned
        LEAD["📝 Captures lead"]:::planned
        SLA["⏱️ SLA + escalation"]:::planned
        CALL --> LEAD --> SLA
    end

    classDef built fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d;
    classDef planned fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#4c1d95;
    style P1 fill:#f0fdf4,stroke:#16a34a,stroke-width:2px,color:#14532d
    style P2 fill:#faf5ff,stroke:#7c3aed,stroke-width:2px,color:#4c1d95
```

---

## 🚀 One-click deploy

Deploy the **entire stack** — infra, backend, frontend, S3 + CloudFront — to a fresh AWS
account in three steps. No manual console clicking.

```bash
# 1️⃣  Authenticate (once per machine)
aws configure

# 2️⃣  Clone
git clone https://github.com/yadakrishna245/Atithi-Resort.git
cd Atithi-Resort

# 3️⃣  Deploy — the script does everything else
./deploy.sh          # Linux · macOS · Git-Bash · WSL
```

<details>
<summary><b>🪟 Windows PowerShell</b></summary>

```powershell
aws configure
git clone https://github.com/yadakrishna245/Atithi-Resort.git
cd Atithi-Resort
./deploy.ps1
```
</details>

<details>
<summary><b>⚙️ Region &amp; stage overrides</b></summary>

Defaults to `ap-south-1` (India data residency). Override per run:

```bash
AWS_REGION=us-east-1 STAGE=prod ./deploy.sh
```
```powershell
./deploy.ps1 -Region us-east-1 -Stage prod
```
</details>

At the end the script prints your **live CloudFront URL**. That's it.

---

## 🔄 Deployment workflow (detailed)

Exactly what `deploy.sh` / `deploy.ps1` do, in order. Each box is a real step in the script.

```mermaid
flowchart TD
    START(["▶️ ./deploy.sh"]):::start --> CHK["🔍 Verify node · npm · aws<br/>on PATH"]:::check
    CHK --> ID["🪪 aws sts get-caller-identity<br/>→ resolve Account ID"]:::check
    ID --> PIN["📌 Pin region<br/>AWS_REGION · CDK_DEFAULT_*<br/>(default ap-south-1)"]:::check
    PIN --> INS["📦 npm install<br/>(workspaces)"]:::build
    INS --> BLD["🔨 Build shared → backend → infra<br/>(tsc + esbuild)"]:::build

    BLD --> BOOT{"🥾 CDKToolkit<br/>stack exists?"}:::decision
    BOOT -->|"no"| DOBOOT["cdk bootstrap<br/>aws://ACCOUNT/REGION"]:::build
    BOOT -->|"yes"| SKIP["skip bootstrap"]:::build
    DOBOOT --> DEP1
    SKIP --> DEP1

    DEP1["☁️ cdk deploy AtithiPlatform-dev<br/>DynamoDB · Cognito · 25 Lambda · API GW<br/>→ platform-outputs.json"]:::aws
    DEP1 --> ENV["🧬 Generate frontend/.env.production<br/>from live API + Cognito outputs"]:::wire
    ENV --> BLD2["🔨 npm run build -w frontend<br/>(Vite bakes live API into bundle)"]:::build
    BLD2 --> DEP2["☁️ cdk deploy AtithiWeb-dev<br/>S3 (private) + CloudFront + OAC<br/>→ web-outputs.json"]:::aws
    DEP2 --> URL(["🌐 Prints CloudFront URL<br/>✅ Atithi is live"]):::done

    classDef start fill:#e0f2fe,stroke:#0284c7,stroke-width:2px,color:#075985;
    classDef check fill:#fef9c3,stroke:#ca8a04,stroke-width:1.5px,color:#713f12;
    classDef build fill:#f1f5f9,stroke:#475569,stroke-width:1.5px,color:#1e293b;
    classDef decision fill:#ffedd5,stroke:#ea580c,stroke-width:2px,color:#7c2d12;
    classDef aws fill:#fff7ed,stroke:#f59e0b,stroke-width:2.5px,color:#78350f;
    classDef wire fill:#ede9fe,stroke:#7c3aed,stroke-width:1.5px,color:#4c1d95;
    classDef done fill:#dcfce7,stroke:#16a34a,stroke-width:3px,color:#14532d;
```

> **Why the script pins the region itself:** the AWS CDK CLI resolves the deploy region from
> `AWS_REGION` / `AWS_DEFAULT_REGION`, *not* from `CDK_DEFAULT_REGION`. The script sets all of
> them so a deploy lands in the same place on every machine, regardless of local CLI config.

---

## 🌿 Contributor git workflow

How changes flow from a local edit to the deployed CloudFront distribution.

```mermaid
gitGraph
    commit id: "main"
    branch feature
    checkout feature
    commit id: "code + guard test"
    commit id: "npm test -w backend ✅"
    checkout main
    merge feature tag: "PR reviewed"
    commit id: "./deploy.sh" type: HIGHLIGHT
    commit id: "🌐 CloudFront live"
```

```mermaid
sequenceDiagram
    autonumber
    participant Dev as 👩‍💻 Developer
    participant Git as 🌿 Git / GitHub
    participant CDK as ☁️ AWS CDK
    participant AWS as 🟧 AWS (ap-south-1)
    participant CF as 🌐 CloudFront

    Dev->>Git: git clone + branch
    Dev->>Dev: edit code · npm test -w backend (34/34)
    Dev->>Git: commit + push · open PR
    Git-->>Dev: review & merge to main
    Dev->>CDK: ./deploy.sh
    CDK->>AWS: deploy AtithiPlatform-dev (data/API/auth)
    AWS-->>CDK: ApiUrl · UserPoolId · ClientId
    CDK->>CDK: write frontend/.env.production · vite build
    CDK->>AWS: deploy AtithiWeb-dev (S3 + CloudFront)
    AWS->>CF: publish distribution
    CF-->>Dev: 🌐 https://<id>.cloudfront.net
```

---

## 🏗️ Architecture

```mermaid
flowchart LR
    U(["👤 Guest / Partner"]):::user

    subgraph EDGE["🌐 Edge"]
        CF["CloudFront<br/>+ security headers"]:::edge
        S3[("S3 · private<br/>static site")]:::edge
    end
    subgraph AUTH["🔐 Identity"]
        COG["Cognito<br/>phone OTP · 5 groups"]:::auth
    end
    subgraph APP["⚙️ Application"]
        API["API Gateway HTTP API<br/>JWT authorizer"]:::app
        L["Lambda · ARM64<br/>25 functions"]:::app
    end
    subgraph DATA["💾 Data & AI"]
        DDB[("DynamoDB<br/>single table · on-demand")]:::data
        AI["Bedrock / OpenAI<br/>grounded only"]:::ai
    end

    U --> CF --> S3
    U --> COG
    U --> API --> L
    L --> DDB
    L --> AI

    classDef user fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#1e3a8a;
    classDef edge fill:#fff7ed,stroke:#f59e0b,stroke-width:2px,color:#78350f;
    classDef auth fill:#fce7f3,stroke:#db2777,stroke-width:2px,color:#831843;
    classDef app fill:#ecfeff,stroke:#0891b2,stroke-width:2px,color:#164e63;
    classDef data fill:#eef2ff,stroke:#4f46e5,stroke-width:2px,color:#312e81;
    classDef ai fill:#f0fdf4,stroke:#16a34a,stroke-width:2px,color:#14532d;
    style EDGE fill:#fffbeb,stroke:#f59e0b,color:#78350f
    style AUTH fill:#fdf2f8,stroke:#db2777,color:#831843
    style APP fill:#f0fdff,stroke:#0891b2,color:#164e63
    style DATA fill:#f5f3ff,stroke:#4f46e5,color:#312e81
```

> **No VPC, no NAT Gateway, no always-on compute, no search cluster.**
> Roughly **₹1,250/month at launch**, and under **₹1 per booking** in infrastructure at scale.

---

## 🛡️ The two guarantees, enforced in code

### 1. One customer never sees another's data — 5 independent layers

```mermaid
flowchart LR
    R(["🌐 Request"]):::req --> L1["1 · Cognito verifies JWT<br/>before our code runs"]:::layer
    L1 --> L2["2 · Identity from token claims only<br/>never body/query/path"]:::layer
    L2 --> L3["3 · orgScope rejects any org<br/>absent from the token"]:::layer
    L3 --> L4["4 · DynamoDB partition key<br/>IS the tenant boundary"]:::layer
    L4 --> L5["5 · Row-level assertOwnership<br/>on every result"]:::layer
    L5 --> OK(["✅ Data returned"]):::ok
    L1 -.->|fail| DENY(["⛔ 403 + security log"]):::deny
    L2 -.->|fail| DENY
    L3 -.->|fail| DENY
    L4 -.->|fail| DENY
    L5 -.->|fail| DENY

    classDef req fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#1e3a8a;
    classDef layer fill:#e0f2fe,stroke:#0369a1,stroke-width:1.5px,color:#0c4a6e;
    classDef ok fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d;
    classDef deny fill:#fee2e2,stroke:#dc2626,stroke-width:2.5px,color:#7f1d1d;
```

Proven by 20 tests in [`tenantIsolation.test.ts`](backend/src/__tests__/tenantIsolation.test.ts).
Cross-tenant attempts return **403, not 404**, and raise a security log event.

| Layer | Where |
|---|---|
| Cognito verifies the JWT before our code runs | [platform-stack.ts](infrastructure/lib/platform-stack.ts) |
| Identity comes from token claims only | [auth.ts](backend/src/lib/auth.ts) |
| `orgScope` rejects any org absent from the token | [auth.ts](backend/src/lib/auth.ts) |
| The DynamoDB partition key **is** the tenant boundary | [dynamo.ts](backend/src/lib/dynamo.ts) |
| Row-level `assertOwnership` re-check on every result | [auth.ts](backend/src/lib/auth.ts) |

### 2. No fake or hallucinated data

| Mechanism | Where |
|---|---|
| Zero seed data — only ops-verified listings are searchable | [propertyRepository.ts](backend/src/repositories/propertyRepository.ts) |
| Availability read from real inventory rows; a missing date is never assumed available | [inventoryRepository.ts](backend/src/repositories/inventoryRepository.ts) |
| The AI gets a closed fact sheet built only from verified stored fields | [groundedAssistant.ts](backend/src/ai/groundedAssistant.ts) |
| A **deterministic scanner** rejects any answer with a price/availability claim absent from the facts — plain code, survives prompt injection | [groundedAssistant.ts](backend/src/ai/groundedAssistant.ts) |
| The search parser can only resolve cities that exist in our inventory | [searchParser.ts](backend/src/ai/searchParser.ts) |
| Reviews require a completed booking owned by the reviewer | [reviewRepository.ts](backend/src/repositories/reviewRepository.ts) |

Proven by 15 tests in [`grounding.test.ts`](backend/src/__tests__/grounding.test.ts).

---

## 🆚 What we do that the big OTAs don't

Full analysis with code references: **[docs/19 — What We Do Differently](docs/19-what-we-do-differently.md)**

| # | Gap in MakeMyTrip / Agoda / OYO / Goibibo / Cleartrip / Booking.com | Our answer |
|---|---|---|
| 1 | Price grows between search and payment | One shared pricing function; **zero** convenience fee; server rejects the booking if the total drifted |
| 2 | "Confirmed" online, no room on arrival | Real per-date inventory; booking + decrement in one atomic transaction |
| 3 | Turned away over "couples / local ID not allowed" | Both are **mandatory** policy fields and first-class filters |
| 4 | Fake reviews | A review is impossible without a completed booking you own |
| 5 | Misleading photos | Per-photo verification flag; minimum verified count before publishing |
| 6 | Can't reach the property | Phone shown prominently — plus the AI receptionist behind it |
| 7 | English-only | 10 Indian languages end to end, including natural-language search |
| 8 | Pay-to-win ranking | Readable ranking with **no** paid-placement term; every card shows why it matched |
| 9 | Guest details demanded at reception | Captured at checkout (we store ID *type* only, never the number) |
| 10 | Forced prepayment, vague refunds | Pay-at-property supported; exact refund and deadline shown |
| 11 | Your data is the product | Per-purpose consent, DPDP export/erasure, PII masked in logs, data stays in India |

**Deliberately not copied:** fake urgency counters, "23 people viewing", countdown timers, pre-ticked add-ons, disguised sponsored results, hidden phone numbers, padded ratings for new listings.

---

## 📂 Repository layout

```
Atithi-Resort/
├── 🚀 deploy.sh / deploy.ps1   # one-click deploy (this is the magic button)
├── 📁 docs/                    # 20 product & engineering documents
├── 📦 packages/shared/         # Domain types, Zod schemas, pricing engine (FE ↔ BE)
├── ⚙️  backend/                 # Lambda handlers, repositories, services, AI grounding
├── 🎨 frontend/                # React 18 + Vite SPA, 10 Indian languages
├── ☁️  infrastructure/          # AWS CDK — DynamoDB, Cognito, Lambda, API GW, S3, CloudFront
└── 🧠 project-memory/          # AI-assistant context (not part of the app)
```

### Quick start (local dev)

```bash
npm install
npm test -w backend      # prove tenant isolation + AI grounding first (34/34)
npm run dev:web          # run the app locally at http://localhost:5173
```

---

## 📊 Honest status

```mermaid
pie showData
    title Feature completeness
    "Built & deployed" : 60
    "Designed, not built (Phase 2)" : 40
```

**✅ Built and working:** verified-property search (structured + natural language in 10 languages),
real availability, transparent pricing, atomic booking with overbooking protection, cancellation
with exact refund calculation, verified-stay reviews, grounded AI Q&A, guest profile with DPDP
export/erasure, partner dashboard, full CDK infrastructure, **34 passing guard tests**.

**🚧 Not yet built:** Razorpay payments, photo upload + ops verification console, WhatsApp
notifications, telephony for the AI receptionist, partner onboarding wizard, map/radius search.
Tracked in [docs/18 §6](docs/18-aws-serverless-architecture-and-cost.md).

**⚠️ Before going live:** close the five critical questions in
[docs/16 §3.1](docs/16-open-questions-and-decisions.md), and have a lawyer review the telephony
architecture and DPDP position. Two values are flagged for professional verification: the **GST
slabs** in [constants.ts](packages/shared/src/constants.ts) and the **carrier USSD forwarding
codes** in [docs/10](docs/10-telephony-and-india-compliance.md).

---

## 📚 Documentation index

| # | Document | What's inside |
|---|----------|---------------|
| 01 | [Product Vision & Problem](docs/01-product-vision-and-problem.md) | Problem, market, vision, principles |
| 02 | [PRD](docs/02-prd.md) | Goals, scope, requirements, user stories, metrics |
| 03 | [Personas & User Journeys](docs/03-personas-and-user-journeys.md) | Who we serve, end-to-end journeys |
| 04 | [Workflows](docs/04-workflows.md) | Call flows, lead lifecycle, escalation |
| 05 | [System Architecture](docs/05-system-architecture.md) | Components, voice pipeline, deployment |
| 06 | [Tech Stack](docs/06-tech-stack.md) | Technology choices + rationale |
| 07 | [Data Model](docs/07-data-model.md) | Entities, ERD, multi-tenancy, retention |
| 08 | [API Specification](docs/08-api-spec.md) | REST endpoints, webhooks, auth model |
| 09 | [AI Agent Design](docs/09-ai-agent-design.md) | Prompts, RAG, guardrails, evaluation |
| 10 | [Telephony & India Compliance](docs/10-telephony-and-india-compliance.md) | Forwarding, TRAI/DoT/DLT |
| 11 | [Security, Privacy & DPDP](docs/11-security-privacy-dpdp.md) | Threat model, DPDP Act 2023 |
| 12 | [NFRs & SLAs](docs/12-nfrs-and-slas.md) | Latency, availability, scale, cost |
| 13 | [Roadmap & MVP Scope](docs/13-roadmap-and-mvp-scope.md) | Phased plan, MVP cut line |
| 14 | [Pricing & GTM](docs/14-pricing-and-gtm.md) | Packaging, unit economics |
| 15 | [Testing & QA](docs/15-testing-and-qa.md) | Test strategy for a voice AI product |
| 16 | [Open Questions & Decisions](docs/16-open-questions-and-decisions.md) | Decision log |
| 17 | [Glossary](docs/17-glossary.md) | Domain and technical terms |
| 18 | [AWS Architecture & Cost](docs/18-aws-serverless-architecture-and-cost.md) | Serverless design, cost, deploy steps |
| 19 | [What We Do Differently](docs/19-what-we-do-differently.md) | OTA gap analysis mapped to code |

**Suggested reading order** — New here: `01 → 02 → 19 → 05 → 18` · Running it: `18 → 08 → 07` ·
Building the receptionist: `13 → 10 → 09` · Selling it: `01 → 19 → 14 → 03`.

---

<div align="center">

**Atithi** — because a guest who can't reach you books someone else.

*All documents are v0.1 drafts (2026-09-13). The booking platform is implemented; the AI
receptionist is documented but not yet wired to telephony.*

</div>
