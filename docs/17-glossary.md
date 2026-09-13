# 17 — Glossary

**Version:** 0.1 · **Date:** 2026-09-13

---

## Product & domain terms

| Term | Meaning |
|---|---|
| **Atithi** | Hindi/Sanskrit for "guest". Working product name |
| **Property** | A hotel, resort, homestay, villa or venue — the unit of subscription |
| **Front office / front desk** | The reception team who answer calls and handle guests |
| **Enquiry** | An inbound question about staying at the property — the thing we capture |
| **Lead** | A structured, contactable enquiry created from a call |
| **Qualified lead** | A lead with name, reachable number and enough intent detail to act on |
| **Containment** | Share of calls the AI handled fully without transferring to a human |
| **Capture rate** | Share of AI-handled calls that produced a qualified lead |
| **Recovered revenue** | Booking value attributable to leads the AI captured from otherwise-missed calls |
| **Attribution** | Linking a confirmed booking back to the AI-captured lead that started it |
| **SLA timer** | Countdown from lead creation to the required first staff contact |
| **Escalation chain** | Ordered list of human numbers tried when transferring a call |
| **Barge-in** | The caller interrupting the agent mid-sentence; the agent must stop immediately |
| **Containment vs transfer** | Whether the AI finished the call or handed it to a person |
| **Grounding** | Restricting the agent to facts present in the property's knowledge base |
| **Grounding violation** | The agent stating something not in the knowledge base — especially a price or availability |
| **Slot** | A discrete piece of information to capture (dates, pax, room type) |
| **Slot filling** | The process of collecting those values through conversation |
| **Persona** | The agent's configured name, voice, tone and style for a property |
| **KB gap** | A guest question the knowledge base couldn't answer |
| **Design partner** | An early customer who uses the product free in exchange for deep feedback |

## Hospitality industry terms

| Term | Meaning |
|---|---|
| **PMS** | Property Management System — core hotel software for reservations, check-in, billing (eZee, Hotelogix, Djubo, Cloudbeds) |
| **Channel Manager** | Software syncing rates and inventory across OTAs (STAAH, RateGain) |
| **OTA** | Online Travel Agency — MakeMyTrip, Booking.com, Agoda, Airbnb. Charge 15–25% commission |
| **Direct booking** | A booking made straight with the property — highest margin, no OTA commission |
| **ADR** | Average Daily Rate — average revenue per occupied room per night |
| **RevPAR** | Revenue Per Available Room |
| **LOS** | Length of Stay (nights) |
| **Pax** | Number of persons/guests |
| **Occupancy** | Share of available rooms sold |
| **Tariff** | The room rate |
| **Shoulder season** | The period between peak and off-season |
| **In-house guest** | A guest currently staying at the property |
| **Walk-in** | A guest arriving without a reservation |
| **MAP / AP / EP / CP** | Meal plans: Modified American (breakfast + one meal), American (all meals), European (room only), Continental (breakfast) |
| **FHRAI** | Federation of Hotel & Restaurant Associations of India |

## Telephony terms

| Term | Meaning |
|---|---|
| **PSTN** | Public Switched Telephone Network — the traditional phone network |
| **DID** | Direct Inward Dialing number — a virtual/cloud phone number |
| **CLI** | Calling Line Identification — the caller's number as presented to the recipient (caller ID) |
| **CCF** | Conditional Call Forwarding — forwarding only when busy, unanswered or unreachable |
| **CFU / CFB / CFNRy / CFNRc** | Call Forward Unconditional / Busy / No Reply / Not Reachable |
| **USSD** | Short codes dialled on a phone to configure carrier features (e.g. `**61*...#`) |
| **SIP** | Session Initiation Protocol — signalling protocol for voice over IP |
| **SIP trunk** | An IP connection carrying multiple concurrent voice channels |
| **PRI** | Primary Rate Interface — legacy digital trunk line (30 channels in India) |
| **PBX / IP-PBX** | Private Branch Exchange — an organisation's internal phone system |
| **IVR** | Interactive Voice Response — "press 1 for reservations" menus |
| **DTMF** | The tones produced by pressing phone keypad digits |
| **CPaaS** | Communications Platform as a Service — programmable telephony (Exotel, Plivo, Twilio) |
| **RTP / SRTP** | Real-time Transport Protocol (and its encrypted form) — carries the audio |
| **WebRTC** | Browser/server realtime media standard |
| **Media streaming** | Provider capability to send/receive live call audio to your server — **essential for realtime AI** |
| **Warm transfer** | Announcing the call to the human before connecting |
| **Blind transfer** | Connecting without announcement |
| **Whisper** | A short message played only to the receiving agent before the bridge |
| **Jitter / packet loss** | Network impairments that degrade call audio |
| **G.711 / Opus** | Audio codecs; G.711 is standard 8 kHz telephony quality |
| **Toll fraud** | Abuse of telephony credentials to place expensive calls |

## AI & voice terms

