# Cartesia Emotion TTS Integration

**Date**: 2026-03-09
**Status**: Design

## Goal

Wire existing emotion detection (Quick Observer regex + Conversation Director LLM analysis) to Cartesia Sonic 3's `generation_config.emotion` parameter so Donna's **voice actually sounds** warm, sympathetic, excited, etc. — not just the words.

## Approach

New `EmotionTTSProcessor` (FrameProcessor) sits between GuidanceStripper and TTS in the pipeline. On each `TextFrame`, it reads the current emotion state from `session_state`, maps it to a Cartesia emotion, and mutates the TTS service's `_settings["generation_config"].emotion`.

## Emotion Mapping

**Principle**: Empathetic response for negative emotions, mirror energy for positive.

### Negative → Empathetic Response

| Senior feeling | Cartesia emotion |
|---|---|
| sad, crying, grief | `sympathetic` |
| lonely, missing, abandoned | `affectionate` |
| worried, anxious | `calm` |
| scared, overwhelmed | `calm` |
| frustrated, angry, resentful | `calm` |
| bored, apathetic | `curious` |

### Positive → Mirror Energy

| Senior feeling | Cartesia emotion |
|---|---|
| happy, positive, enjoying | `happy` |
| excited | `excited` |
| love, grateful, fortunate | `affectionate` |
| proud | `proud` |
| content | `content` |

### Director Fallback (no regex match)

| Director tone | Cartesia emotion |
|---|---|
| positive | `content` |
| neutral | `content` |
| concerned | `sympathetic` |
| sad | `sympathetic` |

### Default: `content` (warm, at-ease baseline)

## Priority Order

1. Quick Observer high-intensity negative (grief, scared, angry)
2. Quick Observer high-intensity positive (excited, love)
3. Quick Observer medium-intensity signals
4. Director `emotional_tone` field
5. Default: `content`

## Pipeline Placement

```
... → GuidanceStripper → EmotionTTSProcessor → TTS → ...
```

## Implementation

### File: `pipecat/processors/emotion_tts.py` (~80 lines)

- Constructor takes `session_state` dict and `tts` service reference
- Overrides `process_frame()` — only acts on `TextFrame`
- Reads `session_state["_emotion_signals"]` (set by Quick Observer)
- Reads `session_state["_director_emotional_tone"]` (set by Director)
- Maps to Cartesia emotion string via lookup dicts
- Mutates `tts._settings["generation_config"].emotion`
- Passes frame through unchanged

### Changes to existing files

1. **`pipecat/processors/quick_observer.py`** — Write emotion signals to `session_state["_emotion_signals"]` (currently only used for guidance text, not persisted to session_state)

2. **`pipecat/services/director_llm.py`** — Write `emotional_tone` to `session_state["_director_emotional_tone"]` (currently only used in guidance formatting)

3. **`pipecat/bot.py`** — Add EmotionTTSProcessor to pipeline, pass TTS reference

4. **`pipecat/bot.py`** — Set default emotion to `content` in GenerationConfig

### ElevenLabs fallback

EmotionTTSProcessor checks if TTS is CartesiaTTSService before mutating. If ElevenLabs is active (via feature flag), processor is a no-op passthrough.

## Not in scope

- SSML `<emotion>` tags (deprecated by Cartesia)
- `[laughter]` injection (future enhancement)
- `<break>` tags for pacing (future enhancement)
- Per-word emotion changes within a single utterance
