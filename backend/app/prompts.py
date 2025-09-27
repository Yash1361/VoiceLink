"""Prompt utilities for the autocomplete service (Gemini-backed).

Requires:
  pip install langchain-google-genai google-generativeai
Env:
  GOOGLE_API_KEY=<your key>
"""

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
try:
    from langchain_google_genai import ChatGoogleGenerativeAI
except ImportError as exc:
    raise RuntimeError(
        "Missing dependency 'langchain-google-genai'. Install with:\n"
        "  pip install langchain-google-genai google-generativeai"
    ) from exc
from google.api_core.exceptions import NotFound  # new import
import threading  # new
import logging  # new
try:
    import google.generativeai as genai  # new
except ImportError as exc:  # pragma: no cover
    raise RuntimeError(
        "Missing dependency 'google-generativeai'. Install with:\n"
        "  pip install google-generativeai"
    ) from exc


class SuggestionPayload(BaseModel):
    """Structured response returned by the LLM."""

    suggestions: list[str] = Field(
        ...,
        description=(
            "Ordered list of single-word suggestions ranked from most to least likely "
            "as the user's next word."
        ),
    )


SUGGESTION_PARSER = PydanticOutputParser(pydantic_object=SuggestionPayload)

PROMPT_TEMPLATE = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You help a user craft a spoken reply by suggesting the next word they might say. "
            "You are always given a full sentence that someone else just said and the partial "
            "reply the user has already spoken. Respond only with JSON matching this schema:\n"
            "{format_instructions}\nGuidelines:\n"
            "- Suggest the most probable next words the user should say to continue their reply.\n"
            "- Prioritize coherent, conversational words that answer the other person's sentence.\n"
            "- Prefer concise, single words in lowercase unless proper nouns or acronyms are required.\n"
            "- Never repeat a word that already appears in the suggestions list.\n"
            "- If the partial reply is empty, offer likely first words of the response.\n"
            "- Avoid punctuation, fillers, or multi-word phrases; respond one word at a time.\n",
        ),
        (
            "human",
            "Incoming sentence from another person: {question}\n"
            "User's reply so far: {partial_answer}\n"
            "Return exactly {suggestions_count} distinct single-word candidates in order of likelihood.",
        ),
    ]
).partial(format_instructions=SUGGESTION_PARSER.get_format_instructions())


logger = logging.getLogger(__name__)  # new

# Cache discovered models per API key (avoid listing every request)
_MODEL_CACHE: dict[str, list[str]] = {}
_MODEL_CACHE_LOCK = threading.Lock()

def _discover_models(api_key: str) -> list[str]:
    """Return model short names supporting generateContent for this key."""
    with _MODEL_CACHE_LOCK:
        if api_key in _MODEL_CACHE:
            return _MODEL_CACHE[api_key]
    try:
        genai.configure(api_key=api_key)
        models = genai.list_models()
        names: list[str] = []
        for m in models:
            methods = getattr(m, "supported_generation_methods", []) or []
            if "generateContent" in methods:
                # m.name like 'models/gemini-1.5-flash'; take final segment
                names.append(m.name.split("/")[-1])
    except Exception:  # pragma: no cover - defensive
        names = []
    with _MODEL_CACHE_LOCK:
        _MODEL_CACHE[api_key] = names
    logger.info("Gemini models discovered (%d): %s", len(names), ", ".join(names) or "<none>")
    return names


# Fallback wrapper to try multiple Gemini model variants
class _FallbackSuggestionChain:
    def __init__(self, chains):
        self._chains = chains

    def _iterate(self):
        for idx, c in enumerate(self._chains):
            yield idx, c

    def invoke(self, inputs):
        last_exc = None
        tried = []
        for _, chain in self._iterate():
            tried.append(getattr(getattr(chain, "bound", None), "kwargs", {}).get("model", "?"))
            try:
                return chain.invoke(inputs)
            except NotFound as exc:
                last_exc = exc
                continue
        raise RuntimeError(
            f"No Gemini model succeeded. Tried: {', '.join(tried)}. "
            "Verify your GOOGLE_API_KEY has access (see AI Studio) or adjust model names."
        ) from last_exc

    async def ainvoke(self, inputs):
        last_exc = None
        tried = []
        for _, chain in self._iterate():
            tried.append(getattr(getattr(chain, "bound", None), "kwargs", {}).get("model", "?"))
            try:
                return await chain.ainvoke(inputs)
            except NotFound as exc:
                last_exc = exc
                continue
        raise RuntimeError(
            f"No Gemini model succeeded. Tried: {', '.join(tried)}. "
            "Verify your GOOGLE_API_KEY has access (see AI Studio) or adjust model names."
        ) from last_exc


def build_suggestion_chain(
    *,
    google_api_key: str,
    model_name: str | None = None,
    temperature: float = 0.3,
):
    """Create a fresh runnable chain (prompt -> Gemini -> parser) with dynamic model fallback."""
    if model_name:
        available = _discover_models(google_api_key)
        if model_name not in available:
            raise RuntimeError(
                f"Requested model '{model_name}' not available for this key. "
                f"Available: {', '.join(available) or 'NONE'}"
            )
        candidates = [model_name]
    else:
        available = _discover_models(google_api_key)
        preferred_order = [
            "gemini-2.0-flash-exp",
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
            "gemini-2.5-pro",
        ]
        candidates = [m for m in preferred_order if m in available]
        print("List of models: ", available)  # new
        if not candidates:
            candidates = available[:]  # try everything discovered
        if not candidates:
            raise RuntimeError(
                "No Gemini models with generateContent available for this API key. "
                "Enable models in Google AI Studio."
            )
    logger.info("Gemini candidate models to try (in order): %s", ", ".join(candidates))
    chains = []
    for m in candidates:
        model = ChatGoogleGenerativeAI(
            model=m,
            temperature=temperature,
            google_api_key=google_api_key,
        )
        chains.append(PROMPT_TEMPLATE | model | SUGGESTION_PARSER)
    return chains[0] if len(chains) == 1 else _FallbackSuggestionChain(chains)
