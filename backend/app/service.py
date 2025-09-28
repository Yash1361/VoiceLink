"""Business logic for generating autocomplete suggestions."""

from __future__ import annotations

from typing import Iterable

from langchain_core.exceptions import OutputParserException

from .config import Settings, get_settings
from .prompts import SuggestionBranch, build_suggestion_chain


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
    ) -> list[SuggestionBranch]:
        """Predict the next-word suggestion tree synchronously."""
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
        tree = _sanitize_suggestions(payload.suggestions, count)
        if not tree:
            raise SuggestionError("LLM returned no valid suggestions")
        return tree

    async def apredict_next_words(
        self,
        *,
        question: str,
        partial_answer: str,
        suggestions_count: int | None = None,
    ) -> list[SuggestionBranch]:
        """Predict the next-word suggestion tree asynchronously."""
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
        tree = _sanitize_suggestions(payload.suggestions, count)
        if not tree:
            raise SuggestionError("LLM returned no valid suggestions")
        return tree


def _sanitize_suggestions(
    branches: Iterable[SuggestionBranch],
    limit: int,
    *,
    max_depth: int = 4,
) -> list[SuggestionBranch]:
    """Normalize nested suggestions by trimming words, deduplicating per level, and enforcing depth."""

    sanitized: list[SuggestionBranch] = []
    seen: set[str] = set()
    for branch in branches:
        cleaned = _sanitize_branch(branch, depth=1, max_depth=max_depth)
        if cleaned is None:
            continue
        key = cleaned.word.lower()
        if key in seen:
            continue
        seen.add(key)
        sanitized.append(cleaned)
        if len(sanitized) >= limit:
            break
    return sanitized


def _sanitize_branch(
    branch: SuggestionBranch,
    *,
    depth: int,
    max_depth: int,
) -> SuggestionBranch | None:
    word = branch.word.strip()
    if not word:
        return None

    if depth >= max_depth:
        children: list[SuggestionBranch] = []
    else:
        children = []
        child_seen: set[str] = set()
        for child in branch.next:
            cleaned_child = _sanitize_branch(
                child,
                depth=depth + 1,
                max_depth=max_depth,
            )
            if cleaned_child is None:
                continue
            key = cleaned_child.word.lower()
            if key in child_seen:
                continue
            child_seen.add(key)
            children.append(cleaned_child)

    return SuggestionBranch(word=word, next=children)
