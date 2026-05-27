import { Directory, File, Paths } from 'expo-file-system';

import { getToken, signOut } from './auth';
import type {
  ApiResult,
  AssetKind,
  AuthResponse,
  DetectResult,
  EnhanceMode,
  OcrEngine,
  PipelineMode,
  Quad,
  ScanRecord,
  ScanSummary,
} from './types';

const API_URL =
  (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:23000').replace(/\/+$/, '');

const TIMEOUTS = {
  short: 15_000,
  preview: 60_000,
  extract: 120_000,
  pdf: 120_000,
};

type RnFile = { uri: string; name: string; type: string };

function fileFromUri(uri: string, name = 'scan.jpg', type = 'image/jpeg'): RnFile {
  return { uri, name, type };
}

type RequestOptions = {
  path: string;
  method?: string;
  body?: BodyInit | FormData | null;
  headers?: Record<string, string>;
  auth?: boolean;
  timeoutMs: number;
  signal?: AbortSignal;
};

async function makeRequest(opts: RequestOptions): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }

  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.auth !== false) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const res = await fetch(`${API_URL}${opts.path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body ?? null,
      signal: ctrl.signal,
    });
    if (res.status === 401) {

      try { await signOut(); } catch {  }
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function safeRequest<T>(
  opts: RequestOptions,
  parse: (res: Response) => Promise<T>,
): Promise<ApiResult<T>> {
  try {
    const res = await makeRequest(opts);
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        if (body && typeof body.detail === 'string') detail = body.detail;
      } catch {

      }
      return {
        ok: false,
        error: { code: `http_${res.status}`, message: detail || 'request failed', status: res.status },
      };
    }
    const data = await parse(res);
    return { ok: true, data };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: { code: 'timeout', message: 'Request timed out' } };
    }
    return { ok: false, error: { code: 'network', message: err?.message ?? 'Network error' } };
  }
}

export async function authSignUp(
  username: string,
  password: string,
): Promise<ApiResult<AuthResponse>> {
  return safeRequest<AuthResponse>(
    {
      path: '/auth/signup',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      auth: false,
      timeoutMs: TIMEOUTS.short,
    },
    (res) => res.json(),
  );
}

export async function authSignIn(
  username: string,
  password: string,
): Promise<ApiResult<AuthResponse>> {
  return safeRequest<AuthResponse>(
    {
      path: '/auth/signin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      auth: false,
      timeoutMs: TIMEOUTS.short,
    },
    (res) => res.json(),
  );
}

export async function authMe(): Promise<ApiResult<AuthResponse['user']>> {
  return safeRequest(
    { path: '/auth/me', timeoutMs: TIMEOUTS.short },
    (res) => res.json(),
  );
}

export async function extractText(
  uri: string,
  opts: {
    mode?: PipelineMode;
    enhanceMode?: EnhanceMode;
    returnEnhanced?: boolean;
    spellCheck?: boolean;
    lang?: string;
    name?: string;
    ocrEngine?: OcrEngine;
    quadOverride?: Quad | null;
    signal?: AbortSignal;
  } = {},
): Promise<ApiResult<ScanRecord>> {
  const form = new FormData();
  form.append('file', fileFromUri(uri) as any);
  form.append('mode', opts.mode ?? 'auto');
  form.append('enhance_mode', opts.enhanceMode ?? 'color');
  form.append('return_enhanced', String(opts.returnEnhanced ?? true));
  form.append('spell_check', String(opts.spellCheck ?? true));
  form.append('lang', opts.lang ?? 'eng');
  form.append('ocr_engine', opts.ocrEngine ?? 'pytesseract');
  if (opts.name) form.append('name', opts.name);
  if (opts.quadOverride) form.append('quad_override', JSON.stringify(opts.quadOverride));
  return safeRequest<ScanRecord>(
    {
      path: '/scan/extract',
      method: 'POST',
      body: form as any,
      timeoutMs: TIMEOUTS.extract,
      signal: opts.signal,
    },
    (res) => res.json(),
  );
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

export async function getPreview(
  uri: string,
  enhanceMode: EnhanceMode = 'color',
  mode: PipelineMode = 'auto',
  quadOverride?: Quad | null,
): Promise<ApiResult<{ uri: string; mime: string }>> {
  const form = new FormData();
  form.append('file', fileFromUri(uri) as any);
  form.append('enhance_mode', enhanceMode);
  form.append('mode', mode);
  if (quadOverride) form.append('quad_override', JSON.stringify(quadOverride));
  return safeRequest(
    {
      path: '/scan/preview',
      method: 'POST',
      body: form as any,
      timeoutMs: TIMEOUTS.preview,
    },
    async (res) => {
      const blob = await res.blob();
      const mime = res.headers.get('content-type') ?? 'image/jpeg';
      const dataUrl = await readBlobAsDataUrl(blob);
      return { uri: dataUrl, mime };
    },
  );
}

export async function detectQuad(uri: string): Promise<ApiResult<DetectResult>> {
  const form = new FormData();
  form.append('file', fileFromUri(uri) as any);
  return safeRequest<DetectResult>(
    {
      path: '/scan/detect',
      method: 'POST',
      body: form as any,
      timeoutMs: TIMEOUTS.short,
    },
    async (res) => {
      const j = await res.json();
      const q: Quad | null =
        Array.isArray(j.quad) && j.quad.length === 4
          ? ([
              [Number(j.quad[0][0]), Number(j.quad[0][1])],
              [Number(j.quad[1][0]), Number(j.quad[1][1])],
              [Number(j.quad[2][0]), Number(j.quad[2][1])],
              [Number(j.quad[3][0]), Number(j.quad[3][1])],
            ] as Quad)
          : null;
      return {
        document_detected: !!j.document_detected,
        score: Number(j.score) || 0,
        quad: q,
        image_width: Number(j.image_width) || 0,
        image_height: Number(j.image_height) || 0,
      };
    },
  );
}

export async function reprocessScan(
  scanId: string,
  opts: {
    mode: PipelineMode;
    enhanceMode?: EnhanceMode;
    lang?: string;
    spellCheck?: boolean;
    ocrEngine?: OcrEngine;
  },
): Promise<ApiResult<ScanRecord>> {
  const form = new FormData();
  form.append('mode', opts.mode);
  if (opts.enhanceMode) form.append('enhance_mode', opts.enhanceMode);
  form.append('lang', opts.lang ?? 'eng');
  form.append('spell_check', String(opts.spellCheck ?? true));
  form.append('ocr_engine', opts.ocrEngine ?? 'pytesseract');
  return safeRequest<ScanRecord>(
    {
      path: `/scan/${encodeURIComponent(scanId)}/reprocess`,
      method: 'POST',
      body: form as any,
      timeoutMs: TIMEOUTS.extract,
    },
    (res) => res.json(),
  );
}

export async function attachPdfToScan(
  scanId: string,
  opts: {
    enhanceMode?: EnhanceMode;
    mode?: PipelineMode;
    searchable?: boolean;
    lang?: string;
  } = {},
): Promise<ApiResult<ScanRecord>> {
  const form = new FormData();
  form.append('enhance_mode', opts.enhanceMode ?? 'color');
  form.append('mode', opts.mode ?? 'auto');
  form.append('searchable', String(opts.searchable ?? true));
  form.append('lang', opts.lang ?? 'eng');
  return safeRequest<ScanRecord>(
    {
      path: `/scan/${encodeURIComponent(scanId)}/pdf`,
      method: 'POST',
      body: form as any,
      timeoutMs: TIMEOUTS.pdf,
    },
    (res) => res.json(),
  );
}

export async function attachDocxToScan(
  scanId: string,
  opts: { includeImage?: boolean } = {},
): Promise<ApiResult<ScanRecord>> {
  const form = new FormData();
  form.append('include_image', String(opts.includeImage ?? true));
  return safeRequest<ScanRecord>(
    {
      path: `/scan/${encodeURIComponent(scanId)}/docx`,
      method: 'POST',
      body: form as any,
      timeoutMs: TIMEOUTS.pdf,
    },
    (res) => res.json(),
  );
}

export async function listScans(): Promise<ApiResult<ScanSummary[]>> {
  return safeRequest(
    { path: '/scan/history', timeoutMs: TIMEOUTS.short },
    (res) => res.json(),
  );
}

export async function getScan(id: string): Promise<ApiResult<ScanRecord>> {
  return safeRequest(
    { path: `/scan/${encodeURIComponent(id)}`, timeoutMs: TIMEOUTS.short },
    (res) => res.json(),
  );
}

export async function deleteScan(id: string): Promise<ApiResult<true>> {
  return safeRequest(
    { path: `/scan/${encodeURIComponent(id)}`, method: 'DELETE', timeoutMs: TIMEOUTS.short },
    async () => true as const,
  );
}

export function assetUrl(scanIdOrPath: string, kind?: AssetKind): string {
  if (kind) return `${API_URL}/scan/${encodeURIComponent(scanIdOrPath)}/asset/${kind}`;

  if (scanIdOrPath.startsWith('http://') || scanIdOrPath.startsWith('https://')) {
    return scanIdOrPath;
  }
  return `${API_URL}${scanIdOrPath}`;
}

export async function downloadAsset(
  scanId: string,
  kind: AssetKind,
  fileName?: string,
): Promise<ApiResult<{ uri: string; mime: string }>> {
  const ext =
    kind === 'pdf' ? 'pdf' : kind === 'docx' ? 'docx' : 'jpg';
  const mime =
    kind === 'pdf'
      ? 'application/pdf'
      : kind === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'image/jpeg';
  const name = fileName ?? `${kind}-${scanId}.${ext}`;
  const url = `${API_URL}/scan/${encodeURIComponent(scanId)}/asset/${kind}`;
  try {
    const dir = new Directory(Paths.cache, 'scan-cache');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, name);
    if (dest.exists) dest.delete();

    const token = await getToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    const downloaded: any = await (File as any).downloadFileAsync(url, dest, { headers });
    const localUri: string = downloaded?.uri ?? dest.uri;
    return { ok: true, data: { uri: localUri, mime } };
  } catch (err: any) {
    const msg: string = err?.message ?? 'Download failed';

    if (/\b401\b/.test(msg)) {
      try { await signOut(); } catch {  }
      return { ok: false, error: { code: 'http_401', message: 'Unauthorized', status: 401 } };
    }
    const m = msg.match(/\b(4\d\d|5\d\d)\b/);
    if (m) {
      const status = parseInt(m[1], 10);
      return { ok: false, error: { code: `http_${status}`, message: msg, status } };
    }
    return { ok: false, error: { code: 'network', message: msg } };
  }
}

export const apiUrl = API_URL;
