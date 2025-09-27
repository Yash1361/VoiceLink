"""Tests for the autocomplete service."""

import asyncio

from dataclasses import dataclass

import pytest
from app.prompts import SuggestionBranch, SuggestionPayload
from app.service import AutocompleteService, SuggestionError


class DummyChain:
    def __init__(self, suggestions: list[SuggestionBranch]) -> None:
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
    chain = DummyChain(
        [
            SuggestionBranch(
                word="Yes",
                next=[
                    SuggestionBranch(word=" maybe ", next=[]),
                    SuggestionBranch(word="maybe", next=[]),
                ],
            ),
            SuggestionBranch(word=" yes ", next=[]),
            SuggestionBranch(word="possibly", next=[]),
        ]
    )
    service = AutocompleteService(chain=chain, settings=_make_settings())

    suggestions = asyncio.run(
        service.apredict_next_words(
            question="Would you like some water?",
            partial_answer="Yes",
            suggestions_count=3,
        )
    )

    assert [branch.word for branch in suggestions] == ["Yes", "possibly"]
    assert [child.word for child in suggestions[0].next] == ["maybe"]


def test_sync_prediction_respects_limit_and_trims() -> None:
    chain = DummyChain(
        [
            SuggestionBranch(word="  hello  ", next=[]),
            SuggestionBranch(
                word="world",
                next=[
                    SuggestionBranch(word="friend", next=[]),
                ],
            ),
        ]
    )
    service = AutocompleteService(chain=chain, settings=_make_settings())

    suggestions = service.predict_next_words(
        question="How are you?",
        partial_answer="I'm",
        suggestions_count=1,
    )

    assert [branch.word for branch in suggestions] == ["hello"]
    assert suggestions[0].next == []


def test_error_when_no_valid_suggestions() -> None:
    chain = DummyChain(
        [
            SuggestionBranch(word=" ", next=[]),
            SuggestionBranch(word="", next=[]),
            SuggestionBranch(word="   ", next=[]),
        ]
    )
    service = AutocompleteService(chain=chain, settings=_make_settings())

    with pytest.raises(SuggestionError):
        asyncio.run(
            service.apredict_next_words(
                question="Do you need help?",
                partial_answer="",
            )
        )
