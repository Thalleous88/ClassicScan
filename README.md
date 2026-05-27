# ClassicScan

A camera-first document scanner with on-device-friendly OCR. Capture a photo on
the phone, the backend auto-detects the document, perspective-warps it,
enhances it to scanner-grade quality, and runs Tesseract OCR. Results persist
per user so the same scans follow you across devices.

```
+-------------+          +---------+         +----------------+
|  Expo / RN  | <------> |  HTTPS  | <-----> |  FastAPI       |
|  (frontend) |   JSON   |  + JWT  |         |  + OpenCV      |
|             |          |         |         |  + Tesseract   |
+-------------+          +---------+         +----------------+
                                                       |
                                                       v
                                              +----------------+
                                              |  Postgres      |
                                              |  + on-disk     |
                                              |    storage     |
                                              +----------------+
```

## Stack

- **Frontend** — Expo / React Native, Expo Router, NativeWind, expo-camera,
  expo-file-system, expo-secure-store, expo-sharing, expo-clipboard.
- **Backend** — FastAPI, SQLAlchemy 2.0, Postgres (psycopg2), OpenCV,
  Tesseract via pytesseract, Pillow, pypdf, python-jose, passlib (bcrypt).

## Repository layout

```
backend/
  app/
    core/            settings (pydantic-settings), env loading
    db/              SQLAlchemy engine + session
    dependencies.py  FastAPI deps: get_db, get_current_user
    main.py          app factory, lifespan, CORS, router wiring
    model/           SQLAlchemy models (User, Scan, enums)
    routers/
      auth.py        signup / signin / me
      scan.py        extract / preview / detect / pdf / history / asset
    schemas/         pydantic request + response schemas
    services/
      storage.py     on-disk asset layout (raw, enhanced, pdf)
  ml/
    pipeline.py      orchestrator: detect -> warp -> classify -> enhance -> OCR
    detector.py      document quad detection + perspective warp + deskew/orient
    classify.py      printed vs. handwriting classifier
    enhancer.py      grayscale / binarised / handwriting paths for OCR
    scanner_enhance.py  user-visible enhance modes (color, gray, bw, magic)
    ocr.py           Tesseract wrappers + spell check
    rules.py         horizontal-rule removal helper
    _textstats.py    text-height + connected-component utilities
    eval/            offline evaluation harness
  storage/           runtime data: <user_id>/<scan_id>/{raw,enhanced,pdf}
  tests/             pytest suite (pipeline shape + invariants)

frontend/
  app/
    _layout.tsx      Expo Router root, theme + auth gate
    welcome.tsx      unauthenticated landing
    sign-in.tsx
    sign-up.tsx
    (tabs)/
      _layout.tsx    bottom-tab layout
      index.tsx      redirect helper
      home.tsx       scan entry + recents
      history.tsx    full scan history with search
    camera-scan.tsx  camera with static A4 framing bracket
    adjust-corners.tsx manual quad confirmation (every scan goes through this)
    scan-preview.tsx live enhancement preview, mode + engine picker
    processing.tsx   blocking progress while /scan/extract runs
    ocr-result.tsx   final scan view: text, image, share/save
  components/        shared UI primitives (Button, Card, Eyebrow, etc.)
  lib/
    api.ts           HTTP client for backend endpoints
    auth.ts          JWT + user persistence (SecureStore / localStorage)
    store.ts         in-memory cache mirroring server scans
    types.ts         shared frontend types
  constants/theme.ts design tokens
```

## End-to-end scan flow

1. **Sign in** (`sign-in.tsx` or `sign-up.tsx`).
   `POST /auth/signin` returns `{ access_token, user }`. The token is written
   to `expo-secure-store` (or `localStorage` on web). Every subsequent scan
   request sends `Authorization: Bearer <jwt>`.

2. **Tap SCAN** on the home tab → `camera-scan.tsx`.
   The screen renders a 3:4 portrait camera region with a centered A4-shaped
   bracket purely as a framing guide. On shutter the full sensor JPEG is
   passed straight through — no client-side cropping, no live edge overlay.

3. **Adjust corners** (`adjust-corners.tsx`).
   Every scan goes through manual corner confirmation before extraction.
   On mount the screen calls `POST /scan/detect` to seed the four handles
   from auto-detection (or a centred 80% rectangle if detection fails),
   the user drags any corners that need correcting, and tapping
   **Continue** forwards the resulting quad as a `quad_override` route
   param. There is no auto bypass — the user always confirms the four
   corners.

4. **Scan preview** (`scan-preview.tsx`).
   The screen calls `POST /scan/preview` with the image, the current
   `enhance_mode`, and the `quad_override` from step 3. The backend
   skips its own detector and warps using the user-supplied corners,
   then runs the rest of the ML pipeline (resize, classify, enhance)
   but **skips OCR**, returning just the enhanced image bytes. The user
   picks one of Color / Gray / B&W / Magic, then picks an OCR engine
   (From Scratch or PyTesseract) for the next step.

