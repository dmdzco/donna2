# Cost Analysis

> Investor-facing unit economics for Donna's voice workflow.

*Last updated: April 15, 2026. Prices in the comparison tables were prepared from published vendor pricing pages on April 14, 2026. Donna's active voice implementation has since moved from Twilio Media Streams to Telnyx Voice API; refresh the exact COGS model against account billing before using it as a current financial forecast.*

---

## Executive Summary

The old Twilio live-call workflow modeled here cost about **$0.70 per 10-minute call**, or **$0.07 per live call minute**, before customer support, payroll, app store fees, compliance counsel, or CAC. The active runtime now uses Telnyx for voice, so use the Telnyx rows as the starting point and refresh the final numbers from billing.

For investor planning, model Donna as:

| Usage profile | Minutes / user / week | Current stack COGS / user / month | Gross margin at $29 |
|---|---:|---:|---:|
| Light / sustainable | 60 | ~$18 | ~37% |
| Moderate | 100 | ~$30 | Negative |
| Heavy companion usage | 130 | ~$39 | Negative |

The immediate business implication is clear: a **$29 unlimited plan only works if average usage stays near or below 60 minutes/week**, or if we move to a cheaper voice stack. At 130 minutes/week, the current stack is upside down.

The credible near-term optimization path is to reduce TTS and carrier costs:

| Stack | Cost / 10-min call | Cost / minute | Heavy user COGS at 130 min/week | Gross margin at $29 |
|---|---:|---:|---:|---:|
| Current: Twilio + ElevenLabs | ~$0.70 | ~$0.070 | ~$39/mo | Negative |
| Twilio + Cartesia Sonic / Deepgram Aura-2 | ~$0.58 | ~$0.058 | ~$32/mo | Negative |
| Twilio + Deepgram Aura-1 | ~$0.49 | ~$0.049 | ~$27/mo | ~5% |
| Telnyx + Deepgram Aura-2 | ~$0.45 | ~$0.045 | ~$25/mo | ~13% |
| Telnyx + Deepgram Aura-1 | ~$0.36 | ~$0.036 | ~$20/mo | ~31% |

Deck-safe phrasing:

> Current infra COGS are roughly 6-8 cents per live call minute. The first optimization wave takes that to 4-5 cents; carrier plus low-cost TTS can take it toward 3.5-4 cents. At 60 minutes/week, that supports a $29 consumer plan. At 130 minutes/week, we need pricing tiers, usage caps, or the optimized stack.

### Margin Upside With Optimizations

The strongest realistic margin story is **not** "AI gets cheap enough for unlimited $29." The stronger story is: Donna can reach software-like margins for normal usage by optimizing TTS/carrier costs and pricing heavier companionship usage correctly.

Modeling cases:

| Case | Cost / minute | What has to be true |
|---|---:|---|
| Prior Twilio baseline | ~$0.070 | Twilio + ElevenLabs default, search/SMS assumptions from the April 14 model. |
| Realistic optimized | ~$0.036 | Cheaper TTS, Telnyx or equivalent carrier path, no major quality loss. |
| Aggressive optimized | ~$0.028 | Lower TTS characters per call, cheaper TTS, carrier savings, SMS/search tightly controlled, possible volume discounts. |

Gross margin by price point:

| Price | Usage | Current | Realistic optimized | Aggressive optimized |
|---|---:|---:|---:|---:|
| $29/mo | 60 min/week | ~37% | ~68% | ~75% |
| $29/mo | 100 min/week | Negative | ~46% | ~58% |
| $29/mo | 130 min/week | Negative | ~30% | ~46% |
| $39/mo | 60 min/week | ~54% | ~76% | ~81% |
| $39/mo | 100 min/week | ~23% | ~60% | ~69% |
| $39/mo | 130 min/week | Negative | ~48% | ~60% |
| $49/mo | 60 min/week | ~63% | ~81% | ~85% |
| $49/mo | 100 min/week | ~38% | ~68% | ~75% |
| $49/mo | 130 min/week | ~20% | ~59% | ~68% |

Investor-safe margin claim:

> With TTS optimization, carrier optimization, and usage-aware packaging, Donna can reach **65-75% gross margin on normal 60 min/week consumer usage**. Heavy 130 min/week companion usage should be priced closer to **$49/month** or managed through plan-level minute allowances to stay near **60% gross margin**.

---

## Runtime Stack Verified From Code

The active voice pipeline is in `pipecat/bot.py`:

