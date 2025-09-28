"""FastAPI entrypoint for the autocomplete backend."""

from contextlib import asynccontextmanager
import json
from json import JSONDecodeError

from fastapi import Body, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings
from .schemas import SuggestionRequest, SuggestionResponse
from .service import AutocompleteService, SuggestionError
from pydantic import ValidationError
from google.api_core.exceptions import ResourceExhausted, GoogleAPIError  # ensure present
import re  # new
import asyncio


@asynccontextmanager
async def lifespan(app: FastAPI):  # pragma: no cover - simple resource hook
    yield


def create_app() -> FastAPI:
    application = FastAPI(title="VoiceLink Autocomplete API", lifespan=lifespan)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def provide_settings() -> Settings:
        try:
            return get_settings()
        except ValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Server configuration invalid. Please set required environment variables.",
            ) from exc

    def provide_service(settings: Settings = Depends(provide_settings)) -> AutocompleteService:
        return AutocompleteService(settings=settings)

    @application.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @application.post("/suggest", response_model=SuggestionResponse, tags=["suggestions"])
    async def suggest(
        payload: SuggestionRequest | dict | str = Body(...),
        service: AutocompleteService = Depends(provide_service),
    ) -> SuggestionResponse:
        # Accept accidental stringified JSON
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except JSONDecodeError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Body is a string but not valid JSON.",
                )
        if isinstance(payload, dict):
            try:
                payload = SuggestionRequest(**payload)
            except ValidationError as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=exc.errors(),
                ) from exc

        # Retry config (could later move to settings)
        MAX_RATE_LIMIT_RETRIES = 2
        INITIAL_BACKOFF_SECONDS = 1.0
        attempt = 0
        while True:
            try:
                result = await service.apredict_next_words(
                    question=payload.question,
                    partial_answer=payload.partial_answer,
                    conversation=payload.conversation,
                    suggestions_count=payload.suggestions_count,
                )
                break
            except ResourceExhausted as exc:
                text = str(exc)
                # Extract retry delay if present
                m = re.search(r"retry in ([0-9]+(?:\.[0-9]+)?)s", text.lower())
                retry_after = m.group(1) if m else None
                attempt += 1
                quota_zero = "limit: 0" in text.lower()
                if quota_zero:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Gemini quota is zero for this model. Enable billing or allocate quota.",
                    ) from exc
                if attempt > MAX_RATE_LIMIT_RETRIES:
                    headers = {}
                    if retry_after:
                        # round up seconds
                        headers["Retry-After"] = str(int(float(retry_after)) + 1)
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Upstream rate limit exceeded. Retry later.",
                        headers=headers,
                    ) from exc
                backoff = INITIAL_BACKOFF_SECONDS * (2 ** (attempt - 1))
                await asyncio.sleep(backoff)
            except GoogleAPIError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Upstream Gemini error.",
                ) from exc
            except SuggestionError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=str(exc),
                ) from exc
        return SuggestionResponse(
            suggestions=result["suggestions"],
            sentences=result["sentences"],
        )

    return application


app = create_app()
