import { useSyncExternalStore } from 'react';

import {
  attachPdfToScan,
  deleteScan as apiDeleteScan,
  downloadAsset,
  extractText as apiExtractText,
  getScan as apiGetScan,
  listScans,
  reprocessScan as apiReprocessScan,
} from './api';
import type {
  ApiResult,
  EnhanceMode,
  PipelineMode,
  ScanRecord,
  ScanSummary,
} from './types';

type StoreState = {
  loaded: boolean;
  loading: boolean;
  scans: ScanSummary[];
  details: Record<string, ScanRecord>;
  error: string | null;
};

let state: StoreState = {
  loaded: false,
  loading: false,
  scans: [],
  details: {},
  error: null,
};

const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot(): StoreState {
  return state;
}

export function useScanStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useScans(): ScanSummary[] {
  return useScanStore().scans;
}

export async function refreshScans(): Promise<ApiResult<ScanSummary[]>> {
  state = { ...state, loading: true };
  notify();
  const res = await listScans();
  if (res.ok) {
    state = {
      ...state,
      loaded: true,
      loading: false,
      scans: res.data,
      error: null,
    };
  } else {
    state = {
      ...state,
      loading: false,
      loaded: true,
      error: res.error.message,
    };
  }
  notify();
  return res;
}

export function clearStore(): void {
  state = { loaded: false, loading: false, scans: [], details: {}, error: null };
  notify();
}

export async function loadScan(id: string, force = false): Promise<ApiResult<ScanRecord>> {
  const cached = state.details[id];
  if (cached && !force) return { ok: true, data: cached };
  const res = await apiGetScan(id);
  if (res.ok) {
    state = { ...state, details: { ...state.details, [id]: res.data } };
    notify();
  }
  return res;
}

export function getCachedScan(id: string): ScanRecord | undefined {
  return state.details[id];
}

export async function createScan(
  uri: string,
  opts: {
    mode?: PipelineMode;
    enhanceMode?: EnhanceMode;
    name?: string;
    spellCheck?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<ApiResult<ScanRecord>> {
  const res = await apiExtractText(uri, {
    mode: opts.mode ?? 'auto',
    enhanceMode: opts.enhanceMode ?? 'color',
    name: opts.name,
    returnEnhanced: true,
    spellCheck: opts.spellCheck ?? true,
    signal: opts.signal,
  });
  if (res.ok) {
    const summary: ScanSummary = recordToSummary(res.data);
    state = {
      ...state,
      scans: [summary, ...state.scans.filter((s) => s.id !== res.data.id)],
      details: { ...state.details, [res.data.id]: res.data },
    };
    notify();
  }
  return res;
}

export async function attachPdf(
  scanId: string,
  opts: {
    enhanceMode?: EnhanceMode;
    searchable?: boolean;
  } = {},
): Promise<ApiResult<ScanRecord>> {
  const res = await attachPdfToScan(scanId, {
    enhanceMode: opts.enhanceMode,
    searchable: opts.searchable,
  });
  if (res.ok) {
    const summary = recordToSummary(res.data);
    state = {
      ...state,
      details: { ...state.details, [res.data.id]: res.data },
      scans: state.scans.map((s) => (s.id === res.data.id ? summary : s)),
    };
    notify();
  }
  return res;
}

export async function reprocessScan(
  scanId: string,
  mode: PipelineMode,
  opts: { enhanceMode?: EnhanceMode } = {},
): Promise<ApiResult<ScanRecord>> {
  const res = await apiReprocessScan(scanId, {
    mode,
    enhanceMode: opts.enhanceMode,
  });
  if (res.ok) {
    const summary = recordToSummary(res.data);
    state = {
      ...state,
      details: { ...state.details, [res.data.id]: res.data },
      scans: state.scans.map((s) => (s.id === res.data.id ? summary : s)),
    };
    notify();
  }
  return res;
}

export async function removeScan(id: string): Promise<ApiResult<true>> {
  const res = await apiDeleteScan(id);
  if (res.ok) {
    const { [id]: _, ...rest } = state.details;
    state = {
      ...state,
      scans: state.scans.filter((s) => s.id !== id),
      details: rest,
    };
    notify();
  }
  return res;
}

export async function fetchAssetToCache(
  scanId: string,
  kind: 'raw' | 'enhanced' | 'pdf',
  fileName?: string,
): Promise<ApiResult<{ uri: string; mime: string }>> {
  return downloadAsset(scanId, kind, fileName);
}

function recordToSummary(r: ScanRecord): ScanSummary {
  return {
    id: r.id,
    name: r.name,
    created_at: r.created_at,
    bytes_size: r.bytes_size,
    pipeline_path: r.pipeline_path,
    enhance_mode: r.enhance_mode,
    handwriting_detected: r.handwriting_detected,
    mean_conf: r.mean_conf,
    has_pdf: !!r.assets.pdf,
    has_enhanced: !!r.assets.enhanced,
  };
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
