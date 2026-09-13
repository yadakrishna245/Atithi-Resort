# 01 — Product Vision & Problem

**Version:** 0.1 · **Date:** 2026-09-13 · **Status:** Draft

---

## 1. The problem

### 1.1 The trigger incident

A traveller researching a stay in India:

- Finds a resort on Google, likes the photos and reviews → **high purchase intent**
- Calls the phone number on the Google Business Profile
- No answer. Retries several times over some hours. Still no answer.
- Books a competitor's property
- Receives a callback from the original resort *after* the decision is made → too late

**Loss to the property:** the room night (₹3,000–₹25,000+), the ancillary spend (F&B, activities, spa), the lifetime value of a repeat guest, and a word-of-mouth referral. **Cost to acquire that call:** already paid (Google listing, OTA visibility, ads, brand-building).

The call was the *most expensive* part of the funnel and it was dropped for free.

### 1.2 Why calls go unanswered

This is not laziness. It is structural:

| Cause | Reality on the ground |
|---|---|
| **Single-threaded front desk** | One person handles check-in, check-out, guest requests and the phone. A 6-minute check-in = every call in that window lost. |
| **Peak-hour collisions** | 10 AM–12 PM (check-outs) and 2 PM–6 PM (check-ins + enquiry peak) overlap. |
| **After-hours enquiries** | Travellers plan at night. Many small properties have no night receptionist, or one who is asleep/on rounds. |
| **Seasonality** | Weekend/festival spikes: 5× call volume, same 1–2 staff. |
| **Staff churn** | High attrition in Indian hospitality; new staff don't know tariffs, policies, directions. |
| **Multiple numbers, one human** | Google listing, MMT/Booking.com, website, and WhatsApp all ring the same phone. |
| **Language mismatch** | Caller speaks Tamil, the person on duty speaks only Hindi/English. |

### 1.3 Quantifying the pain (hypotheses to validate)

