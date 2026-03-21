# UGC Video Ingestion Plan (Interface-First, Separate Files)

## Problem and approach
Add a new user-generated-content (UGC) pipeline without mutating legacy ingestion code paths. Keep implementation in separate files with explicit interfaces so provider/model swaps are low-risk and localized.

Approach:
- Build a new UGC module boundary under `backend/services/ugc/ugc/`
- Define stable interfaces (ports) for STT, OCR, judge/extractor, embed/index, storage, and job persistence
- Provide default adapters that wrap existing logic/models
- Keep output format backward compatible with current JSONL and Qdrant indexing flow

## Workplan
- [ ] Create UGC module folder and interface contracts
  - Files:
    - `ugc/contracts.py`
    - `ugc/types.py`
    - `ugc/errors.py`
  - Define core protocols/interfaces:
    - `VideoStorage`
    - `Transcriber`
    - `OcrExtractor`
    - `CharacteristicJudge`
    - `CharacteristicSerializer`
    - `VectorIndexer`
    - `JobRepository`

- [ ] Add UGC configuration surface (model/provider swap points)
  - Files:
    - `ugc/config.py`
  - Env-driven switches:
    - `UGC_STT_PROVIDER` (default: `groq_whisper`)
    - `UGC_STT_MODEL` (default: `whisper-large-v3-turbo`)
    - `UGC_OCR_PROVIDER` (default: `mistral_ocr`)
    - `UGC_OCR_MODEL` (default: `mistral-ocr-latest`)
    - `UGC_JUDGE_PROVIDER` (default: `mistral_chat`)
    - `UGC_JUDGE_MODEL` (default: `mistral-small-latest`)
    - `UGC_EMBED_PROVIDER` (default: `mistral_embed`)
    - `UGC_EMBED_MODEL` (default: `mistral-embed`)
    - `UGC_INDEX_COLLECTION` (default: `video_characteristics`)
  - Rule: business logic depends on interfaces only; provider binding in one composition module.

- [ ] Implement adapters in separate files
  - Files:
    - `ugc/adapters/stt_groq.py`
    - `ugc/adapters/ocr_mistral.py`
    - `ugc/adapters/judge_mistral.py`
    - `ugc/adapters/index_qdrant.py`
    - `ugc/adapters/storage_fs.py`
    - `ugc/adapters/repo_json.py` (or db-backed later)
  - Keep each adapter single-purpose and replaceable.

- [ ] Define canonical UGC data contracts
  - Files:
    - `ugc/schemas.py`
  - Request contract (`POST /api/ugc/videos`):
    - multipart `file`
    - fields: `poi_name`, `poi_city`, optional `poi_address`, optional `user_id`
  - Job response:
    - `job_id`, `video_id`, `status`, `created_at`
  - Characteristic JSONL contract (backward compatible + extension):
    - required: `video_id`, `characteristic`, `pipeline_version`
    - added metadata: `source="ugc"`, `user_id`, `upload_id`, `provider_map`, `created_at`

- [ ] Create orchestration service and composition root
  - Files:
    - `ugc/service.py` (workflow orchestration)
    - `ugc/composition.py` (wire interfaces to selected adapters)
  - Workflow:
    1. Validate upload and metadata
    2. Persist video via `VideoStorage`
    3. Run STT + OCR
    4. Judge/extract characteristic text
    5. Serialize JSONL row in canonical format
    6. Index into Qdrant via `VectorIndexer`
    7. Persist job result + trace metadata

- [ ] Expose API endpoints (separate router)
  - Files:
    - `ugc/router.py`
    - hook in existing app bootstrap with minimal surface change
  - Endpoints:
    - `POST /api/ugc/videos` (enqueue/process)
    - `GET /api/ugc/jobs/{job_id}`
  - Keep API isolated from legacy pipeline routes.

- [ ] Preserve compatibility with existing indexer format
  - Ensure `characteristic` field remains parseable by current `parse_characteristic_fields` pattern (`k=v ; ...`)
  - Keep `video_id` stable and deterministic naming (`video_<id>.mp4`)
  - Avoid changing existing `run_indexing` contract; add thin UGC call path.

- [ ] Add tests for interfaces and adapters
  - Contract tests for each interface implementation
  - End-to-end test: upload -> characteristic JSONL -> indexed document exists
  - Negative tests: empty transcript/OCR, rejected judge, provider failure, retry behavior

- [ ] Document extension and swap strategy
  - Where to add a new provider adapter
  - Required interface methods
  - Env variables to switch providers without changing orchestration logic

## Interface specifications (initial)
- `Transcriber.transcribe(video_path) -> TranscriptionResult`
  - `text: str`, `provider: str`, `model: str`, `segments: list[...]|None`
- `OcrExtractor.extract(video_path) -> OcrResult`
  - `text: str`, `provider: str`, `model: str`, `frame_count: int`
- `CharacteristicJudge.judge(meta, evidence) -> JudgeResult`
  - `accepted: bool`, `characteristic_vi: str`, `confidence: float`, `reason: str`, `evidence_quotes: list[str]`
- `VectorIndexer.index_characteristic(doc) -> IndexResult`
  - `collection: str`, `doc_id: str`, `point_id: str`, `indexed: bool`

## Compatibility and migration notes
- Do not refactor or remove legacy `datahandler` scripts initially.
- UGC module writes compatible JSONL so existing retrieval stack continues to work.
- New metadata keys must be additive; retrieval should ignore unknown keys.
- Keep model/provider defaults equal to current production behavior.

## Open decision points
- Sync vs async processing for `POST /ugc/videos`:
  - Default recommendation: async job model for reliability and retries.
- Job persistence backend:
  - Start with file/json repo adapter; later swap to Postgres with same `JobRepository` interface.
