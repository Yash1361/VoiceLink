"""Tests for the autocomplete service."""

import asyncio

from dataclasses import dataclass

import pytest
from app.prompts import SuggestionPayload
from app.service import AutocompleteService, SuggestionError


class DummyChain:
    def __init__(self, suggestions: list[str]) -> None:
        self._payload = SuggestionPayload(suggestions=suggestions)

    def invoke(self, _: dict) -> SuggestionPayload:
        return self._payload

    async def ainvoke(self, _: dict) -> SuggestionPayload:
        await asyncio.sleep(0)
        return self._payload


@dataclass
class DummySettings:
    google_api_key: str = "test-key"
    gemini_model: str = "gemini-2.5-flash"
    suggestions_count: int = 5


def _make_settings(default_count: int = 5) -> DummySettings:
    return DummySettings(suggestions_count=default_count)


def test_async_prediction_deduplicates_and_limits() -> None:
    chain = DummyChain(["Yes", "yes", "maybe", " ", "possibly"])
    service = AutocompleteService(chain=chain, settings=_make_settings())

    suggestions = asyncio.run(
        service.apredict_next_words(
            question="Would you like some water?",
            partial_answer="Yes",
            suggestions_count=3,
        )
    )

    assert suggestions == ["Yes", "maybe", "possibly"]


def test_sync_prediction_respects_limit_and_trims() -> None:
    chain = DummyChain(["  hello  ", "world", "friend"])
    service = AutocompleteService(chain=chain, settings=_make_settings())

    suggestions = service.predict_next_words(
        question="How are you?",
        partial_answer="I'm",
        suggestions_count=1,
    )

    assert suggestions == ["hello"]


def test_error_when_no_valid_suggestions() -> None:
    chain = DummyChain([" ", "", "   "])
    service = AutocompleteService(chain=chain, settings=_make_settings())

    with pytest.raises(SuggestionError):
        asyncio.run(
            service.apredict_next_words(
                question="Do you need help?",
                partial_answer="",
            )
        )