5. **Tap "Extract & save"** → `processing.tsx`.
   Same image is uploaded once more, this time to `POST /scan/extract`,
   along with `quad_override`, `enhance_mode`, and `ocr_engine`. The
   backend reuses the supplied corners, runs the pipeline with OCR
   enabled, persists the raw + enhanced assets to disk, persists the
   row in `scans`, and returns the full `ScanRecord` (text, words,
   confidence, asset URLs, engine used). The frontend store
   (`lib/store.ts`) inserts the new record into its in-memory cache so
   the list views update instantly.

6. **OCR result** (`ocr-result.tsx`).
   Shows the enhanced image, OCR text, confidence, pipeline path, and
   engine used. Buttons:
   - **Copy** — `expo-clipboard`.
   - **Share text** — writes a `.txt` to the cache and opens the OS share
     sheet via `expo-sharing`.
   - **Save / Open PDF** — first time, calls `POST /scan/{id}/pdf` to
     generate and persist a PDF (searchable when the printed-text confidence
     is high enough), then downloads + shares it. Subsequent taps skip
     generation.
   - **Reprocess** — `POST /scan/{id}/reprocess` with a different pipeline
     mode (auto / printed / handwriting) or a different OCR engine; rewrites
     text + enhanced asset.

7. **History** (`(tabs)/history.tsx`).
   `GET /scan/history` returns a paginated list. Tapping a row navigates back
   to `ocr-result.tsx` for the selected scan.

## Backend ML pipeline

`ml/pipeline.run_from_array(image_bgr, ...)` is the single entrypoint. Both
`/scan/preview` and `/scan/extract` call into it. Bytes are decoded once by
`pipeline._decode` using Pillow's `ImageOps.exif_transpose`, which honours
the EXIF orientation tag phones add to portrait captures. Every later
stage sees a single canonical pixel grid that matches what the device
shows on screen. Stages:

1. **Document detection** — `detector.detect_document(image_bgr)`.
   Builds an edge map (Canny + Hough), finds quad candidates from contours
   and from line-pair intersections, scores each on edge strength, area,
   centrality, interior text density, and right-angle quality, picks the
   best. Skipped when the request supplies a `quad_override` from
   `adjust-corners.tsx`; the user-confirmed corners are used directly.
2. **Perspective warp** — `detector.warp_to_document`.
   `_order_quad` canonicalises corners as TL→TR→BR→BL via sum/diff heuristic,
   then `cv2.getPerspectiveTransform` + `cv2.warpPerspective` rectifies the
   page to a tight rectangle. If detection fails the original image is used.
3. **Resize cap** — long edge clamped to `PIPELINE_MAX_EDGE = 2200 px` to
   keep the enhancer + OCR within client timeout budgets.
4. **Mode routing** — `classify.classify(warped)` predicts printed vs.
   handwriting. The router accepts `mode` of `auto | printed | handwriting`;
   `auto` falls back to the classifier with a borderline band (0.45..0.65)
   that runs both OCR paths and picks the higher-confidence result.
5. **Auto-orient + deskew + DPI normalise** (printed only).
   `detector.auto_orient` runs Tesseract OSD to fix 90°/180°/270° rotations,
   `detector.deskew` corrects sub-degree tilt, `detector.normalize_dpi`
   rescales so the median text x-height matches a target.
6. **Enhancer for OCR** — `enhancer.grayscale_path` and
   `enhancer.binarised_path` produce two clean grayscale variants used as
   Tesseract inputs. Handwriting uses `enhancer.handwriting_path`.
7. **OCR** — `ocr.run_printed` / `ocr.run_handwriting`. Each runs Tesseract
   over the candidate inputs at multiple PSMs, picks the result with the
   highest mean word confidence, and applies a SymSpell pass when
   `spell_check=True`.
8. **User-visible enhancement** — `scanner_enhance.enhance(warped, mode)`
   produces the final image the user actually sees. Modes:
   - `color` — shadow-removed white-balanced image.
   - `gray` — grayscale variant of the same.
   - `bw` — adaptive binarisation.
   - `magic` — saturated + sharpened color for receipts and faded paper.
9. **Encode** — `scanner_enhance.encode` returns JPEG (or PNG for `bw`)
   bytes plus mime.

`PipelineResult` carries everything: text, words, confidence, mean_conf,
psm_used, pipeline_path, handwriting flags, and the encoded enhanced bytes.
The router copies the parts it needs onto the `Scan` row and writes the bytes
to disk.

## API surface

All `/scan/*` endpoints require `Authorization: Bearer <jwt>`.

