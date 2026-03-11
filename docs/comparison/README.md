# Conversation Quality Comparison: Before vs After Optimization

Comparing the conversation strategy from **March 4** (before the optimization sprint) to **March 11** (current). The optimization sprint focused on latency reduction but may have affected conversation quality.

## Files Compared

| File | What it controls |
|------|------------------|
| `prompts.py` | System prompt + phase task instructions |
| `greetings.py` | Greeting templates + interest/news/context followups |
| `news.py` | Web search + news delivery |
| `memory.py` | Memory search, storage, context building |
| `nodes.py` | Call phase config, tool assignments, context strategy |
| `conversation_director.py` | Per-turn analysis, guidance injection, web search gating |

## Key Differences

### Prompts (`prompts.py`)

**Before (Mar 4):**
- 5 Claude tools available: `search_memories`, `save_important_detail`, `web_search`, `mark_reminder_acknowledged`, `check_caregiver_notes`
- Claude actively searched memories and saved details mid-call
- Claude checked caregiver notes via tool call
- Prompt instructed Claude to use tools proactively

**Current (Mar 11):**
- 2 Claude tools: `web_search` (fallback), `mark_reminder_acknowledged` (fire-and-forget)
- Memories injected as ephemeral context by Director (no tool call)
- Caregiver notes pre-fetched at call start, in system prompt
- `save_important_detail` removed entirely (post-call handles it)
- Added onboarding prompts with caregiver empathy + text link nudge

**Impact on engagement:** Claude no longer actively decides when to search memories or save details. The Director injects memories automatically, but Claude may be less intentional about when and how it uses them. The old approach let Claude choose the right moment to recall something — the new approach dumps memories into context every turn.

### Greetings (`greetings.py`)

**Before (Mar 4):**
- Inbound templates were enthusiastic: "So nice to hear from you!", "What a nice surprise!", "How wonderful that you called!"
- Interest-based followups, context followups, news followups all present
- `get_greeting()` for outbound had time-of-day awareness + interest/news/context followups

**Current (Mar 11):**
- Inbound templates toned down: "How are you doing today?", "What's going on?", "How's your day going?"
- Same followup system for outbound calls
- Outbound greeting system unchanged

**Impact on engagement:** The inbound greetings are more natural but less warm/excited. The old greetings showed genuine enthusiasm about hearing from the senior, which can make elderly callers feel valued.

### News (`news.py`)

**Before (Mar 4):**
- OpenAI web search with 1-hour cache
- News fetched and cached in system prompt context
- Director could signal when to mention news

**Current (Mar 11):**
- Tavily web search (replaced OpenAI)
- Web search now triggered by Query Director mid-speech
- Results injected as ephemeral context, stripped each turn
- No persistent news in system prompt

**Impact on engagement:** News is more dynamic (searched on demand) but less proactive. Before, news was pre-loaded and the Director would suggest mentioning it. Now, news only appears if the senior asks a question or the Query Director detects a factual question. Donna is less likely to spontaneously share interesting news.

### Memory (`memory.py`)

**Before (Mar 4):**
- `search()` called by Claude via tool (Claude chose when to search)
- `build_context()` loaded tiered memories into system prompt (3 critical + 5 important + 5 recent)
- `save()` called by Claude mid-call when learning new details
- Similarity threshold: 0.45

**Current (Mar 11):**
- `search()` called by prefetch engine (Director/Query Director decides)
- `build_context()` loads up to 20 memories ordered by importance + recency
- `save()` no longer called mid-call (post-call extraction only)
- Similarity threshold: 0.45 (unchanged)
- 500ms memory gate waits for prefetch before passing frame to Claude

**Impact on engagement:** More memories loaded upfront (20 vs 13), but Claude doesn't actively search for specific memories mid-conversation. Before, if a senior mentioned their grandkid, Claude would search for "grandkid" memories. Now, the Query Director extracts queries and prefetches, but it's less targeted — it searches the raw utterance text, which may not match as precisely.

### Nodes (`nodes.py`)

**Before (Mar 4):**
- 4 phases: opening, main, winding_down, closing
- Opening phase had `respond_immediately=True` and separate greeting
- Tools distributed per phase (search_memories in opening+main, save_detail in main+winding_down)
- `check_caregiver_notes` in opening phase

**Current (Mar 11):**
- Simplified to main, winding_down, closing (opening merged into main)
- Only 2 tools (web_search, mark_reminder) across all phases
- Caregiver notes in system prompt, not tool
- Analysis insights from last call surfaced in system prompt

**Impact on engagement:** The opening phase removal means no dedicated "catch up" moment. The old opening phase specifically encouraged Claude to check memories and caregiver notes, creating a warm catch-up feel. Now it jumps straight to main conversation.

### Conversation Director (`conversation_director.py`)

**Before (Mar 4):**
- Single Groq analysis call per turn (~700ms)
- Extracted guidance + queries in one call
- Speculative analysis on 250ms silence only
- Web search via Director's Groq analysis (web_queries field)

**Current (Mar 11):**
- Split into Query Director (~200ms) + Guidance Director (~400ms)
- Query Director fires continuously on interims (sliding window: 45 chars first, 60+25 re-fire)
- Guidance Director fires on silence-based speculative only
- No regular analysis on final transcription
- Ephemeral context model (all injections stripped each turn)
- Web search gating with filler TTS

**Impact on engagement:** Faster response times (less tool-call latency), but the Director's guidance may be less comprehensive since the prompt was split and slimmed down. The ephemeral context model means each turn starts fresh — no accumulated context from Director injections across turns.

## Summary: What Made Calls More Engaging Before

1. **Claude actively searched memories** — chose the right moment to recall something personal
2. **News was proactively shared** — Director suggested when to mention news, not just on questions
3. **Enthusiastic greetings** — made seniors feel valued and excited to talk
4. **Opening phase** — dedicated catch-up moment with memory search + caregiver note check
5. **Claude saved details mid-call** — reinforced that Donna was paying attention and would remember
6. **Richer Director guidance** — single comprehensive prompt covered more nuance per turn

## What's Better Now

1. **~14s less latency per call** — tool calls eliminated
2. **Web search mid-speech** — answers factual questions faster
3. **No context bloat** — ephemeral stripping keeps prompts lean
4. **More memories in system prompt** — 20 vs 13
5. **Caregiver notes always available** — pre-fetched, not dependent on tool call
6. **Natural greetings** — less over-the-top enthusiasm

## Potential Fixes to Restore Engagement

- Re-add proactive news sharing (Director suggests news topics based on interests)
- Bring back some greeting warmth (balance between natural and enthusiastic)
- Give Claude explicit instructions to reference memories naturally, since it no longer "finds" them itself
- Consider a "catch-up" instruction in the main phase prompt that encourages memory-driven conversation openers
