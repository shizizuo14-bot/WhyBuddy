export const WEB_AIGC_AUDIO_RECOGNITION_API = {
  EXECUTE: "POST /api/audio-recognition/nodes/execute",
} as const;

export const WEB_AIGC_AUDIO_RECOGNITION_NODE_TYPES = [
  "audio_recognition",
] as const;

export type AudioRecognitionNodeType =
  (typeof WEB_AIGC_AUDIO_RECOGNITION_NODE_TYPES)[number];

export type WebAigcAudioRecognitionSourceKind =
  | "inline_base64"
  | "remote_url";

export interface WebAigcAudioRecognitionSourceInput {
  audioBase64?: string;
  audioUrl?: string;
  mimeType?: string;
  fileName?: string;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}

export interface WebAigcAudioRecognitionWritebackInput {
  enabled?: boolean;
}

export interface AudioRecognitionNodeInput {
  source?: WebAigcAudioRecognitionSourceInput;
  languageHint?: string;
  context?: Record<string, unknown>;
  writeback?: WebAigcAudioRecognitionWritebackInput;
}

export interface AudioRecognitionNodeExecutionRequest {
  nodeType: AudioRecognitionNodeType;
  input?: AudioRecognitionNodeInput;
}

export interface WebAigcAudioRecognitionSegment {
  index: number;
  text: string;
  confidence: number | null;
  startMs?: number;
  endMs?: number;
}

export interface WebAigcAudioRecognitionSourceSummary {
  kind: WebAigcAudioRecognitionSourceKind;
  mimeType: string;
  byteLength: number;
  durationMs: number | null;
  metadata: Record<string, unknown>;
  fileName?: string;
  audioUrl?: string;
}

export interface WebAigcAudioRecognitionWritebackSummary {
  enabled: boolean;
  transcriptPath: "multimodalContext.voiceTranscript";
  resultPath: "audioRecognition";
  downstreamConsumers: Array<"dialogue" | "document_search" | "web_qa">;
}

export interface AudioRecognitionNodeExecutionResult {
  ok: true;
  nodeType: AudioRecognitionNodeType;
  output: {
    status: "completed";
    transcript: string;
    confidence: number | null;
    languageHint?: string;
    segments: WebAigcAudioRecognitionSegment[];
    source: WebAigcAudioRecognitionSourceSummary;
    writeback: WebAigcAudioRecognitionWritebackSummary;
    context: Record<string, unknown>;
    observability: {
      eventKey: "multimodal.audio_recognition";
      nodeType: AudioRecognitionNodeType;
      sourceKind: WebAigcAudioRecognitionSourceKind;
      mimeType: string;
      byteLength: number;
      durationMs: number | null;
      latencyMs: number;
      transcriptLength: number;
    };
    warnings: string[];
  };
}
