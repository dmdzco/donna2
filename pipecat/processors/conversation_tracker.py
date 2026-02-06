"""Conversation tracking processor.

Tracks topics discussed, questions asked, and advice given during a call
to prevent repetition. Port of extractConversationElements(),
trackTopicsFromSignals(), and getConversationTrackingSummary() from
pipelines/v1-advanced.js.

Sits in the pipeline after the LLM and reads both:
- TranscriptionFrame (user messages) → extract topic keywords
- TextFrame (LLM output) → extract questions and advice phrases
"""

import re
from dataclasses import dataclass, field

from pipecat.frames.frames import TextFrame, TranscriptionFrame
from pipecat.processors.frame_processor import FrameProcessor


# ---------------------------------------------------------------------------
# Topic extraction patterns (16 categories from user messages)
# ---------------------------------------------------------------------------

_TOPIC_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b(garden(?:ing)?|plant(?:ing|s)?|flower(?:s)?)\b", re.I), "gardening"),
    (re.compile(r"\b(cook(?:ing)?|bak(?:ing)?|recipe(?:s)?|dinner|lunch|breakfast)\b", re.I), "cooking"),
    (re.compile(r"\b(walk(?:ing)?|exercise|yoga|swimming)\b", re.I), "exercise"),
    (re.compile(r"\b(read(?:ing)?|book(?:s)?|newspaper)\b", re.I), "reading"),
    (re.compile(r"\b(church|prayer|service|bible)\b", re.I), "faith"),
    (re.compile(r"\b(tv|television|show(?:s)?|movie(?:s)?|watch(?:ing)?)\b", re.I), "tv/movies"),
    (re.compile(r"\b(grandkid(?:s)?|grandchild(?:ren)?|grandson|granddaughter)\b", re.I), "grandchildren"),
    (re.compile(r"\b(son|daughter|brother|sister|husband|wife|family)\b", re.I), "family"),
    (re.compile(r"\b(doctor|hospital|appointment|medication|medicine|pill(?:s)?)\b", re.I), "medical"),
    (re.compile(r"\b(weather|rain(?:ing)?|snow(?:ing)?|sunny|cold|hot)\b", re.I), "weather"),
    (re.compile(r"\b(sleep(?:ing)?|nap|rest(?:ing)?|tired)\b", re.I), "sleep"),
    (re.compile(r"\b(friend(?:s)?|neighbor(?:s)?|visitor(?:s)?|company)\b", re.I), "social"),
    (re.compile(r"\b(pain|ache|hurt(?:ing)?|sore|dizzy|fall|fell)\b", re.I), "health concerns"),
    (re.compile(r"\b(bird(?:s)?|cat(?:s)?|dog(?:s)?|pet(?:s)?)\b", re.I), "pets"),
    (re.compile(r"\b(music|sing(?:ing)?|radio|song(?:s)?)\b", re.I), "music"),
    (re.compile(r"\b(craft(?:s)?|knit(?:ting)?|sew(?:ing)?|puzzle(?:s)?)\b", re.I), "crafts"),
]

# Advice phrases in Donna's responses
_ADVICE_PATTERN = re.compile(
    r"(?:you should|try to|don't forget to|make sure to|remember to|how about)[^.!?]*",
    re.IGNORECASE,
)

# Max list sizes
_MAX_TOPICS = 10
_MAX_QUESTIONS = 8
_MAX_ADVICE = 8


# ---------------------------------------------------------------------------
# Extraction helpers (pure functions, usable standalone)
# ---------------------------------------------------------------------------

def extract_topics(user_message: str) -> list[str]:
    """Extract topic keywords from a user message."""
    topics = []
    lower = user_message.lower()
    for pattern, label in _TOPIC_PATTERNS:
        if pattern.search(lower):
            topics.append(label)
    return topics


def extract_questions(response_text: str) -> list[str]:
    """Extract questions from Donna's response (sentences ending in ?)."""
    questions = []
    matches = re.findall(r"[^.!?]*\?", response_text)
    for q in matches:
        words = q.strip().split()[:5]
        if words:
            questions.append(" ".join(words))
    return questions


