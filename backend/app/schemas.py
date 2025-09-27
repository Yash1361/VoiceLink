"""API request/response models."""

from typing import Annotated

from pydantic import BaseModel, Field

from .prompts import SuggestionBranch


class SuggestionRequest(BaseModel):
    """Incoming payload from the frontend."""

    question: Annotated[str, Field(min_length=1)]
    partial_answer: Annotated[str, Field(default="")]
    suggestions_count: Annotated[int, Field(ge=1, le=10, default=None)]


class SuggestionResponse(BaseModel):
    """Response returned to the frontend."""

    suggestions: list[SuggestionBranch]
