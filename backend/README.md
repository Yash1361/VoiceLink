# VoiceLink Autocomplete Backend

This FastAPI service wraps a LangChain pipeline that suggests next-word candidates for a non-verbal user answering a question. Frontend clients submit the original question and the partial answer assembled so far; the backend returns a ranked list of candidate words that can be rendered as buttons.

## Features

- LangChain chat prompt tailored for next-word prediction
- Structured JSON parsing to guarantee clean suggestion lists
- Configurable model, API key, and default list size via environment variables
- Async FastAPI endpoint ready for the React frontend
- Lightweight sanitisation so duplicate or empty results are filtered out

## Getting Started

1. **Install dependencies**

   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   # edit .env and paste your OpenAI API key
   ```

   | Variable            | Description                                           | Default       |
   | ------------------- | ----------------------------------------------------- | ------------- |
   | `OPENAI_API_KEY`    | Required OpenAI key used by `ChatOpenAI`.             | —             |
   | `OPENAI_MODEL`      | Chat model identifier.                                | `gpt-4o-mini` |
   | `SUGGESTIONS_COUNT` | Default number of suggestions if the client omits it. | `5`           |

3. **Run the API server**

   ```bash
   uvicorn app.main:app --reload
   ```

   The server exposes two endpoints:

   - `GET /health` — simple readiness probe
   - `POST /suggest` — accepts JSON payload `{ "question": "…", "partial_answer": "…", "suggestions_count": 5 }`

## How it Works

1. The request payload is validated with Pydantic models.
2. `AutocompleteService` injects the question, partial answer, and requested count into a LangChain `ChatPromptTemplate`.
3. `ChatOpenAI` generates candidate words while a `PydanticOutputParser` forces a structured JSON response.
4. The service normalises results, removing blanks and duplicates before returning them to the caller.

## Testing

Tests use a fake LangChain LLM so no external requests are made. Once dependencies are installed, run:

```bash
pytest
```

## Frontend Integration Notes

- The API enables CORS for all origins to simplify local development with Vite/React.
- Each subsequent word selection should call `POST /suggest` with the updated `partial_answer` string.
- The service returns words in ranked order; the frontend can display them left-to-right from highest to lowest likelihood.
