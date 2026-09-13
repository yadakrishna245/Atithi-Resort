# 12 — Non-Functional Requirements & SLAs

**Version:** 0.1 · **Date:** 2026-09-13

---

## 1. Performance

### 1.1 Call answering

| Metric | Target | Hard limit | Why |
|---|---|---|---|
| Ring → AI answers | p50 ≤ 3 s, p95 ≤ 6 s | 8 s | Beyond 2 rings, callers assume no one is there |
| Webhook → session ready | p95 ≤ 400 ms | 1 s | Part of answer time |
| Greeting audio start | ≤ 200 ms after answer | 500 ms | Silence after pickup feels broken — greeting is pre-synthesised |

### 1.2 Conversational latency (the critical metric)

End of caller speech → first byte of agent audio:

| Percentile | Target | Degraded | Unacceptable |
|---|---|---|---|
| p50 | ≤ 900 ms | 900–1,300 ms | > 1,300 ms |
| p90 | ≤ 1,400 ms | 1,400–2,000 ms | > 2,000 ms |
| p95 | ≤ 1,600 ms | 1,600–2,500 ms | > 2,500 ms |
| p99 | ≤ 2,500 ms | — | > 3,000 ms |

**Component budget (p50 / p95):**

| Stage | p50 | p95 |
|---|---|---|
| Turn detection / endpointing | 120 ms | 250 ms |
| ASR finalisation | 150 ms | 300 ms |
| Retrieval (parallelised) | 0 ms | 80 ms |
| LLM time-to-first-token | 350 ms | 650 ms |
| Guardrail (first sentence) | 10 ms | 30 ms |
| TTS time-to-first-byte | 150 ms | 250 ms |
| Media/network | 60 ms | 120 ms |
| **Total** | **840 ms** | **1,680 ms** |

**Mitigation when exceeded:** filler audio at 700 ms, model downgrade at sustained breach, alert on-call at p95 > 2 s for 5 minutes.

### 1.3 Barge-in

| Metric | Target |
|---|---|
| Detect caller interruption | ≤ 200 ms |
| Stop agent audio after detection | ≤ 100 ms |
| **Total interruption response** | **≤ 300 ms** |

### 1.4 Post-call processing

| Stage | Target |
|---|---|
| Call record finalised | ≤ 5 s after hang-up |
| Transcript + summary + analysis | p95 ≤ 30 s |
| Lead created and visible | p95 ≤ 45 s |
| Staff notification delivered | p95 ≤ 60 s |
| Guest WhatsApp delivered | p95 ≤ 90 s |

> **Rationale:** the lead must reach staff while the guest is still thinking about the property. Anything beyond ~2 minutes erodes the product's core advantage.

### 1.5 Application performance

| Surface | Target |
|---|---|
| Dashboard initial load (LCP) | p75 ≤ 2.0 s |
| Lead board interaction (INP) | p75 ≤ 200 ms |
| API read p95 | ≤ 300 ms |
| API write p95 | ≤ 500 ms |
| Analytics query p95 (12 months) | ≤ 2 s |
| KB publish → live on calls | ≤ 60 s |
| Transcript search p95 | ≤ 1 s |

---

## 2. Availability & reliability

### 2.1 Service level objectives

| Component | SLO | Notes |
|---|---|---|
| **Call answering (critical path)** | **99.95%** | ~22 min/month downtime budget. This is the product. |
| Control-plane API | 99.9% | Dashboard degradation is survivable |
| Dashboard | 99.5% | |
| Notification delivery | 99.9% within SLA window | |
| Async processing | 99.9% within 5 min | |
| Data durability | 99.999999999% | Object storage guarantee |

### 2.2 Customer-facing SLA (contractual)

| Tier | Uptime commitment | Credit |
|---|---|---|
| Starter | 99.5% | 10% monthly fee below 99.5% |
| Growth | 99.9% | 10% below 99.9%, 25% below 99.0% |
| Scale/Enterprise | 99.9% + support SLA | 25% below 99.9%, 50% below 99.0% |

**Excluded:** scheduled maintenance (announced 72 h ahead, low-traffic window 02:00–04:00 IST), upstream carrier outages, customer-side forwarding misconfiguration, force majeure.

### 2.3 Error budgets

| Service | Monthly error budget | Policy on exhaustion |
|---|---|---|
| Call answering | 0.05% (~22 min) | **Feature freeze**; reliability work only until restored |
| API | 0.1% | Reliability work prioritised in next sprint |

### 2.4 Recovery objectives

| Scenario | RTO | RPO |
|---|---|---|
| Single service/pod failure | < 30 s (auto) | 0 |
| AZ failure | < 5 min | < 1 min |
| Database failure | < 10 min (failover) | < 5 min |
| Region failure | < 4 h (documented manual DR) | < 15 min |
| Telephony provider outage | < 15 min (DID re-route) | N/A |
| Accidental data deletion | < 2 h (PITR restore) | < 5 min |