| Layer | Current runtime default | Notes |
|---|---|---|
| Phone carrier | Telnyx Voice API media streaming | Node asks Pipecat `/telnyx/outbound` to place calls; Pipecat handles `/telnyx/events` and `/ws`. |
| STT | Deepgram Nova-3 General streaming | Continuous stream for full call duration. |
| Main voice LLM | Anthropic Claude Sonnet 4.5 | Prompt caching enabled. |
| Director LLM | Groq `openai/gpt-oss-20b`, Gemini fallback | Runs off critical path for guidance/query extraction. |
| Post-call analysis | Gemini 3 Flash Preview | Summaries, concerns, engagement, caregiver SMS copy. |
| Memory extraction | OpenAI `gpt-4o-mini` + embeddings | Runs post-call; embeddings are de minimis in cost. |
| TTS | Environment-controlled; Cartesia and ElevenLabs supported | Runtime keeps TTS as high-rate PCM internally: ElevenLabs `44100`, Cartesia `pcm_s16le` at `48000`; Telnyx conversion happens at the serializer edge. |
| Web/news | Tavily basic search, OpenAI web search fallback/news | Current feature remains enabled. |
| Notifications | Twilio SMS + Resend email | Defaults allow both SMS and email if caregiver preferences permit. |
| Hosting/data | Railway, Neon Postgres/pgvector, Redis | Mostly fixed platform cost, not the main COGS driver. |

Important correction from the older model: **Cartesia is not the default runtime TTS provider. ElevenLabs is.** The old cost doc modeled Cartesia as current stack and understated current TTS COGS.

---

## Pricing Inputs

