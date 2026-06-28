# ClassicScan

A camera-first document scanner with on-device-friendly OCR. Capture a photo on
the phone, confirm the four corners, the backend perspective-warps and enhances
the page to scanner-grade quality, then runs OCR through one of two engines —
PyTesseract or a from-scratch classical pipeline. Results persist per user so
the same scans follow you across devices.

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

The pipeline is **printed-document-only**: there is no handwriting branch,
no classifier, and no mode selector. The two OCR engines only differ in how
they read the cleaned page.

## Stack

- **Frontend** — Expo / React Native, Expo Router, NativeWind, expo-camera,
  expo-file-system, expo-secure-store, expo-sharing, expo-clipboard,
  react-native-svg, react-native-gesture-handler.
- **Backend** — FastAPI, SQLAlchemy 2.0, Postgres (psycopg2), OpenCV,
  Tesseract via pytesseract, scikit-learn (RandomForest + K-Means),
  scikit-image, Pillow, joblib, python-docx, pypdf, python-jose,
  passlib (bcrypt).

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
      scan.py        extract / preview / detect / pdf / docx / history / asset
    schemas/         pydantic request + response schemas
    services/
      storage.py     on-disk asset layout (raw, enhanced, pdf, docx)
  ml/
    pipeline.py             orchestrator: decode -> detect -> warp -> enhance -> OCR
    detector.py             document quad detection + perspective warp + deskew/orient
    enhancer.py             grayscale + binarised paths for OCR
    scanner_enhance.py      user-visible enhance modes (color, gray, bw, magic)
    ocr.py                  PyTesseract wrappers + spell check
    ocr_from_scratch.py     classical CV + RandomForest OCR engine
    train_from_scratch.py   offline trainer for the from-scratch model
    models/                 trained from-scratch model artifact
    _textstats.py           text-height + connected-component utilities
    rules.py                horizontal-rule removal helper (used by detector)
    eval/                   offline evaluation harness
    eval/benchmark.py       latency + accuracy benchmark script
  Dockerfile                Docker image for production deployment
  storage/           runtime data: <user_id>/<scan_id>/{raw,enhanced,pdf,docx}
  tests/             pytest suite (pipeline shape + EXIF + engine round-trip)

frontend/
  app/
    _layout.tsx        Expo Router root, theme + auth gate
    welcome.tsx        unauthenticated landing
    sign-in.tsx
    sign-up.tsx
    (tabs)/
      _layout.tsx      bottom-tab layout
      index.tsx        redirect helper
      home.tsx         scan entry + recents
      history.tsx      full scan history with search
    camera-scan.tsx    camera with static A4 framing bracket
    adjust-corners.tsx manual quad confirmation (every scan goes through this)
    scan-preview.tsx   live enhancement preview, mode picker
    processing.tsx     blocking progress while /scan/extract runs
    ocr-result.tsx     final scan view: text, image, share/save
  components/          shared UI primitives (Button, Card, Eyebrow, etc.)
  lib/
    api.ts             HTTP client for backend endpoints
    auth.ts            JWT + user persistence (SecureStore / localStorage)
    store.ts           in-memory cache mirroring server scans
    types.ts           shared frontend types
  constants/theme.ts   design tokens
