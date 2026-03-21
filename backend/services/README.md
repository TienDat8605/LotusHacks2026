# Backend Services

Unified FastAPI service for:

- UGC endpoints
- AI assistant endpoints

## Install

```powershell
cd D:\LotusHack2026\LotusHacks2026\backend\services
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Configure

```powershell
Copy-Item .env.example .env
```

Fill in:

- `OPENAI_API_KEY`
- `ZILLIZ_URI`
- `ZILLIZ_TOKEN`
- `INTERFAZE_API_KEY` for UGC upload processing
- `OPENAI_API_KEY` and `QDRANT_URL` if you want UGC indexing enabled
- `ORS_API_KEY` or `VIETMAP_API_KEY` if you want uploaded records geocoded into `data/data.json`

## Offline embed + upload

```powershell
python -m app.ingest_reviews
```

## Run one FastAPI server

```powershell
uvicorn app.main:app --reload --port 8090
```

## Dedicated assistant testing

```powershell
.\test_assistant.ps1 -BaseUrl http://localhost:8090 -Query "I want a chill coffeeshop"
```
