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
   # edit .env and set your Google Gemini credentials
   ```

   | Variable            | Description                                                   | Default            |
   | ------------------- | ------------------------------------------------------------- | ------------------ |
   | `GOOGLE_API_KEY`    | Required key with access to the Gemini models listed below.   | —                  |
   | `GEMINI_MODEL`      | Preferred Gemini model short name (e.g. `gemini-2.5-pro`).    | `gemini-2.5-flash` |
   | `SUGGESTIONS_COUNT` | Default number of top-level suggestions if the client omits it.| `5`                |

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

## Expose the API with ngrok

The repository ships with a helper script that boots the FastAPI server and creates an HTTPS tunnel using ngrok.

1. Install the extra dependency:

   ```bash
   pip install -r requirements.txt  # ensures pyngrok is available
   ```

2. Set your ngrok auth token (once per machine):

   ```bash
   # Replace XXX with the token from https://dashboard.ngrok.com/get-started/your-authtoken
   export NGROK_AUTHTOKEN=XXX
   ```

   Optional environment variables:

   - `NGROK_REGION` — override the default region (e.g. `us`, `eu`).
   - `APP_PORT` — change the uvicorn port (defaults to 8000).
   - `APP_RELOAD` — set to `true` for auto-reload during development.

3. Launch the combined server + tunnel from the `backend/` directory:

   ```bash
   python scripts/run_with_ngrok.py
   ```

   The script prints a public HTTPS URL (e.g. `https://abc123.ngrok-free.app`) that forwards requests to your local FastAPI service. Hit that URL’s `/health` or `/suggest` endpoints from remote clients to test the deployment.

## Testing

Tests use a fake LangChain LLM so no external requests are made. Once dependencies are installed, run:

```bash
pytest
```

## Frontend Integration Notes

- The API enables CORS for all origins to simplify local development with Vite/React.
- Each subsequent word selection should call `POST /suggest` with the updated `partial_answer` string.
- The service returns words in ranked order; the frontend can display them left-to-right from highest to lowest likelihood.