| Service | Modeled price | Source |
|---|---:|---|
| Twilio outbound local voice | $0.014/min | [Twilio Voice US pricing](https://www.twilio.com/en-us/voice/pricing/us) |
| Twilio Media Streams | $0.004/min | [Twilio Voice US pricing](https://www.twilio.com/en-us/voice/pricing/us) |
| Twilio inbound local voice | $0.0085/min | [Twilio Voice US pricing](https://www.twilio.com/en-us/voice/pricing/us) |
| Deepgram Nova-3 streaming STT | $0.0077/min pay-as-you-go | [Deepgram pricing](https://deepgram.com/pricing) |
| ElevenLabs Flash/Turbo TTS | $0.05 / 1K chars | [ElevenLabs API pricing](https://elevenlabs.io/pricing/api?price.section=speech_to_text) |
| Cartesia Sonic TTS | 1 credit/char; Scale annual plan implies ~$0.030 / 1K chars | [Cartesia pricing](https://cartesia.ai/pricing) |
| Deepgram Aura-2 TTS | $0.030 / 1K chars | [Deepgram pricing](https://deepgram.com/pricing) |
| Deepgram Aura-1 TTS | $0.015 / 1K chars | [Deepgram pricing](https://deepgram.com/pricing) |
| Claude Sonnet 4.5 | $3/MTok input, $15/MTok output, $0.30/MTok cache hit | [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) |
| Groq GPT OSS 20B | $0.075/MTok input, $0.30/MTok output | [Groq pricing](https://groq.com/pricing) |
| Gemini 3 Flash Preview | $0.50/MTok input, $3/MTok output | [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| OpenAI `gpt-4o-mini` / search-preview family | $0.15/MTok input, $0.60/MTok output | [OpenAI model pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini-search-preview) |
| OpenAI web search preview | $25 / 1K calls for non-reasoning preview models | [OpenAI API pricing](https://developers.openai.com/api/docs/pricing) |
| Tavily basic search | 1 credit/search; $0.008/credit pay-as-you-go | [Tavily credits](https://docs.tavily.com/documentation/api-credits) |
| Railway | CPU/memory usage based; Pro has $20 minimum | [Railway pricing](https://railway.com/pricing) |
| Neon | Launch $0.106/CU-hour; Scale $0.222/CU-hour; $0.35/GB-month | [Neon pricing](https://neon.com/pricing) |
| Resend | Free 3K emails/mo; Pro $20/mo for 50K emails | [Resend pricing](https://resend.com/pricing) |

---

## Modeling Assumptions

Base unit: **one 10-minute completed outbound call**.

| Assumption | Base value | Why |
|---|---:|---|
| Call duration | 10 minutes | Current product target; hard stop around 12 minutes. |
| Turns | ~20 assistant responses | Typical companion call shape. |
| TTS characters | ~6,000 chars/call | Based on ~1,500 Claude output tokens at roughly 4 chars/token. |
| Claude usage | 70K input, 55K cache-read, 15K uncached, 1.5K output | Matches current prompt-cached APPEND architecture. |
| Director usage | 35K input, 8K output | Query + guidance analysis across the call. |
| Post-call Gemini | 6K input, 800 output | Summary/concerns/caregiver SMS analysis. |
| OpenAI memory extraction | 6K input, 600 output + small embedding cost | Post-call memory extraction and storage. |
| News/search | 0.2 Tavily searches/call + one OpenAI daily news fetch on calling days | Web search remains enabled; cached news is per senior/day, not per turn. |
| Notification | one caregiver SMS per completed call | Email is usually inside Resend free/low-cost tier. |
| Compute/db variable load | $0.005/call placeholder | Platform cost is mostly fixed and modeled separately below. |

Sensitivity:

- If Donna speaks only ~3,000 chars in a 10-minute call, subtract about **$0.15/call** from the current ElevenLabs model.
- If daily news is disabled, subtract about **$0.025/calling day**.
- If SMS is disabled or email-only, subtract about **$0.012/completed call**.
- Inbound local calls are cheaper than outbound by about **$0.055 per 10-minute call** because Twilio inbound local voice is $0.0085/min instead of $0.014/min.

---

## Prior Twilio Per-Call Baseline

**Prior baseline stack: Twilio + Deepgram STT + Claude Sonnet + Groq Director + Gemini post-call + ElevenLabs TTS.** The active voice runtime is Telnyx; this table is retained as the old baseline for comparison until the Telnyx cost model is refreshed from account billing.

| Component | Usage | Cost / 10-min call |
|---|---:|---:|
| ElevenLabs TTS | 6,000 chars at $0.05/1K | $0.300 |
| Twilio voice + Media Streams | 10 min at $0.018/min | $0.180 |
| Claude Sonnet 4.5 | 15K uncached in, 55K cache-read, 1.5K out | $0.084 |
| Deepgram Nova-3 STT | 10 min stream | $0.077 |
| Daily news + web search | 1 daily OpenAI news fetch + low Tavily usage | $0.027 |
| Caregiver SMS | 1 SMS segment plus carrier fee estimate | $0.012 |
| Gemini post-call | 6K in, 800 out | $0.005 |
| Groq Director | 35K in, 8K out | $0.005 |
| OpenAI memory + embeddings | post-call extraction/storage | $0.002 |
| Railway/Neon variable placeholder | per-call amortized | $0.005 |
| **Total** |  | **~$0.70** |
| **Per live call minute** |  | **~$0.070** |

Current cost concentration:

| Rank | Cost center | Share |
|---:|---|---:|
| 1 | TTS | ~43% |
| 2 | Twilio carrier/stream | ~26% |
| 3 | Claude | ~12% |
| 4 | STT | ~11% |
| 5 | Search/SMS/post-call/other | ~8% |

The main LLM is not the primary cost problem. **TTS + phone carrier + STT are roughly 80% of current call COGS.**

---

## Per-User Monthly COGS

Uses 52 weeks / 12 months = 4.33 weeks/month.

| Stack | 60 min/week | 100 min/week | 130 min/week |
|---|---:|---:|---:|
| Current: Twilio + ElevenLabs | $18.12 | $30.19 | $39.25 |
| Twilio + Cartesia Sonic | $14.98 | $24.96 | $32.45 |
| Twilio + Deepgram Aura-2 | $15.00 | $24.99 | $32.49 |
| Twilio + Deepgram Aura-1 | $12.66 | $21.09 | $27.42 |
| Telnyx + Deepgram Aura-2 | $11.62 | $19.36 | $25.17 |
| Telnyx + Deepgram Aura-1 | $9.28 | $15.46 | $20.10 |

Gross margin at $29/month:

| Stack | 60 min/week | 100 min/week | 130 min/week |
|---|---:|---:|---:|
| Current: Twilio + ElevenLabs | 37% | Negative | Negative |
| Twilio + Cartesia Sonic | 48% | 14% | Negative |
| Twilio + Deepgram Aura-1 | 56% | 27% | 5% |
| Telnyx + Deepgram Aura-2 | 60% | 33% | 13% |
| Telnyx + Deepgram Aura-1 | 68% | 47% | 31% |

Gross margin at $49/month for heavy 130 min/week users:

| Stack | Heavy-user COGS | Gross margin at $49 |
|---|---:|---:|
| Current: Twilio + ElevenLabs | $39.25 | 20% |
| Twilio + Cartesia Sonic | $32.45 | 34% |
| Twilio + Deepgram Aura-1 | $27.42 | 44% |
| Telnyx + Deepgram Aura-2 | $25.17 | 49% |
| Telnyx + Deepgram Aura-1 | $20.10 | 59% |

Pricing implication: **$29/month is viable for light users, but not for heavy unlimited usage on the current stack.** To make $29 work broadly, we need usage tiers, a monthly minute allowance, or the optimized stack.

---

## Free Trial Cost

The current free trial cap is 120 minutes over 30 days.

| Stack | Trial COGS at 120 minutes |
|---|---:|
| Current: Twilio + ElevenLabs | ~$8.36 |
| Twilio + Cartesia / Aura-2 | ~$6.90 |
| Twilio + Deepgram Aura-1 | ~$5.84 |
| Telnyx + Deepgram Aura-2 | ~$5.36 |
| Telnyx + Deepgram Aura-1 | ~$4.28 |

The old "$5 trial cost" remains achievable only after TTS/carrier optimization or if the average trial user does not consume the full 120 minutes.

---

## Scale Scenarios

Assumption: 1 user = 1 senior profile. Variable COGS only; fixed platform costs are below.

### 1,000 Users

| Usage | Current stack | Telnyx + Aura-1 optimized |
|---|---:|---:|
| 60 min/week | ~$18.1K/mo | ~$9.3K/mo |
| 100 min/week | ~$30.2K/mo | ~$15.5K/mo |
| 130 min/week | ~$39.3K/mo | ~$20.1K/mo |

### 10,000 Users

| Usage | Current stack | Telnyx + Aura-1 optimized |
|---|---:|---:|
| 60 min/week | ~$181K/mo | ~$93K/mo |
| 100 min/week | ~$302K/mo | ~$155K/mo |
| 130 min/week | ~$393K/mo | ~$201K/mo |

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

Before changing vendors, capture actual per-call:

- assistant TTS characters
- Claude prompt tokens, cache-read tokens, output tokens
- call minutes
- SMS sent/not sent
- search/news calls

Investor model sensitivity is dominated by TTS characters. A shift from 6,000 chars to 3,000 chars cuts current cost by about $0.15 per 10-minute call.

### 2. Switch Default TTS To A Cheaper Acceptable Voice

Options:

| Provider | Modeled TTS cost at 6,000 chars | Savings vs ElevenLabs |
|---|---:|---:|
| ElevenLabs Flash/Turbo | $0.300 | Baseline |
| Cartesia Sonic | ~$0.179 | ~$0.121/call |
| Deepgram Aura-2 | $0.180 | ~$0.120/call |
| Deepgram Aura-1 | $0.090 | ~$0.210/call |

Recommended evaluation order:

1. Cartesia Sonic if voice quality is materially better for seniors.
2. Deepgram Aura-2 if quality is good enough and vendor simplification matters.
3. Deepgram Aura-1 if it passes senior-listening quality tests, because the COGS impact is strongest.

### 3. Telnyx Is Now The Active Carrier

Donna has moved live voice to Telnyx in code. Treat Twilio as an archived fallback for voice and keep its references here only as the old cost baseline.

Next cost-model cleanup:

- pull actual Telnyx billed call minutes and media streaming charges after production traffic starts
- split inbound, outbound, failed-call, and test-call costs
- verify SMS cost remains Twilio/notification-specific unless SMS is migrated too
- update investor-facing tables with the observed Telnyx blended per-minute rate

### 4. Tune Product Pricing Around Minutes

Recommended investor-safe pricing posture:

- Do not pitch "$29 unlimited" without a usage-control story.
- Pitch "$29 with a generous included minute allowance" or "$29 starting price."
- Use 60 minutes/week as the base consumer assumption.
- Treat 130 minutes/week as a heavy-user or premium-plan assumption.

Example:

| Plan framing | Included usage | Current stack margin | Optimized margin |
|---|---:|---:|---:|
| $29 starter | ~60 min/week | ~37% | ~68% |
| $49 companion | ~130 min/week | ~20% | ~59% |
| B2B / care org | negotiated | depends on usage | target 60%+ |

---

## Monitoring Metrics

Track these daily from `call_metrics`, `conversations`, vendor dashboards, and notification logs:

- completed call minutes
- assistant TTS character count per call
- Claude prompt/cache/output tokens per call
- Deepgram billed stream minutes
- Telnyx billed minutes and media streaming minutes
- post-call analysis success/failure rate
- OpenAI/Tavily search calls per senior/day
- SMS count per completed call
- COGS per completed call
- COGS per active senior per month

The key operating metric for investors should be:

> Gross margin at actual minutes used per active senior.

Average users hide the risk. Heavy seniors can be the best-retained users and the most expensive users at the same time.

---

## Source Links

- [Twilio Voice US pricing](https://www.twilio.com/en-us/voice/pricing/us)
- [Deepgram pricing](https://deepgram.com/pricing)
- [ElevenLabs API pricing](https://elevenlabs.io/pricing/api?price.section=speech_to_text)
- [Cartesia pricing](https://cartesia.ai/pricing)
- [Anthropic Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Groq pricing](https://groq.com/pricing)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- [OpenAI GPT-4o mini Search Preview model pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini-search-preview)
- [Tavily credits and pricing](https://docs.tavily.com/documentation/api-credits)
- [Telnyx SIP Trunking pricing](https://telnyx.com/pricing/elastic-sip)
- [Railway pricing](https://railway.com/pricing)
- [Neon pricing](https://neon.com/pricing)
- [Resend pricing](https://resend.com/pricing)