These are **assumptions to be tested in discovery**, not established facts. See [Doc 16](16-open-questions-and-decisions.md#validation-backlog).

| Hypothesis | Assumed value | How we'll validate |
|---|---|---|
| H1 | 20–40% of inbound calls to independent Indian properties go unanswered | Pull call logs / Google Business "missed call" data from 15 pilot properties |
| H2 | 30–50% of unanswered callers never call back | Post-call survey on recovered leads; ask "did you try calling before?" |
| H3 | Average enquiry-to-booking value ₹8,000–₹15,000 for a 2-night leisure stay | Pilot property ADR × average LOS |
| H4 | A property receives 150–600 enquiry calls/month | Telephony logs during pilot |
| H5 | Recovering even 10% of missed enquiries is a 10–25× ROI on our subscription | Attribution reporting in-product |

> **Do not put unvalidated numbers in a sales deck.** Validate with 15 pilot properties first (see [Doc 13](13-roadmap-and-mvp-scope.md#phase-0--discovery--design-partners)).

### 1.4 Why existing solutions don't solve it

| Existing option | Why it falls short |
|---|---|
| **IVR ("press 1 for reservations")** | Routes to the same busy human. Callers hate menus. Doesn't capture anything if nobody picks up. |
| **Voicemail** | Indians largely don't leave voicemails; many mobile plans don't even have it configured. |
| **"Missed call alert" services** | Tells you *who* called, not *what they wanted*. Staff call back cold, with no context, often too late. |
| **Human call centre / BPO** | ₹15k–₹40k/month per seat. Unaffordable for a 12-room homestay. Doesn't scale to 3 AM. |
| **Website chatbot** | Only catches web visitors. The high-intent user picked up the *phone* precisely because they wanted a fast human answer. |
| **WhatsApp-only bots** | Requires the guest to initiate on WhatsApp. Doesn't help the Google-listing caller. |
| **OTA reliance (MMT, Booking.com)** | Works, but costs 15–25% commission. Direct phone bookings are the highest-margin channel — exactly the one being dropped. |

**The gap:** nothing affordably answers the *voice* channel, *instantly*, *in the caller's language*, *24×7*, *with property-specific knowledge*, and *hands a structured lead to staff*.

---

## 2. The solution

### 2.1 Product concept

Atithi AI is a **multi-tenant SaaS AI voice receptionist**. When a call to a property is not answered within N seconds (or the line is busy, or it's outside working hours), the call is conditionally forwarded to Atithi AI, which:

1. **Answers in under 2 rings** with the property's own greeting
2. **Detects the caller's language** and continues in it (English, Hindi, Hinglish, and major regional languages)
3. **Answers property questions accurately** from a curated knowledge base — location, room types, tariff ranges, amenities, check-in/out times, pet/alcohol policy, distance from airport/station, cancellation policy
4. **Qualifies the enquiry** — dates, number of guests, room type, occasion, budget
5. **Captures contact details** — name, callback number, preferred callback time, WhatsApp consent
6. **Instantly follows up on WhatsApp** with brochure, photos, tariff card and the staff member's number
7. **Alerts the front office in real time** — push/WhatsApp/SMS with a one-tap "call back" and full transcript + summary
8. **Escalates** to a human immediately if the caller asks, or if it's an in-house guest / complaint / emergency
9. **Tracks the loop to closure** — SLA timer on callback, escalation to the manager if untouched, and booking-outcome attribution

### 2.2 What it is NOT (at least not in v1)

- ❌ Not a booking engine — it does **not** take payments or confirm reservations autonomously
- ❌ Not a replacement for the front office — it is the **safety net** behind them
- ❌ Not a PMS or channel manager — it integrates with them
- ❌ Not an outbound marketing dialer (that's Phase 3, and heavily regulated — see [Doc 10](10-telephony-and-india-compliance.md))

### 2.3 Vision statement

> **Every high-intent guest who picks up the phone gets an instant, knowledgeable, human-quality answer in their own language — and every property captures the revenue it has already paid to attract.**

Three-year view: start as the never-miss-a-call layer for Indian hospitality, then become the **AI front-office platform** — inbound voice, WhatsApp, outbound follow-up, upsell, post-stay feedback and reputation — expanding from resorts/hotels into adjacent high-call-volume, low-staff verticals (clinics, diagnostic labs, real-estate sales offices, salons/spas, wedding venues, tour operators, service centres).

### 2.4 Product principles

1. **Never pretend to be human.** Disclose that it's an AI assistant. Trust is the product; deception destroys it and is a regulatory risk.
2. **Latency is a feature.** Every 100 ms of response delay costs conversation quality. Budget it like money.
3. **Grounded or silent.** The agent may only state facts present in the property's knowledge base. On anything else: "Let me have our team confirm that for you." Never invent price or availability.
4. **Always offer a human.** One clear path to a real person, any time, no loops.
5. **The lead is the deliverable.** Success = staff call back and convert, not "the AI had a nice chat".
6. **Prove the rupees.** Every dashboard leads with recovered-revenue attribution.
7. **Onboarding in under 30 minutes.** A property owner with a smartphone must be able to go live the same day.
8. **Local-first.** Indian languages, Indian telephony, Indian payment rails, Indian data residency.

---

## 3. Market

### 3.1 Target segments (India-first)

| Segment | Approx. size (India) | Fit | Priority |
|---|---|---|---|
| Independent resorts & boutique hotels (10–80 rooms) | ~60k+ properties | 🟢 Highest pain, direct-booking dependent, owner decides fast | **P0 — beachhead** |
| Homestays / villas / serviced apartments | ~100k+ listings | 🟢 Often zero front desk; owner's personal mobile is the "front office" | **P0** |
| Small hotel chains (3–20 properties) | ~5k groups | 🟡 Higher ACV, longer sales cycle, needs multi-property dashboard | P1 |
| Wedding/banquet venues & event resorts | ~20k | 🟢 Very high enquiry value, very poor call handling | P1 |
| Tour operators / travel agencies | ~50k+ | 🟡 High call volume, complex enquiries | P2 |
| Adjacent verticals (clinics, labs, salons, real estate) | Very large | 🟡 Same engine, different knowledge pack | P2/P3 |
| Large branded chains (Taj, Oberoi, Marriott) | Small count | 🔴 Have contact centres, long procurement | P3 |

**Beachhead:** independent leisure resorts and homestays in high-tourism Indian circuits — Goa, Coorg, Wayanad, Munnar, Manali/Kasol, Rishikesh, Udaipur, Jaipur, Andaman, Ooty/Kodaikanal, Mahabaleshwar/Lonavala, Pondicherry, Gokarna.

### 3.2 Why now

- **Realtime speech-to-speech LLMs** crossed the usability threshold (sub-second, interruptible, natural). This was not buildable at quality in 2022.
- **Indic ASR/TTS quality jumped** (Sarvam AI, AI4Bharat, Google/Azure Indic models) — regional-language voice AI is now viable.
- **Inference cost collapsed** — a 4-minute AI call now costs single-digit rupees, making a ₹2,000–₹8,000/month SaaS price viable with healthy margins.
- **Cloud telephony is commoditised in India** (Exotel, Ozonetel, Plivo, Kaleyra) with programmable inbound and conditional forwarding.
- **WhatsApp Business API is mainstream** in Indian hospitality — the natural follow-up channel.
- **Post-COVID staffing shortage** in Indian hospitality is persistent; owners are actively seeking automation.

### 3.3 Competitive landscape

| Category | Examples | Our differentiation |
|---|---|---|
| Global AI voice agent platforms | Vapi, Retell AI, Bland AI, Synthflow, PolyAI | They sell *infrastructure/horizontal agents*; we sell a **vertical, outcome-priced hospitality product** with Indian languages, Indian telephony and PMS integrations |
| Hospitality AI answering | Numa, Slang.ai, Annette (US-focused) | Not built for India: no Indic languages, no Indian telephony/number-forwarding playbook, USD pricing 10–20× too high |
| Indian cloud telephony | Exotel, Ozonetel, Knowlarity | They are our **suppliers/channel partners**, not competitors — they sell IVR & call infra, not a knowledge-grounded conversational receptionist |
| Hotel chatbots / booking engines | Djubo, Hotelogix add-ons, RezNext | Web/WhatsApp text only; voice is unserved |

**Defensibility over time:** (1) proprietary Indian-hospitality conversation data & evaluation sets, (2) deep PMS/channel-manager integrations, (3) property knowledge graphs that get better with every call, (4) distribution partnerships with PMS vendors and hotel associations, (5) outcome-based attribution data that makes switching costly.

---

## 4. Business model summary

Subscription SaaS, per property, tiered by included AI-call minutes, with overage. Optional revenue-share/success-fee tier for larger properties. Details in [Doc 14](14-pricing-and-gtm.md).

**Core value equation to communicate:**

$$\text{Monthly value} = N_{\text{missed}} \times r_{\text{capture}} \times c_{\text{conversion}} \times V_{\text{booking}}$$

Where $N_{\text{missed}}$ = missed calls/month, $r_{\text{capture}}$ = share answered & captured by AI, $c_{\text{conversion}}$ = share of captured leads that book, $V_{\text{booking}}$ = average booking value.

Illustrative (to be validated): $80 \times 0.85 \times 0.15 \times ₹9{,}000 \approx ₹91{,}800$ of recovered revenue per month against a ₹4,999 subscription.

---

## 5. Risks to the thesis

| Risk | Severity | Mitigation |
|---|---|---|
| Properties won't change call-forwarding settings | 🔴 High | Guided onboarding, telco-specific USSD instruction cards, option to use a new tracking number instead ([Doc 10](10-telephony-and-india-compliance.md)) |
| Callers hang up on an AI | 🟠 Med-High | Instant answer, natural voice, disclose-and-be-useful framing, immediate human-transfer option; measure hang-up rate as a top-line metric |
| AI gives wrong tariff/availability → guest dispute | 🔴 High | Hard grounding rules, price *ranges* not quotes in v1, explicit "team will confirm" language ([Doc 09](09-ai-agent-design.md)) |
| Regional language quality insufficient | 🟠 Medium | Launch English + Hindi + Hinglish first; add regional languages with per-language eval gates |
| Telephony/regulatory changes (TRAI/DoT) | 🟠 Medium | Multi-vendor telephony abstraction; compliance review before each phase ([Doc 10](10-telephony-and-india-compliance.md)) |
| Price sensitivity of small properties | 🟠 Medium | Low entry tier, annual prepay discount, ROI-led selling, association/PMS channel deals |
| Big platform (Google/Meta/PMS vendor) ships this natively | 🟠 Medium | Move fast on vertical depth + integrations; become the partner rather than the target |
| Voice AI cost spikes | 🟡 Low-Med | Model-agnostic pipeline, cost caps per tenant, cascade cheap→expensive models ([Doc 12](12-nfrs-and-slas.md)) |

---

## 6. Success definition

**12 months from launch:**

- 250+ paying properties
- ≥ 85% of forwarded calls answered by AI within 2 rings
- ≥ 70% of answered calls produce a qualified, contactable lead
- ≥ 80% of leads contacted by staff within the SLA window
- ≥ 4.3/5 average owner satisfaction; < 3% monthly logo churn
- Median demonstrable ROI ≥ 10× subscription cost, shown in-product

---

**Next:** [02 — PRD](02-prd.md)