| Method | Path                          | Description                                      |
|--------|-------------------------------|--------------------------------------------------|
| POST   | `/auth/signup`                | Create account, returns `{ access_token, user }` |
| POST   | `/auth/signin`                | Sign in, returns `{ access_token, user }`        |
| GET    | `/auth/me`                    | Current user                                     |
| POST   | `/scan/extract`               | Full pipeline + persist a single scan            |
| POST   | `/scan/preview`               | Pipeline without OCR; returns enhanced bytes     |
| POST   | `/scan/detect`                | Read-only document-quad detection (debug aid)    |
| POST   | `/scan/pdf`                   | Multi-page PDF without DB write                  |
| POST   | `/scan/{id}/pdf`              | Generate and attach a PDF to an existing scan    |
| POST   | `/scan/{id}/reprocess`        | Re-run pipeline with a new mode/enhance          |
| GET    | `/scan/history`               | List the current user's scans                    |
| GET    | `/scan/{id}`                  | Single scan with asset URLs                      |
| GET    | `/scan/{id}/asset/{kind}`     | Stream raw / enhanced / pdf bytes                |
| DELETE | `/scan/{id}`                  | Delete a scan and its on-disk assets             |
| GET    | `/health`                     | Health probe (DB connectivity)                   |
| GET    | `/`                           | API banner                                       |

Form fields and response shapes are documented at `/docs` (FastAPI generates
the schema). Notable validations:

- `mode` must be one of `auto | printed | handwriting`.
- `enhance_mode` must be one of `original | color | gray | bw | magic`.
- Uploads are capped at `MAX_UPLOAD_BYTES` (default 25 MiB).
- PDF endpoints reject more than `MAX_PDF_PAGES` pages (default 10).

## Storage layout

Per-user, per-scan directories under `STORAGE_DIR`:

```
<STORAGE_DIR>/
  <user_id>/
    <scan_id>/
      raw.jpg            captured image bytes
      enhanced.jpg|.png  scanner-grade enhancement
      scan.pdf           optional generated PDF
```

Paths are validated to never escape `<STORAGE_DIR>` (`storage.read_bytes`
raises `PermissionError` on traversal). Deleting a scan recursively removes
the directory.

## Database schema

Two tables, both created automatically at startup via
`Base.metadata.create_all`:

`users`
- `user_id` PK, `username` (unique), `password_hash` (bcrypt), `role`,
  `created_at`.

`scans`
- `id` UUID PK, `user_id` FK → `users.user_id` (cascade), `created_at`.
- `name`, `original_filename`, `bytes_size`.
- `mode`, `enhance_mode`, `pipeline_path`, `ocr_engine`, `language`.
- `mean_conf`, `psm_used`, `document_detected`, `detection_score`,
  `handwriting_detected`, `handwriting_confidence`, `confidence_warning`.
- `text` (full OCR output).
- `raw_path`, `enhanced_path`, `enhanced_mime`, `pdf_path`, `docx_path`.

There are no migrations; alembic is listed in `requirements.txt` but
unused. Schema changes require either dropping the dev DB or running
manual `ALTER TABLE` against the existing one.

## Frontend state model

`lib/auth.ts` keeps a small `AuthState` (`{ loaded, token, user }`) and
hydrates from `expo-secure-store` (or `localStorage` on web) on first
render. `useAuth()` subscribes via `useSyncExternalStore`. `setSession`
and `signOut` write through to secure storage and notify subscribers.

`lib/store.ts` mirrors the server's view of the user's scans:
- `scans: ScanSummary[]` — list view.
- `details: Record<scanId, ScanRecord>` — full payloads.
- `refreshScans` calls `/scan/history`.
- `loadScan(id)` calls `/scan/{id}` and caches.
- `createScan(uri, opts)` wraps `extractText`, then optimistically inserts
  the new record into `scans` and `details`.
- `attachPdf` / `reprocessScan` / `removeScan` mirror their server
  endpoints and update the cache on success.
- `fetchAssetToCache(scanId, kind)` is a thin wrapper around
  `downloadAsset` that writes to the local file cache for sharing.

`lib/api.ts` is the only place that touches `fetch`. It returns a discriminated
`ApiResult<T> = { ok: true, data: T } | { ok: false, error }` so callers
never have to wrap requests in try/catch. 401s clear the session.

## Configuration

Backend `.env` (read by `app/core/config.py` via pydantic-settings):