| Term | Meaning |
|---|---|
| **ASR / STT** | Automatic Speech Recognition / Speech-to-Text |
| **TTS** | Text-to-Speech |
| **LLM** | Large Language Model |
| **VAD** | Voice Activity Detection — detecting when someone is speaking |
| **Endpointing** | Deciding when the speaker has finished their turn |
| **Turn detection** | Managing who speaks next in the conversation |
| **TTFT** | Time To First Token — how quickly the LLM starts responding |
| **TTFB** | Time To First Byte — how quickly TTS starts producing audio |
| **WER** | Word Error Rate — ASR accuracy metric (lower is better) |
| **Cascaded pipeline** | ASR → LLM → TTS as separate stages |
| **Speech-to-speech** | A single model handling audio in and audio out |
| **RAG** | Retrieval-Augmented Generation — grounding responses in retrieved documents |
| **Embedding** | A numeric vector representing text meaning, used for similarity search |
| **Vector search** | Finding semantically similar text via embedding distance |
| **Hybrid search** | Combining keyword (BM25/FTS) and vector search |
| **Chunk** | A small passage of knowledge-base text, independently retrievable |
| **Reranking** | Re-scoring retrieved results with a more accurate model |
| **Prompt caching** | Reusing computation for a repeated static prompt prefix — cuts cost and latency |
| **Hallucination** | A model stating something false with confidence |
| **Guardrail** | A control preventing unsafe or non-compliant model output |
| **Prompt injection** | Malicious input attempting to override the model's instructions |
| **LLM-as-judge** | Using an LLM to evaluate another model's output |
| **Eval set** | A fixed labelled dataset used to measure model quality over time |
| **Shadow deployment** | Running a new version alongside the old without affecting users |
| **Canary** | Releasing to a small percentage of traffic first |
| **Filler audio** | A short pre-recorded phrase played while the model thinks |
| **Diarisation** | Separating a transcript by speaker |

## Compliance & regulatory terms

| Term | Meaning |
|---|---|
| **DPDP Act 2023** | India's Digital Personal Data Protection Act |
| **Data Principal** | The individual whose personal data is processed (the guest) |
| **Data Fiduciary** | The entity determining purpose and means of processing (the property) |
| **Data Processor** | An entity processing on a fiduciary's behalf (us) |
| **Sub-processor** | A processor engaged by a processor (our AI/telephony vendors) |
| **DPA** | Data Processing Agreement |
| **TRAI** | Telecom Regulatory Authority of India |
| **DoT** | Department of Telecommunications |
| **TCCCPR 2018** | India's regulations governing unsolicited commercial communications |
| **UCC** | Unsolicited Commercial Communication |
| **DLT** | Distributed Ledger Technology platform where Indian SMS senders, headers and templates must be registered |
| **DND** | Do Not Disturb registry |
| **Sender ID / Header** | The alphanumeric SMS sender identity, DLT-registered |
| **UL / VNO** | Unified Licence / Virtual Network Operator — Indian telecom licence categories |
| **Data residency** | Requirement to store data within a jurisdiction |
| **RLS** | Row Level Security — PostgreSQL feature enforcing per-tenant row access |
| **PII** | Personally Identifiable Information |
| **SOC 2 / ISO 27001** | Security compliance frameworks required by enterprise buyers |
| **Grievance Officer** | A designated contact for data-protection complaints under Indian law |

## SaaS & business terms

| Term | Meaning |
|---|---|
| **ARR / MRR** | Annual / Monthly Recurring Revenue |
| **ARPA** | Average Revenue Per Account |
| **CAC** | Customer Acquisition Cost |
| **LTV** | Lifetime Value |
| **NRR** | Net Revenue Retention (including expansion, contraction, churn) |
| **Logo churn** | Percentage of customers lost, regardless of revenue size |
| **COGS** | Cost of Goods Sold — here, telephony + AI + infra per call |
| **Gross margin** | (Revenue − COGS) / Revenue |
| **Time-to-value** | How long until a customer experiences the core benefit |
| **North Star metric** | The single measure best representing delivered value |
| **Beachhead** | The narrow initial market chosen to win first |
| **Design partner** | Early customer co-developing the product |
| **PLG** | Product-Led Growth — the product drives acquisition and expansion |
| **Error budget** | The allowable amount of unreliability before feature work stops |

## Engineering terms used in these docs

| Term | Meaning |
|---|---|
| **Control plane** | The CRUD/API/dashboard services |
| **Realtime plane** | The live voice/media services handling calls |
| **BFF** | Backend For Frontend |
| **Idempotency key** | A token ensuring a repeated request has effect only once |
| **DLQ** | Dead Letter Queue — where permanently failed jobs land |
| **SLO / SLA / SLI** | Service Level Objective (internal target) / Agreement (contractual) / Indicator (the measurement) |
| **RTO / RPO** | Recovery Time Objective / Recovery Point Objective |
| **PITR** | Point-In-Time Recovery |
| **Drain-and-replace** | Deployment that stops new work, finishes in-flight work, then recycles |
| **ADR** | Architecture Decision Record |
| **SSRF** | Server-Side Request Forgery — a key risk in URL ingestion |
| **HNSW** | A vector index algorithm used by pgvector |
| **p50 / p95 / p99** | Latency percentiles |

---

**Back to:** [README](../README.md)
