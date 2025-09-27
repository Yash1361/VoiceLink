"""LLM factory utilities."""

from functools import lru_cache

from langchain_openai import ChatOpenAI

from .config import Settings, get_settings


@lru_cache
def get_default_llm() -> ChatOpenAI:
    """Return a cached OpenAI chat model configured from settings."""
    settings = get_settings()
    return ChatOpenAI(
        api_key=settings.openai_api_key,
        model=settings.openai_model,
        temperature=0.7,
        max_tokens=32,
    )


def build_llm(settings: Settings | None = None) -> ChatOpenAI:
    """Build a chat model instance using the provided settings."""
    resolved = settings or get_settings()
    return ChatOpenAI(
        api_key=resolved.openai_api_key,
        model=resolved.openai_model,
        temperature=0.7,
        max_tokens=32,
    )