| Var                  | Required | Notes                                                |
|----------------------|----------|------------------------------------------------------|
| `DATABASE_URL`       | yes      | e.g. `postgresql+psycopg2://user:pw@host:5432/db`    |
| `SECRET_KEY`         | yes      | strong random; rejects `changeme`/`secret`/`classicscan` |
| `PORT`               | no       | default `23000`                                      |
| `CORS_ORIGINS`       | no       | comma-separated list, or `*` for dev                 |
| `MAX_UPLOAD_BYTES`   | no       | default `26214400` (25 MiB)                          |
| `MAX_PDF_PAGES`      | no       | default `10`                                         |
| `STORAGE_DIR`        | no       | default `./storage` (relative to `backend/`)         |
| `TESSERACT_PATH`     | Windows  | absolute path to `tesseract.exe` if not on PATH      |
| `OCR_LANG`           | no       | default `eng`                                        |
| `OCR_DEBUG`          | no       | `1` to dump per-stage images to `ml/debug/`          |

Frontend `.env`:

| Var                   | Notes                                              |
|-----------------------|----------------------------------------------------|
| `EXPO_PUBLIC_API_URL` | Base URL of the backend. Defaults to `http://localhost:23000`. |

## Development

### Prerequisites

- Node.js 20.19+ and npm 10+.
- Python 3.10+.
- PostgreSQL 14+ running locally or reachable on the LAN.
- Tesseract OCR with English language pack:
  - Windows: install from the UB-Mannheim build and set `TESSERACT_PATH`.
  - macOS: `brew install tesseract`.
  - Linux: `sudo apt install tesseract-ocr`.

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -r requirements-dev.txt   # optional, for tests / lint
copy .env.example .env
# edit .env (DATABASE_URL, SECRET_KEY, CORS_ORIGINS, TESSERACT_PATH)
```

Create the database once:

```sql
CREATE DATABASE classicscan;
CREATE USER classicscan WITH PASSWORD 'secret';
GRANT ALL PRIVILEGES ON DATABASE classicscan TO classicscan;
```

Run the API:

```powershell
uvicorn app.main:app --reload --port 23000
```

Smoke checks:
- `GET http://localhost:23000/health` → `{"status":"ok","db":"ok"}`.
- Interactive docs at `http://localhost:23000/docs`.

### Frontend

```powershell
cd frontend
npm install
copy .env.example .env

npm start
```

Open Expo Go on a device, or press `i` / `a` for the simulator.

### Tests

Backend pytest suite:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest -q
```

Frontend type-check:

```powershell
cd frontend
npx tsc --noEmit
```

### Debugging the ML pipeline

Set `OCR_DEBUG=1` in the backend environment and hit `/scan/preview` or
`/scan/extract`. Per-stage images are written to
`backend/ml/debug/<unix_ts>_<hex>/`:

```
00_input.jpg            backend's view of the uploaded JPEG
02_quad_overlay.jpg     detected quad drawn on input
03_warped.jpg           output of warp_to_document
04_oriented.jpg         after auto_orient (printed path)
05_deskewed.jpg         after deskew
06_dpi_normalized.jpg   after normalize_dpi
07_gray_path.jpg        OCR-grayscale variant
08_binary_path.jpg      OCR-binarised variant
09_handwriting_path.jpg handwriting OCR variant
10_enhanced_<mode>.jpg  user-visible enhancer output
meta.json               detection scores, classifier signals, OCR alts
```

## Troubleshooting

- **`pydantic_core.ValidationError: SECRET_KEY must be set ...`** — set
  `SECRET_KEY` in `backend/.env` to a strong random value. Generate one with
  `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
- **`psycopg2.OperationalError`** — Postgres is not reachable, or
  `DATABASE_URL` is wrong. Check host/port/credentials. The backend's
  `lifespan` will refuse to start if the DB isn't reachable.
- **`pytesseract.TesseractNotFoundError`** — set `TESSERACT_PATH` (Windows),
  or install the package via your OS package manager.
- **CORS errors in the browser** — add the dev URL to `CORS_ORIGINS` and
  restart the backend.
- **Phone can't reach the backend** — point `EXPO_PUBLIC_API_URL` at your
  machine's LAN IP (e.g. `http://192.168.1.42:23000`) and add the same
  origin to `CORS_ORIGINS`.
- **Auto-detect fails on a scan** — set `OCR_DEBUG=1` and inspect
  `02_quad_overlay.jpg`. Common causes: low-contrast page edges, hand or
  finger occluding a corner, page filling the entire frame so detection
  finds the camera frame instead of the document.
- **Manual crop lands in the wrong place** — was caused by EXIF
  orientation mismatch between iOS captures and `cv2.imdecode`. All
  decodes now go through `pipeline._decode` (Pillow + `exif_transpose`).
  If the symptom returns, set `OCR_DEBUG=1` and verify `00_input.jpg`
  matches the orientation the user saw on the camera screen.
- **OCR text looks rotated** — auto-orient runs Tesseract OSD; very short
  documents may not have enough text for OSD to lock on. Try the
  handwriting mode (skips orient) or capture a sharper photo.

## License

Private project. Do not redistribute.
