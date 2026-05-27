export type PipelineMode = 'auto' | 'printed' | 'handwriting';
export type EnhanceMode = 'original' | 'color' | 'gray' | 'bw' | 'magic';
export type PipelinePath = 'printed' | 'handwriting';
export type OcrEngine = 'pytesseract' | 'from_scratch';

export type AuthUser = {
  user_id: number;
  username: string;
  role: 'admin' | 'user' | string;
  created_at: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: AuthUser;
};

export type ScanAssets = {
  raw?: string | null;
  enhanced?: string | null;
  pdf?: string | null;
  docx?: string | null;
};

export type ScanRecord = {
  id: string;
  name: string;
  created_at: string;
  original_filename: string | null;
  bytes_size: number;
  mode: string;
  enhance_mode: EnhanceMode;
  pipeline_path: PipelinePath;
  ocr_engine: OcrEngine;
  language: string;
  mean_conf: number;
  document_detected: boolean;
  detection_score: number;
  handwriting_detected: boolean;
  handwriting_confidence: number;
  confidence_warning: string | null;
  psm_used: number;
  text: string;
  enhanced_mime: string | null;
  assets: ScanAssets;
};

export type ScanSummary = {
  id: string;
  name: string;
  created_at: string;
  bytes_size: number;
  pipeline_path: PipelinePath;
  enhance_mode: EnhanceMode;
  ocr_engine: OcrEngine;
  handwriting_detected: boolean;
  mean_conf: number;
  has_pdf: boolean;
  has_enhanced: boolean;
  has_docx: boolean;
};

export type ApiError = { code: string; message: string; status?: number };

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export type Quad = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

export type DetectResult = {
  document_detected: boolean;
  score: number;
  quad: Quad | null;
  image_width: number;
  image_height: number;
};

export type AssetKind = 'raw' | 'enhanced' | 'pdf' | 'docx';
