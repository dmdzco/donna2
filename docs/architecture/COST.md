# Cost Analysis

> Investor-facing unit economics for Donna's Telnyx voice workflow.

*Last updated: April 15, 2026. Prices are based on published vendor pricing pages on that date. Actual invoices can differ because of negotiated discounts, taxes, carrier fees, model substitutions, failed-call partial usage, startup credits, plan minimums, and regional routing.*

---

## Executive Summary

Donna's forward voice workflow assumes **Telnyx for phone voice, media streaming, and SMS**, while keeping **ElevenLabs for TTS for now**. On that basis, the current modeled stack costs about **$0.62 per 10-minute completed outbound call**, or **$0.062 per live call minute**, before customer support, payroll, App Store fees, payment processing, compliance counsel, or CAC.

For investor planning, model Donna as:

| Usage profile | Minutes / user / week | ElevenLabs base COGS / user / month | Gross margin at $29 |
|---|---:|---:|---:|
| Light / sustainable | 60 | ~$16 | ~45% |
| Moderate | 100 | ~$27 | ~8% |
| Heavy companion usage | 130 | ~$35 | Negative |

Carrier savings help, but the business implication is still clear: a **$29 unlimited plan only works if average usage stays near normal companion usage** and if we package usage carefully. At 130 minutes/week, the default Telnyx + ElevenLabs stack is still upside down.

Near-term operating assumption:

| Stack | Cost / 10-min call | Cost / minute | Heavy user COGS at 130 min/week | Gross margin at $29 |
|---|---:|---:|---:|---:|
| Telnyx + ElevenLabs default | ~$0.62 | ~$0.062 | ~$35/mo | Negative |

Future speech-cost sensitivity only:

| Stack | Cost / 10-min call | Cost / minute | Heavy user COGS at 130 min/week | Gross margin at $29 |
|---|---:|---:|---:|---:|
| Telnyx + Cartesia Sonic / Deepgram Aura-2 | ~$0.50 | ~$0.050 | ~$28/mo | ~3% |
| Telnyx + Deepgram Aura-1 | ~$0.41 | ~$0.041 | ~$23/mo | ~20% |
| Telnyx speech evaluation: Telnyx STT + Telnyx TTS | ~$0.41 | ~$0.041 | ~$23/mo | ~20% |

Deck-safe phrasing:

> With Telnyx as the carrier baseline and ElevenLabs kept for voice quality, Donna's current infra COGS are roughly 6 cents per live call minute. At 60 minutes/week, that can support a $29 consumer plan before non-infra costs. At 130 minutes/week, Donna needs pricing tiers, usage caps, or premium packaging. Lower-cost TTS is upside, not the current base case.

### Margin Upside With Optimizations

The base margin story is not "AI gets cheap enough for unlimited $29." The stronger story is: Donna can reach workable margins for normal usage by using Telnyx as the communications baseline, keeping ElevenLabs for voice quality, and pricing heavier companionship usage correctly.

Modeling cases:

| Case | Cost / minute | What has to be true |
|---|---:|---|
| ElevenLabs base | ~$0.062 | Telnyx voice/media/SMS, Deepgram STT, Claude, ElevenLabs TTS. |
| Future lower-TTS sensitivity | ~$0.041 | Lower-cost TTS or Telnyx speech path passes senior-listening quality tests. |
| Aggressive future sensitivity | ~$0.034 | Lower assistant speech volume, cheaper TTS, controlled search/SMS, possible volume discounts. |

Gross margin by price point:

| Price | Usage | ElevenLabs base | Future lower-TTS sensitivity | Aggressive future sensitivity |
|---|---:|---:|---:|---:|
| $29/mo | 60 min/week | ~45% | ~63% | ~70% |
| $29/mo | 100 min/week | ~8% | ~39% | ~49% |
| $29/mo | 130 min/week | Negative | ~20% | ~34% |
| $39/mo | 60 min/week | ~59% | ~73% | ~77% |
| $39/mo | 100 min/week | ~31% | ~54% | ~62% |
| $39/mo | 130 min/week | ~11% | ~41% | ~51% |
| $49/mo | 60 min/week | ~67% | ~78% | ~82% |
| $49/mo | 100 min/week | ~45% | ~64% | ~70% |
| $49/mo | 130 min/week | ~29% | ~53% | ~61% |

Investor-safe margin claim:

> With Telnyx + ElevenLabs, Donna can reach about **45% gross margin on normal 60 min/week usage at $29/month**, before non-infra costs. To get software-like margins while keeping ElevenLabs, Donna needs usage-aware packaging and heavier users priced closer to **$49/month**. Lower-cost TTS can lift margins later, but it is not the current assumption.

---

## Forward Runtime Assumption

This document is now a forward-looking Telnyx model. It is not a historical carrier comparison.

| Layer | Modeled default | Notes |
|---|---|---|
| Phone carrier | Telnyx Voice API + Elastic SIP Trunking + Media Streaming over WebSockets | Outbound local call model uses Voice API fee, SIP outbound fee, and media streaming fee. |
| STT | Deepgram Nova-3 General streaming | Continuous stream for full call duration. |
| Main voice LLM | Anthropic Claude Sonnet 4.x | Prompt caching remains assumed. Sonnet 4.5 and 4.6 have the same published token prices. |
| Director LLM | Groq `openai/gpt-oss-20b`, Gemini fallback | Runs off critical path for guidance/query extraction. |
| Post-call analysis | Gemini 3 Flash Preview | Summaries, concerns, engagement, caregiver SMS copy. |
| Memory extraction | OpenAI small model + embeddings | Runs post-call; embeddings are de minimis in cost. |
| TTS | ElevenLabs Flash/Turbo | Keep this assumption for now. Active Telnyx calls request 16kHz PCM from TTS; higher-rate TTS output is only for non-phone paths. |
| Web/news | Tavily basic search, OpenAI web search fallback/news | Current feature remains enabled in the model. |
| Notifications | Telnyx SMS + Resend email | SMS uses one outbound message part plus estimated carrier fee. |
| Hosting/data | Railway, Neon Postgres/pgvector, Redis | Mostly fixed platform cost, not the main COGS driver. |

Important correction: the carrier baseline is Telnyx from this document forward, but the TTS baseline remains ElevenLabs for now. The main variable COGS problem is now **TTS + STT + LLM/search**, not the communications carrier.

---

## Pricing Inputs