```

## End-to-end scan flow

1. **Sign in** (`sign-in.tsx` or `sign-up.tsx`).
   `POST /auth/signin` returns `{ access_token, user }`. The token is written
   to `expo-secure-store` (or `localStorage` on web). Every subsequent scan
   request sends `Authorization: Bearer <jwt>`.

2. **Tap SCAN** on the home tab → `camera-scan.tsx`.
   The screen renders a 3:4 portrait camera region with a centered A4-shaped
   bracket purely as a framing guide. On shutter the full sensor JPEG is
   passed straight through — no client-side cropping.

3. **Adjust corners** (`adjust-corners.tsx`).
   Every scan goes through manual corner confirmation. On mount the screen
   calls `POST /scan/detect` to seed the four handles from auto-detection
   (or a centred 80% rectangle if detection fails); the user drags any
   corners that need correcting and taps **Continue**, which forwards the
   resulting quad as a `quad_override` route param. There is no auto bypass.

4. **Scan preview** (`scan-preview.tsx`).
    The screen calls `POST /scan/preview` with the image, the current
    `enhance_mode`, and the `quad_override` from step 3. The backend skips
    its own detector and warps using the user-supplied corners, then runs
    the rest of the ML pipeline (resize, orient/deskew, enhance) but
    **skips OCR**, returning just the enhanced image bytes. The user picks
    one of Color / Gray / B&W / Magic. The OCR engine defaults to
    "From Scratch" and can be changed later on the result screen.

5. **Tap "Extract & save"** → `processing.tsx`.
   Same image is uploaded once more, this time to `POST /scan/extract`,
   along with `quad_override`, `enhance_mode`, and `ocr_engine`. The
   backend reuses the supplied corners, runs the pipeline with OCR
   enabled, persists the raw + enhanced assets to disk, persists the row
   in `scans`, and returns the full `ScanRecord` (text, words,
   confidence, asset URLs, engine used). The frontend store
   (`lib/store.ts`) inserts the new record into its in-memory cache so
   the list views update instantly.

6. **OCR result** (`ocr-result.tsx`).
   Shows the enhanced image, OCR text, confidence, and engine used.
   Buttons:
   - **Copy** — `expo-clipboard`.
   - **Share text** — writes a `.txt` to the cache and opens the OS share
     sheet via `expo-sharing`.
   - **Save / Open PDF** — first time, calls `POST /scan/{id}/pdf` to
     generate and persist a PDF (searchable when confidence is high
     enough), then downloads + shares it. Subsequent taps skip generation.
   - **Save / Open DOCX** — same flow against `POST /scan/{id}/docx`,
     embedding the enhanced image and extracted text.
   - **Engine pill row** — calls `POST /scan/{id}/reprocess` with the
     other engine to compare results on the same scan.

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
   Builds an edge map (Canny + Sobel + top-hat OR'd together), finds quad
   candidates from contours and from line-pair intersections, scores each
   on edge strength, area, centrality, interior text density, and
   right-angle quality, picks the best. Skipped when the request supplies
   a `quad_override` from `adjust-corners.tsx`; the user-confirmed corners
   are used directly.
2. **Perspective warp** — `detector.warp_to_document`.
   `_order_quad` canonicalises corners as TL→TR→BR→BL via sum/diff heuristic,
   then `cv2.getPerspectiveTransform` + `cv2.warpPerspective` rectifies the
   page to a tight rectangle. If detection fails the original image is used.
3. **Resize cap** — long edge clamped to `PIPELINE_MAX_EDGE = 2200 px` to
   keep the enhancer + OCR within client timeout budgets.
4. **Auto-orient + deskew + DPI normalise**.
   `detector.auto_orient` runs Tesseract OSD to fix 90°/180°/270° rotations,
   `detector.deskew` corrects sub-degree tilt, `detector.normalize_dpi`
   rescales so the median text x-height matches a target.
5. **Enhancer for OCR** — `enhancer.grayscale_path` and
   `enhancer.binarized_path` produce two clean grayscale variants used as
   OCR inputs.
6. **OCR** — `ocr.run_printed` (PyTesseract) or
   `ocr_from_scratch.run_printed` (classical CV + RandomForest), selected
   by the `ocr_engine` form field. The from-scratch engine transparently
   falls back to PyTesseract when its model artifact is missing on disk.

   **From-scratch engine details** (~700 lines, no neural networks, no
   Tesseract, no third-party OCR library):
   - `_bw_inverted` — reuse `enhancer.binarized_path`'s output, invert
     so ink = 255. Adaptive-threshold if not already binary.
   - `_clean_bw` — remove small speckle noise; drops CCs tiny in both
     area and dimensions relative to median CC height.
   - `_segment_lines` — horizontal projection profile, threshold valleys
     at `max(0.04, mean × 0.35)`, merge bands separated by ≤ 2 px.
   - `_segment_words` — connected-component spans per line strip, merge
     overlapping spans, compute inter-cluster gaps, adaptive threshold
     based on IQR of gap sizes: `Q25 + 0.5 × IQR`, clamped between
     `0.15 × h` and `0.5 × h`. Adapts to any font size.
   - `_segment_chars` — `cv2.connectedComponentsWithStats` per word strip.
     Morphological close reconnects thin broken strokes. All CCs (including
     tiny dots like i-dots) are fed into `_merge_dots_to_stems`:
     dots are reattached to nearby stems above them (fixes systematic
     i→l and j→] errors). Wide CCs are equally sliced into sub-boxes.
   - `char_features` (172 dims) — HOG 144 dims, zoning 16 dims, crossing
     counts 6 dims, Euler-number hole count 1 dim, shape 3 dims (aspect,
     fill fraction, relative height within line). Relative height is key
     for distinguishing uppercase from lowercase.
   - `_case_correct_word` — post-classification heuristic: if > 60% of
     alpha chars in a word are uppercase and word length > 2, lowercase
     low-confidence uppercase chars after the first position.
   - Classifier: `RandomForestClassifier(n_estimators=200,
     class_weight="balanced_subsample")`.

   **Engine comparison** — evaluated with `ml/eval/evaluate.py` against
   human-transcribed ground truth (`.gt.txt` files beside each test image).
   Test images: `test.jpg` (Chapter I of Alice's Adventures in Wonderland,
   clean printed book page, 1789×2363 px) and `test2.jpg` (Introduction
   of Raggedy Ann Stories, clean printed book page, 1752×2646 px).
   Confidence is `mean_conf` from the pipeline (Tesseract per-word
   confidence avg, or from-scratch `argmax(predict_proba)×100` avg across
   characters). CER = `Levenshtein.distance(ref, hyp) / len(ref)`.
   WER = same at word level.

   | Metric           | PyTesseract | From-scratch |
   |------------------|-------------|--------------|
   | Avg confidence   | 94.95       | 47.28        |
   | Avg CER          | 0.006       | 0.587        |
   | Avg WER          | 0.006       | 0.587        |
   | Avg OCR time (ms)| 7204        | 29750        |
   | Avg total (ms)   | 11891       | 34619        |

   Per-image:

   | Image     | Engine       | Total (ms) | OCR (ms) | Conf  | CER   | WER   |
   |-----------|--------------|------------|----------|-------|-------|-------|
   | test.jpg  | pytesseract  | 10405±224  | 6870±129 | 95.30 | 0.003 | 0.003 |
   | test.jpg  | from_scratch | 33984±711  | 30306±776| 59.39 | 0.425 | 0.423 |
   | test2.jpg | pytesseract  | 13377±120  | 7538±73  | 94.59 | 0.009 | 0.009 |
   | test2.jpg | from_scratch | 35253±320  | 29193±116| 35.18 | 0.750 | 0.752 |

   PyTesseract benefits from a language model and LSTM-based recognition.
   The from-scratch engine classifies each character independently — no
   sequence model, no dictionary — so ambiguous glyphs are decided on
   shape alone. This hurts most on real scanned pages where binarization
   artifacts break strokes and blur character boundaries.
7. **User-visible enhancement** — `scanner_enhance.enhance(warped, mode)`
   produces the final image the user sees. Modes:
   - `color` — shadow-removed white-balanced image.
   - `gray` — grayscale variant of the same.
   - `bw` — adaptive binarisation.
   - `magic` — saturated + sharpened color for receipts and faded paper.
8. **Encode** — `scanner_enhance.encode` returns JPEG (or PNG for `bw`)
   bytes plus mime.

`PipelineResult` carries everything: text, words, confidence, mean_conf,
psm_used, ocr_engine_used, encoded enhanced bytes, and a `timing_ms` dict
with per-stage wall-clock times (detect_warp, orient_deskew_dpi,
ocr_enhance, ocr, total). The router copies the parts it needs onto the
`Scan` row and writes the bytes to disk.

## API surface

All `/scan/*` endpoints require `Authorization: Bearer <jwt>`.

| Method | Path                          | Description                                      |
|--------|-------------------------------|--------------------------------------------------|
| POST   | `/auth/signup`                | Create account, returns `{ access_token, user }` |
| POST   | `/auth/signin`                | Sign in, returns `{ access_token, user }`        |
| GET    | `/auth/me`                    | Current user                                     |
| POST   | `/scan/extract`               | Full pipeline + persist a single scan            |
| POST   | `/scan/preview`               | Pipeline without OCR; returns enhanced bytes     |
| POST   | `/scan/detect`                | Read-only document-quad detection (seeds the manual-crop screen) |
| POST   | `/scan/pdf`                   | Multi-page PDF without DB write                  |
| POST   | `/scan/{id}/pdf`              | Generate and attach a PDF to an existing scan    |
| POST   | `/scan/{id}/docx`             | Generate and attach a DOCX to an existing scan   |
| POST   | `/scan/{id}/reprocess`        | Re-run pipeline with a new enhance mode / engine |
| GET    | `/scan/history`               | List the current user's scans                    |
| GET    | `/scan/{id}`                  | Single scan with asset URLs                      |
| GET    | `/scan/{id}/asset/{kind}`     | Stream raw / enhanced / pdf / docx bytes         |
| DELETE | `/scan/{id}`                  | Delete a scan and its on-disk assets             |
| GET    | `/health`                     | Health probe (DB connectivity)                   |
| GET    | `/`                           | API banner                                       |

Form fields and response shapes are documented at `/docs` (FastAPI generates
the schema). Notable validations:

- `enhance_mode` must be one of `original | color | gray | bw | magic`.
- `ocr_engine` must be one of `pytesseract | from_scratch`.
- `quad_override` must be a JSON array of four `[x, y]` pairs in
  EXIF-corrected image-pixel coordinates.
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
      scan.docx          optional generated DOCX
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
- `enhance_mode`, `ocr_engine`, `language`.
- `mean_conf`, `psm_used`, `document_detected`, `detection_score`,
  `confidence_warning`.
- `text` (full OCR output).
- `quad` (JSON `[[x,y], …]` four corner points used for the perspective warp; preserved across reprocess).
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
- `attachPdf` / `attachDocx` / `reprocessScan` / `removeScan` mirror their
  server endpoints and update the cache on success.
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

Train the from-scratch OCR model (one-time, ~90 s on CPU):

```powershell
python -m ml.train_from_scratch
```

This writes `ml/models/from_scratch_ocr.joblib`. The trainer loads up to
31 system truetype fonts (regular, bold, italic), renders each character
at 5 sizes {20, 26, 32, 40, 48}, augments each glyph 6× (rotation,
dilate/erode, blur, noise, plus stroke-breaking augmentation that erases
random horizontal/vertical strips to simulate binarization artifacts),
then fits a 200-estimator RandomForest. Recent run: 89 classes, 143,543
samples, val_acc 0.958. Without it, requests that pick the from-scratch
engine transparently fall back to PyTesseract.

Run the API:

```powershell
uvicorn app.main:app --reload --port 23000
```

For phones on your LAN, bind to all interfaces:

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 23000
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

### Benchmarking

Run per-stage latency and accuracy benchmarks on the test images:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m ml.eval.benchmark
```

Results are written to stdout. See `ml/eval/BENCHMARK.md` for the latest
baseline. The benchmark script collects wall-clock times from
`PipelineResult.timing_ms` at 5 checkpoints (detect_warp,
orient_deskew_dpi, ocr_enhance, ocr, total) plus confidence, CER, and WER.

### Debugging the ML pipeline

Set `OCR_DEBUG=1` in the backend environment and hit `/scan/preview` or
`/scan/extract`. Per-stage images are written to
`backend/ml/debug/<unix_ts>_<hex>/`:

```
00_input.jpg            backend's view of the uploaded JPEG
02_quad_overlay.jpg     detected (or override) quad drawn on input
03_warped.jpg           output of warp_to_document
04_oriented.jpg         after auto_orient
05_deskewed.jpg         after deskew
06_dpi_normalized.jpg   after normalize_dpi
07_gray_path.jpg        OCR-grayscale variant
08_binary_path.jpg      OCR-binarised variant
10_enhanced_<mode>.jpg  user-visible enhancer output
meta.json               detection scores, OCR alternatives, engine used
```

## Deployment (Docker)

The backend ships with a `Dockerfile` and a `docker-compose.yml` at the repo
root for production deployment.

### Dockerfile (`backend/Dockerfile`)

- Base: `python:3.11-slim`.
- Installs Tesseract OCR (English), OpenCV system deps (`libgl1`, etc.).
- Multi-stage not required — image is ~1.2 GB compressed.
- Exposes port 23000.

### docker-compose.yml

```yaml
services:
  classicscan:
    build: ./backend
    ports:
      - "23000:23000"
    env_file: ./backend/.env
    volumes:
      - classicscan_storage:/app/storage
    restart: unless-stopped
```

### Production steps

1. Copy and configure environment:
   ```bash
   cp backend/.env.example backend/.env
   # Edit: DATABASE_URL (use managed Postgres like Neon/Supabase),
   #       SECRET_KEY (generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`),
   #       CORS_ORIGINS (your frontend domain)
   ```

2. Build and start:
   ```bash
   docker compose up -d --build
   docker compose logs -f   # verify health
   ```

3. The from-scratch model is baked into the image (`ml/models/`). To
   retrain on the server:
   ```bash
   docker compose exec classicscan python -m ml.train_from_scratch
   ```

No PostgreSQL container is included — the backend uses an **external**
managed database (Neon, Supabase, etc.) specified via `DATABASE_URL`.

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
- **Phone can't reach the backend** — bind uvicorn with `--host 0.0.0.0`,
  point `EXPO_PUBLIC_API_URL` at your machine's LAN IP (e.g.
  `http://192.168.1.42:23000`), and add the same origin to `CORS_ORIGINS`.
- **Auto-detect fails on a scan** — the manual-corner-adjust screen will
  fall back to a centred 80% rectangle; drag the corners into place. To
  inspect server-side detection, set `OCR_DEBUG=1` and look at
  `02_quad_overlay.jpg`.
- **Manual crop lands in the wrong place** — was caused by EXIF
  orientation mismatch between iOS captures and `cv2.imdecode`. All
  decodes now go through `pipeline._decode` (Pillow + `exif_transpose`).
  If the symptom returns, set `OCR_DEBUG=1` and verify `00_input.jpg`
  matches the orientation the user saw on the camera screen.
- **From-scratch engine returns empty text** — the model artifact is
   missing. Run `python -m ml.train_from_scratch` from `backend/` to
   build `ml/models/from_scratch_ocr.joblib`. If the engine returns text
   but with many errors, this is expected — the classical CV pipeline
   has no language model and struggles with noise, touching characters,
   and case disambiguation. Use PyTesseract for higher accuracy.
