# UGC Service

Standalone FastAPI service for UGC video upload and Interfaze-powered extraction.

## Run

```bash
cd backend/services/ugc
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8001
```

## Required env

```env
INTERFAZE_API_KEY=your_key
INTERFAZE_BASE_URL=https://api.interfaze.ai/v1
UGC_STT_MODEL=interfaze-beta
UGC_OCR_MODEL=interfaze-beta
UGC_JUDGE_MODEL=interfaze-beta
```

Optional:

- `UGC_STORAGE_PATH`
- `UGC_JOBS_PATH`
- `UGC_OCR_FRAME_INTERVAL`
- `UGC_OCR_MAX_FRAMES`
- `MISTRAL_API_KEY` if you also want vector indexing enabled
- `QDRANT_URL` and `QDRANT_API_KEY` for Qdrant indexing

## Frontend

Point the frontend UGC calls at this service:

```env
VITE_UGC_API_BASE_URL=http://localhost:8001
```