| Service | Modeled price | Source |
|---|---:|---|
| Telnyx Voice API programmatic call fee | $0.002/min + SIP fee | [Telnyx Voice API pricing](https://telnyx.com/pricing/voice-api) |
| Telnyx outbound local SIP | starting at $0.005/min | [Telnyx SIP Trunking pricing](https://telnyx.com/pricing/elastic-sip) |
| Telnyx inbound local SIP | starting at $0.0035/min | [Telnyx SIP Trunking pricing](https://telnyx.com/pricing/elastic-sip) |
| Telnyx Media Streaming over WebSockets | $0.0035/min | [Telnyx Voice API pricing](https://telnyx.com/pricing/voice-api) |
| Telnyx STT | $0.015/min | [Telnyx Voice API pricing](https://telnyx.com/pricing/voice-api) |
| Telnyx TTS | $0.000003/character | [Telnyx Voice API pricing](https://telnyx.com/pricing/voice-api) |
| Telnyx local 10DLC SMS | $0.004/message part + carrier fee | [Telnyx Messaging pricing](https://telnyx.com/pricing/messaging) |
| Deepgram Nova-3 streaming STT | $0.0077/min pay-as-you-go | [Deepgram pricing](https://deepgram.com/pricing) |
| Deepgram Aura-2 TTS | $0.030/1K chars | [Deepgram pricing](https://deepgram.com/pricing) |
| Deepgram Aura-1 TTS | $0.015/1K chars | [Deepgram pricing](https://deepgram.com/pricing) |
| ElevenLabs Flash/Turbo TTS | $0.05/1K chars | [ElevenLabs API pricing](https://elevenlabs.io/pricing/api) |
| Cartesia Sonic TTS | 1 credit/char; Scale annual plan implies about $0.030/1K chars | [Cartesia pricing](https://cartesia.ai/pricing) |
| Claude Sonnet 4.x | $3/MTok input, $15/MTok output, $0.30/MTok cache read | [Anthropic pricing](https://claude.com/pricing) |
| Groq GPT OSS 20B | $0.075/MTok input, $0.30/MTok output | [Groq pricing](https://groq.com/pricing) |
| Gemini 3 Flash Preview | $0.50/MTok input, $3/MTok output | [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| OpenAI web search preview | $25/1K calls for non-reasoning preview models | [OpenAI API pricing](https://developers.openai.com/api/docs/pricing) |
| Tavily basic search | 1 credit/search; $0.008/credit pay-as-you-go | [Tavily credits](https://docs.tavily.com/documentation/api-credits) |
| Railway | usage based; Pro has $20 minimum | [Railway pricing](https://railway.com/pricing) |
| Neon | Launch $0.106/CU-hour; Scale $0.222/CU-hour; $0.35/GB-month | [Neon pricing](https://neon.com/pricing) |
| Resend | Free 3K emails/mo; Pro $20/mo for 50K emails | [Resend pricing](https://resend.com/pricing) |

Carrier formulas used in this model:

| Call type | Telnyx formula | Cost / 10-min call |
|---|---:|---:|
| Outbound local AI call | Voice API $0.002/min + outbound SIP $0.005/min + media streaming $0.0035/min | $0.105 |
| Inbound local AI call | Voice API $0.002/min + inbound SIP $0.0035/min + media streaming $0.0035/min | $0.090 |

Telnyx STT is modeled as an evaluation path, not as the default cost winner. At published list rates, direct Deepgram Nova-3 streaming is cheaper than Telnyx STT, so Telnyx STT should be justified by latency, simplification, or negotiated pricing rather than list-price savings alone.

---

## Modeling Assumptions

Base unit: **one 10-minute completed outbound local call**.

| Assumption | Base value | Why |
|---|---:|---|
| Call duration | 10 minutes | Current product target; hard stop around 12 minutes. |
| Turns | ~20 assistant responses | Typical companion call shape. |
| TTS characters | ~6,000 chars/call | Based on ~1,500 Claude output tokens at roughly 4 chars/token. |
| Claude usage | 70K input, 55K cache-read, 15K uncached, 1.5K output | Matches prompt-cached append architecture. |
| Director usage | 35K input, 8K output | Query + guidance analysis across the call. |
| Post-call Gemini | 6K input, 800 output | Summary/concerns/caregiver SMS analysis. |
| OpenAI memory extraction | 6K input, 600 output + small embedding cost | Post-call memory extraction and storage. |
| News/search | 0.2 Tavily searches/call + one OpenAI daily news fetch on calling days | Web search remains enabled; cached news is per senior/day, not per turn. |
| Notification | one caregiver SMS per completed call | Email is usually inside Resend free/low-cost tier. |
| Telnyx SMS estimate | $0.010/SMS | $0.004 base plus a blended carrier fee allowance. |
| Compute/db variable load | $0.005/call placeholder | Platform cost is mostly fixed and modeled separately below. |

Sensitivity:

- If Donna speaks only ~3,000 chars in a 10-minute call, subtract about **$0.15/call** from the ElevenLabs model.
- If daily news is disabled, subtract about **$0.025/calling day**.
- If SMS is disabled or email-only, subtract about **$0.010/completed call**.
- Inbound local AI calls are about **$0.015 cheaper per 10-minute call** than outbound local AI calls at list prices.
- Telnyx carrier and media cost is about **17% of current Telnyx default call COGS**; TTS remains the largest cost center.

---

## Current Per-Call Cost

**Forward default stack: Telnyx + Deepgram STT + Claude Sonnet + Groq Director + Gemini post-call + ElevenLabs TTS.**

| Component | Usage | Cost / 10-min call |
|---|---:|---:|
| ElevenLabs TTS | 6,000 chars at $0.05/1K | $0.300 |
| Telnyx voice + media streaming | 10 min at $0.0105/min | $0.105 |
| Claude Sonnet 4.x | 15K uncached in, 55K cache-read, 1.5K out | $0.084 |
| Deepgram Nova-3 STT | 10 min stream | $0.077 |
| Daily news + web search | 1 daily OpenAI news fetch + low Tavily usage | $0.027 |
| Caregiver SMS | 1 outbound SMS segment plus blended carrier fee estimate | $0.010 |
| Gemini post-call | 6K in, 800 out | $0.005 |
| Groq Director | 35K in, 8K out | $0.005 |
| OpenAI memory + embeddings | post-call extraction/storage | $0.002 |
| Railway/Neon variable placeholder | per-call amortized | $0.005 |
| **Total** |  | **~$0.62** |
| **Per live call minute** |  | **~$0.062** |

Current cost concentration:

| Rank | Cost center | Share |
|---:|---|---:|
| 1 | TTS | ~48% |
| 2 | Telnyx carrier/media | ~17% |
| 3 | Claude | ~14% |
| 4 | STT | ~12% |
| 5 | Search/SMS/post-call/other | ~9% |

The main LLM is not the primary cost problem. **TTS + STT + carrier/media are roughly 77% of current call COGS.**

---

## Per-User Monthly COGS

Uses 52 weeks / 12 months = 4.33 weeks/month. The first row is the current operating assumption; lower-TTS rows are future sensitivity only.

| Stack | 60 min/week | 100 min/week | 130 min/week |
|---|---:|---:|---:|
| Telnyx + ElevenLabs default | $16.11 | $26.85 | $34.90 |
| Telnyx + Cartesia Sonic | $12.99 | $21.65 | $28.15 |
| Telnyx + Deepgram Aura-2 | $12.99 | $21.65 | $28.15 |
| Telnyx + Deepgram Aura-1 | $10.65 | $17.75 | $23.08 |
| Telnyx STT + Telnyx TTS evaluation | $10.68 | $17.80 | $23.14 |

Gross margin at $29/month:

| Stack | 60 min/week | 100 min/week | 130 min/week |
|---|---:|---:|---:|
| Telnyx + ElevenLabs default | 45% | 8% | Negative |
| Telnyx + Cartesia Sonic | 55% | 25% | 3% |
| Telnyx + Deepgram Aura-2 | 55% | 25% | 3% |
| Telnyx + Deepgram Aura-1 | 63% | 39% | 20% |
| Telnyx STT + Telnyx TTS evaluation | 63% | 39% | 20% |

Gross margin at $49/month for heavy 130 min/week users:

| Stack | Heavy-user COGS | Gross margin at $49 |
|---|---:|---:|
| Telnyx + ElevenLabs default | $34.90 | 29% |
| Telnyx + Cartesia Sonic | $28.15 | 43% |
| Telnyx + Deepgram Aura-1 | $23.08 | 53% |
| Telnyx STT + Telnyx TTS evaluation | $23.14 | 53% |

Pricing implication: **$29/month is viable for light users, but not for heavy unlimited usage on the default Telnyx + ElevenLabs stack.** To make $29 work broadly while keeping ElevenLabs, we need usage tiers or a monthly minute allowance. Lower-cost TTS remains upside only.

---

## Free Trial Cost

The current free trial cap is 120 minutes over 30 days.

| Stack | Trial COGS at 120 minutes |
|---|---:|
| Telnyx + ElevenLabs default | ~$7.44 |
| Telnyx + Cartesia / Aura-2 | ~$6.00 |
| Telnyx + Deepgram Aura-1 | ~$4.92 |
| Telnyx STT + Telnyx TTS evaluation | ~$4.94 |

With ElevenLabs kept as the default, a full 120-minute trial costs about **$7.44** in variable infra. The old "$5 trial cost" is achievable only if average trial usage is below the cap or if a future TTS change passes quality tests.

---

## Scale Scenarios

Assumption: 1 user = 1 senior profile. Variable COGS only; fixed platform costs are below.

### 1,000 Users

| Usage | ElevenLabs base | Future lower-TTS sensitivity |
|---|---:|---:|
| 60 min/week | ~$16.1K/mo | ~$10.7K/mo |
| 100 min/week | ~$26.8K/mo | ~$17.8K/mo |
| 130 min/week | ~$34.9K/mo | ~$23.1K/mo |

### 10,000 Users

| Usage | ElevenLabs base | Future lower-TTS sensitivity |
|---|---:|---:|
| 60 min/week | ~$161K/mo | ~$107K/mo |
| 100 min/week | ~$268K/mo | ~$178K/mo |
| 130 min/week | ~$349K/mo | ~$231K/mo |

Fixed platform cost estimate:

| Stage | Likely monthly infra/platform spend | Notes |
|---|---:|---|
| Dev/pilot | $100-$500 | Railway, Neon, Redis, Resend, Sentry; often inside free/low tiers. |
| 200 users | $500-$1.5K | More database/log/email usage; still not dominant. |
| 1,000 users | $1K-$3K | Neon/Railway/observability/support plans start to matter. |
| 10,000 users | $8K-$25K+ | Depends on DB retention, logs, support plans, analytics, enterprise compliance. |

These fixed/platform estimates exclude headcount, support labor, legal/compliance work, BAA/enterprise minimums, insurance, App Store fees, and payment processing.

---

## Optimization Plan

### 1. Measure Real TTS Characters And Token Usage

Before changing speech vendors, capture actual per-call:

- assistant TTS characters
- Claude prompt tokens, cache-read tokens, output tokens
- call minutes
- SMS sent/not sent
- search/news calls
- Telnyx billed voice, SIP, and media streaming minutes

Investor model sensitivity is dominated by TTS characters. A shift from 6,000 chars to 3,000 chars cuts current cost by about $0.15 per 10-minute call.

### 2. Keep ElevenLabs For Now, But Track TTS Sensitivity

Do not assume a near-term TTS vendor switch in the investor base case. ElevenLabs stays the default until we explicitly decide that another voice passes senior-listening quality tests, latency tests, and compliance review.

Future sensitivity:

| Provider | Modeled TTS cost at 6,000 chars | Savings vs ElevenLabs |
|---|---:|---:|
| ElevenLabs Flash/Turbo | $0.300 | Baseline |
| Cartesia Sonic | ~$0.179 | ~$0.121/call |
| Deepgram Aura-2 | $0.180 | ~$0.120/call |
| Deepgram Aura-1 | $0.090 | ~$0.210/call |
| Telnyx TTS | $0.018 | ~$0.282/call |

Future evaluation order, only if we revisit TTS:

1. Cartesia Sonic if voice quality is materially better for seniors.
2. Deepgram Aura-2 if quality is good enough and vendor simplification matters.
3. Deepgram Aura-1 if it passes senior-listening quality tests, because the COGS impact is strong.
4. Telnyx TTS if the voice quality, streaming behavior, HIPAA/BAA posture, and latency are acceptable.

### 3. Treat Telnyx As The Communications Baseline

The carrier model should now assume Telnyx for:

- outbound and inbound calls
- media streaming
- local 10DLC SMS
- carrier dashboards and billing reconciliation

Operational work to keep the model honest:

- track Telnyx billed call minutes separately from app conversation duration
- track media streaming minutes separately from PSTN minutes
- reconcile SMS message parts and carrier fees
- monitor failed-call partial usage and retries
- keep number rental, emergency calling, and compliance fees outside per-call COGS unless they become material

### 4. Decide Later Whether Telnyx Speech Services Are Worth It

This is future research, not the current model. Telnyx TTS is extremely cheap on published list pricing, but quality is the gating factor. Telnyx STT is more expensive than direct Deepgram Nova-3 at list price, so it is not a pure cost play.

Use Telnyx STT/TTS only if one of these becomes true:

- end-to-end latency is materially lower
- fewer streaming hops reduce failure rate
- quality passes senior-listening tests
- negotiated pricing beats direct speech vendors
- observability and billing become simpler enough to justify the switch

### 5. Tune Product Pricing Around Minutes

Recommended investor-safe pricing posture:

- Do not pitch "$29 unlimited" without a usage-control story.
- Pitch "$29 with a generous included minute allowance" or "$29 starting price."
- Use 60 minutes/week as the base consumer assumption.
- Treat 130 minutes/week as a heavy-user or premium-plan assumption.

Example:

| Plan framing | Included usage | ElevenLabs base margin | Future lower-TTS margin |
|---|---:|---:|---:|
| $29 starter | ~60 min/week | ~45% | ~63% |
| $49 companion | ~130 min/week | ~29% | ~53% |
| B2B / care org | negotiated | depends on usage | target 60%+ |

---

## Monitoring Metrics

Track these daily from `call_metrics`, `conversations`, vendor dashboards, and notification logs:

- completed call minutes
- assistant TTS character count per call
- Claude prompt/cache/output tokens per call
- Deepgram billed stream minutes
- Telnyx billed voice minutes
- Telnyx billed media streaming minutes
- Telnyx SMS count, message parts, and carrier fees
- post-call analysis success/failure rate
- OpenAI/Tavily search calls per senior/day
- COGS per completed call
- COGS per active senior per month

The key operating metric for investors should be:

> Gross margin at actual minutes used per active senior.

Average users hide the risk. Heavy seniors can be the best-retained users and the most expensive users at the same time.

---

## Source Links

- [Telnyx Voice API pricing](https://telnyx.com/pricing/voice-api)
- [Telnyx SIP Trunking pricing](https://telnyx.com/pricing/elastic-sip)
- [Telnyx Messaging pricing](https://telnyx.com/pricing/messaging)
- [Deepgram pricing](https://deepgram.com/pricing)
- [ElevenLabs API pricing](https://elevenlabs.io/pricing/api)
- [Cartesia pricing](https://cartesia.ai/pricing)
- [Anthropic Claude pricing](https://claude.com/pricing)
- [Groq pricing](https://groq.com/pricing)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- [Tavily credits and pricing](https://docs.tavily.com/documentation/api-credits)
- [Railway pricing](https://railway.com/pricing)
- [Neon pricing](https://neon.com/pricing)
- [Resend pricing](https://resend.com/pricing)