def extract_advice(response_text: str) -> list[str]:
    """Extract advice phrases from Donna's response."""
    advice = []
    for match in _ADVICE_PATTERN.finditer(response_text):
        words = match.group(0).strip().split()[:5]
        if words:
            advice.append(" ".join(words))
    return advice


def track_topics_from_signals(analysis_result, topics: list[str]) -> list[str]:
    """Add topic entries from Quick Observer signals.

    Args:
        analysis_result: AnalysisResult from quick_observer.quick_analyze()
        topics: Existing topics list (mutated in place and returned)
    """
    if getattr(analysis_result, "health_signals", None):
        if "health" not in topics:
            topics.append("health")

    if getattr(analysis_result, "family_signals", None):
        if "family" not in topics:
            topics.append("family")

    for signal in getattr(analysis_result, "activity_signals", []):
        label = str(signal).lower().split()[:2]
        label = " ".join(label)
        if label and label not in topics:
            topics.append(label)

    if getattr(analysis_result, "emotion_signals", None):
        negatives = [e for e in analysis_result.emotion_signals if e.get("valence") == "negative"]
        if negatives and "emotions" not in topics:
            topics.append("emotions")

    return topics


def format_tracking_summary(
    topics: list[str],
    questions: list[str],
    advice: list[str],
) -> str | None:
    """Format conversation tracking as a system prompt section.

    Returns None if nothing has been tracked yet.
    """
    sections = []
    if topics:
        sections.append(f"- Topics discussed: {', '.join(topics)}")
    if questions:
        sections.append(f"- Questions you've asked: {'; '.join(questions)}")
    if advice:
        sections.append(f"- Advice you've given: {'; '.join(advice)}")

    if not sections:
        return None

    return (
        "CONVERSATION SO FAR THIS CALL (avoid repeating):\n"
        + "\n".join(sections)
        + "\nBuild on these topics rather than reintroducing them. Ask NEW questions."
    )


# ---------------------------------------------------------------------------
# Processor (sits in pipeline, reads frames passthrough)
# ---------------------------------------------------------------------------

@dataclass
class ConversationState:
    """Mutable state for a single call's conversation tracking."""
    topics_discussed: list[str] = field(default_factory=list)
    questions_asked: list[str] = field(default_factory=list)
    advice_given: list[str] = field(default_factory=list)


class ConversationTrackerProcessor(FrameProcessor):
    """Track conversation elements from both user and LLM frames.

    Place after the LLM and before the guidance stripper:
        ... → llm → conversation_tracker → guidance_stripper → tts → ...

    All frames pass through unchanged — this processor only observes.
    The tracked state is available via .state and .get_summary().
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.state = ConversationState()
        self._llm_buffer = ""

    def get_summary(self) -> str | None:
        """Get formatted tracking summary for system prompt injection."""
        return format_tracking_summary(
            self.state.topics_discussed,
            self.state.questions_asked,
            self.state.advice_given,
        )

    def record_quick_observer_signals(self, analysis_result) -> None:
        """Record topics from Quick Observer analysis result."""
        track_topics_from_signals(analysis_result, self.state.topics_discussed)
        if len(self.state.topics_discussed) > _MAX_TOPICS:
            self.state.topics_discussed = self.state.topics_discussed[-_MAX_TOPICS:]

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            # User message → extract topics
            topics = extract_topics(frame.text)
            for t in topics:
                if t not in self.state.topics_discussed:
                    self.state.topics_discussed.append(t)
            if len(self.state.topics_discussed) > _MAX_TOPICS:
                self.state.topics_discussed = self.state.topics_discussed[-_MAX_TOPICS:]

        elif isinstance(frame, TextFrame):
            # LLM output → extract questions and advice
            text = frame.text
            questions = extract_questions(text)
            self.state.questions_asked.extend(questions)
            if len(self.state.questions_asked) > _MAX_QUESTIONS:
                self.state.questions_asked = self.state.questions_asked[-_MAX_QUESTIONS:]

            advice = extract_advice(text)
            self.state.advice_given.extend(advice)
            if len(self.state.advice_given) > _MAX_ADVICE:
                self.state.advice_given = self.state.advice_given[-_MAX_ADVICE:]

        await self.push_frame(frame, direction)