**Critical rule:** an in-flight call cannot be recovered. Therefore **deployments to the realtime plane are drain-and-replace** — never restart a pod with active calls.

---

## 3. Scalability

### 3.1 Capacity targets

| Milestone | Properties | Calls/month | Peak concurrent calls | Notes |
|---|---|---|---|---|
| MVP (M1) | 15 | 2,000 | 10 | Design partners |
| Launch (M2) | 100 | 15,000 | 40 | |
| Year 1 | 250 | 40,000 | 100 | |
| Year 2 | 1,500 | 250,000 | 500 | Architecture must hold |
| Year 3 | 5,000 | 900,000 | 1,800 | May need sharding/regionalisation |

### 3.2 Peak load characteristics

Indian hospitality call patterns are **highly peaked** — plan for bursts, not averages:

| Pattern | Multiplier vs average |
|---|---|
| Daily peak (10 AM–12 PM, 5 PM–8 PM IST) | 3× |
| Weekend (Fri evening–Sun) | 2× |
| Long weekends / festivals | 4× |
| Dec 20–Jan 5 | 5× |
| **Design headroom** | **6× average** |

### 3.3 Scaling rules

| Tier | Signal | Rule |
|---|---|---|
| Realtime agent pods | Active calls | Scale out at 60% capacity; **maintain 20% warm headroom at all times**; pre-scale on calendar (peaks, festivals) |
| Media servers | Concurrent sessions | Node pool with UDP ingress; scale ahead of demand, never reactively |
| API pods | CPU 60% / RPS | Standard HPA |
| Workers | Queue depth > 100 or oldest job > 60 s | Scale to keep post-call pipeline under 45 s |
| Postgres | Connections, IOPS | PgBouncer; read replica for analytics; vertical scaling first, partitioning of `calls`/`call_events` by month at ~50M rows |

### 3.4 Known scaling limits to monitor

| Limit | Threshold to act |
|---|---|
| Telephony provider concurrency cap | Request increases at 60% of cap |
| LLM/ASR/TTS vendor rate limits | Multi-account or multi-vendor sharding at 70% |
| Postgres connection count | PgBouncer at 200 client connections |
| `calls` table size | Partition at 50M rows |
| pgvector index size | Per-property KBs are small; monitor at 5M chunks total |
| Redis memory | Alert at 70% |

---

## 4. Cost budget

### 4.1 Per-call unit economics (target)

| Component | Target ₹/4-min call | Ceiling |
|---|---|---|
| Telephony | 1.50 | 3.00 |
| ASR | 1.50 | 3.00 |
| LLM (with prompt caching) | 1.00 | 2.50 |
| TTS | 1.50 | 4.00 |
| Infrastructure (amortised) | 0.50 | 1.00 |
| **Total COGS** | **₹6.00** | **₹13.50** |

### 4.2 Margin targets

| Metric | Target |
|---|---|
| Gross margin per account | ≥ 65% (Year 1) → ≥ 75% (Year 2) |
| COGS as % of revenue | ≤ 35% |
| Infra cost per property/month | ≤ ₹200 |

### 4.3 Cost controls (build these into the product, not spreadsheets)

- **Per-tenant spend caps** with soft (notify) and hard (degrade to capture-only) thresholds
- **Max call duration** (7 min default) — enforced in the agent
- **Model cascade** — cheap model default, escalate only on low confidence
- **Prompt caching** for static prompt layers — the single biggest LLM cost lever
- **Retrieval caching** for repeated questions
- **Cheaper TTS** for lower-tier plans or non-primary languages
- **Anomaly detection** on per-tenant cost — a single abusive caller must not burn ₹50,000
- **Real-time cost attribution** per call, stored in `calls.cost_breakdown` — you cannot optimise what you do not measure

---

## 5. Quality NFRs

| Metric | Target | Measurement |
|---|---|---|
| ASR word error rate — Indian English | ≤ 12% | Weekly on sampled real calls |
| ASR WER — Hindi | ≤ 15% | Weekly |
| ASR WER — regional (Tier 2) | ≤ 20% | Per-language gate |
| Intent classification macro-F1 | ≥ 0.90 | Eval set in CI |
| Factual accuracy on KB-covered questions | ≥ 95% | Monthly human audit, 200 calls |
| **Grounding violations (fabricated price/availability)** | **0** | Automated guard + 100% audit of flagged calls |
| Out-of-scope correctly deferred | ≥ 95% | Eval set |
| Language detection accuracy | ≥ 95% | Eval set |
| Caller hang-up within 15 s | ≤ 10% | Production metric |
| Containment (no transfer needed) | ≥ 75% | Production metric |
| Transfer success rate | ≥ 98% | Production metric |
| Lead capture rate | ≥ 70% | Production metric |
| Audio quality (MOS proxy) | ≥ 4.0 | Sampled |

