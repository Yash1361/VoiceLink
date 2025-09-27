"""Business logic for generating autocomplete suggestions."""

from __future__ import annotations

from typing import Iterable

from langchain_core.exceptions import OutputParserException

from .config import Settings, get_settings
from .prompts import build_suggestion_chain  # replace previous imports


class SuggestionError(RuntimeError):
    """Raised when the service cannot parse suggestions from the LLM."""


class AutocompleteService:
    """Encapsulates LangChain pipeline for next-word suggestions."""

    def __init__(
        self,
        settings: Settings | None = None,
        *,
        chain=None,
    ) -> None:
        self.settings = settings or get_settings()
        if chain is not None:
            self._chain = chain
        else:
            # Build chain lazily with explicit API key
            self._chain = build_suggestion_chain(
                google_api_key=self.settings.google_api_key,
                model_name=self.settings.gemini_model,
            )

    def predict_next_words(
        self,
        *,
        question: str,
        partial_answer: str,
        suggestions_count: int | None = None,
    ) -> list[str]:
        """Predict the next word candidates synchronously."""
        count = suggestions_count or self.settings.suggestions_count
        try:
            payload = self._chain.invoke(
                {
                    "question": question.strip(),
                    "partial_answer": partial_answer.strip(),
                    "suggestions_count": count,
                }
            )
        except OutputParserException as exc:  # pragma: no cover - defensive
            raise SuggestionError("Unable to parse suggestions from LLM") from exc
        suggestions = _sanitize_suggestions(payload.suggestions, count)
        if not suggestions:
            raise SuggestionError("LLM returned no valid suggestions")
        return suggestions

    async def apredict_next_words(
        self,
        *,
        question: str,
        partial_answer: str,
        suggestions_count: int | None = None,
    ) -> list[str]:
        """Predict the next word candidates asynchronously."""
        count = suggestions_count or self.settings.suggestions_count
        try:
            payload = await self._chain.ainvoke(
                {
                    "question": question.strip(),
                    "partial_answer": partial_answer.strip(),
                    "suggestions_count": count,
                }
            )
        except OutputParserException as exc:  # pragma: no cover - defensive
            raise SuggestionError("Unable to parse suggestions from LLM") from exc
        suggestions = _sanitize_suggestions(payload.suggestions, count)
        if not suggestions:
            raise SuggestionError("LLM returned no valid suggestions")
        return suggestions


def _sanitize_suggestions(candidates: Iterable[str], limit: int) -> list[str]:
    """Normalize suggestions by trimming, deduplicating, and limiting length."""
    unique: list[str] = []
    seen: set[str] = set()
    for raw in candidates:
        word = raw.strip()
        if not word:
            continue
        lowered = word.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        unique.append(word)
        if len(unique) >= limit:
            break
    return unique
