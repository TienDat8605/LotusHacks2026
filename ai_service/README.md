# AI Service

Standalone Python/FastAPI service for:

- offline review embedding generation from `data/data.json`
- uploading embedded reviews to Zilliz Cloud
- runtime chatbox retrieval + answer generation

## 1. Install

```powershell
cd D:\LotusHack2026\LotusHacks2026\ai_service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 2. Configure

Copy `.env.example` to `.env` and fill in:

- `OPENAI_API_KEY`
- `ZILLIZ_URI`
- `ZILLIZ_TOKEN`

Use the cluster endpoint from Zilliz Cloud as `ZILLIZ_URI`, for example:

```text
https://in01-xxxxxxxxxxxx.aws-us-west-2.vectordb.zillizcloud.com:19542
```

Use your database token as `ZILLIZ_TOKEN`.

## 3. Offline ingest

This reads `data/data.json`, creates embeddings with OpenAI, writes them to a local JSON file, then uploads them to Zilliz.

```powershell
python -m app.ingest_reviews
```

## 4. Run API

```powershell
uvicorn app.main:app --reload --port 8090
```

## 5. Chat endpoint

```http
POST /api/assistant/messages
Content-Type: application/json

{
  "threadId": "default",
  "text": "I want a chill coffeeshop"
}
```

## Notes

- embeddings are generated offline, not during runtime ingestion
- runtime only embeds the user query, searches Zilliz, then calls OpenAI chat
- the response shape matches the frontend assistant API contract