---

## 6. Usability & accessibility

| Requirement | Target |
|---|---|
| Onboarding completion (owner effort) | Median ≤ 30 min |
| Onboarding completion rate | ≥ 70% of signups reach a successful test call |
| Staff time to work a lead | ≤ 3 taps from notification to dialling |
| Dashboard usable on a 5-inch Android screen | Full parity for lead workflows |
| Works on 3G/patchy connectivity | Dashboard usable at 400 kbps; PWA offline shell |
| WCAG 2.2 AA | Dashboard conformance |
| UI languages | English + Hindi at launch |
| Colour independence | Status never conveyed by colour alone |
| Keyboard navigation | Full support in dashboard |

---

## 7. Maintainability & operability

| Requirement | Target |
|---|---|
| Test coverage (business logic) | ≥ 70% lines, ≥ 90% on billing, tenancy, guardrails |
| CI pipeline duration | ≤ 12 min |
| Deploy frequency | Daily (control plane), weekly (realtime plane) |
| Change failure rate | ≤ 10% |
| Mean time to restore | ≤ 30 min |
| Every call replayable | 100% — audio + transcript + retrieved context + prompt/model versions |
| Structured logs with tenant context | 100% of log lines |
| Runbooks | Every alert links to a runbook |
| ADRs | Every significant technical decision documented |

---

## 8. Compatibility

| Surface | Support |
|---|---|
| Browsers | Last 2 versions of Chrome, Safari, Edge, Firefox; Chrome Android; Safari iOS 16+ |
| Mobile OS (PWA) | Android 10+, iOS 16+ |
| Telephony | Indian mobile (Jio, Airtel, Vi, BSNL), landline, VoIP; both GSM and VoLTE |
| Audio codecs | G.711 (8 kHz) minimum; Opus where available |
| Screen sizes | 360 px → 2560 px |

---

## 9. Localisation

| Requirement | Detail |
|---|---|
| Voice languages | Tier 1: en-IN, hi-IN, Hinglish. Tier 2: te, ta, kn, ml, mr. Tier 3: bn, gu, pa, or, as |
| UI languages | en-IN, hi-IN at launch |
| Currency | INR; paise-precision integers |
| Number formatting | Indian grouping (1,00,000) and lakh/crore terminology |
| Date formats | DD/MM/YYYY; natural spoken Indian date forms |
| Time zone | Asia/Kolkata default; per-property configurable |
| Calendar | Indian public + regional holidays; property-specific closures |

---

## 10. Monitoring & alerting matrix

| Alert | Threshold | Severity | Response |
|---|---|---|---|
| Call answer failure rate | > 1% over 5 min | 🔴 P1 | Page on-call immediately |
| Conversational latency p95 | > 2 s over 5 min | 🔴 P1 | Page; consider model downgrade |
| Grounding violation rate | > 0.5% of calls | 🔴 P1 | Page; consider agent rollback |
| Telephony provider errors | > 2% | 🔴 P1 | Page; prepare failover |
| Zero calls for an active property | 72 h | 🟠 P2 | Ops investigates forwarding health |
| Post-call pipeline lag | > 5 min | 🟠 P2 | Investigate workers |
| Notification delivery failure | > 5% | 🟠 P2 | Check WhatsApp/SMS provider |
| API error rate | > 1% | 🟠 P2 | Investigate |
| Per-tenant cost anomaly | > 3σ | 🟠 P2 | Auto-throttle + investigate |
| Queue depth | > 1,000 | 🟡 P3 | Scale workers |
| Certificate expiry | < 14 days | 🟡 P3 | Renew |
| Cross-tenant access attempt | Any | 🔴 P1 | Security response |

---

## 11. NFR verification plan

| NFR class | How verified | Frequency |
|---|---|---|
| Latency | Synthetic call harness + production telemetry | Continuous + pre-release gate |
| Load/scale | k6 + synthetic concurrent calls at 6× expected peak | Before each peak season |
| Availability | Uptime monitoring + chaos drills (kill a pod, fail a vendor) | Monthly |
| DR | Documented restore test | Quarterly |
| Security | SAST/DAST in CI; annual external pen test | Continuous + annual |
| Quality | Eval suite in CI + weekly human audit | Continuous + weekly |
| Cost | Per-call cost telemetry + weekly margin review | Weekly |
| Accessibility | axe automated + manual audit | Per release |

---

**Next:** [13 — Roadmap & MVP Scope](13-roadmap-and-mvp-scope.md)
