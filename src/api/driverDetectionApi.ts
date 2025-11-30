/**
 * API Service cho Driver Behavior & Attack Detection
 * Tích hợp với Backend FastAPI
 */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ============================================================
// Types theo Backend API Response
// ============================================================

export type TaskAResult = {
  pred_idx: number;
  pred_label: string; // "c0", "c1", ..., "c9"
  suspicious: boolean;
  probs: Array<{ label: string; score: number }>;
  boxes?: Array<{ box: number[]; label: string; conf: number }>;
};

export type TaskBResult = {
  model_name: string;
  prob_pos: number;
  is_pos_thr: boolean;
  pos_class: string; // "attack", "Fight", "fight"
  pred_idx_argmax: number;
  pred_label_argmax: string;
  probs: Array<{ label: string; score: number }>;
};

export type PredictImageResponse = {
  taskA?: TaskAResult;
  taskB?: TaskBResult;
  final_alert: string | null; // "ATTACK" hoặc "c0", "c1", ...
};

export type VideoEvent = {
  frame_idx: number;
  time_s: number | null;
  stage: number; // 1 hoặc 2
  taskA?: TaskAResult;
  taskB?: TaskBResult;
  suspicious: boolean;
  suspicious_A: boolean;
  suspicious_B: boolean;
  stage_switch?: string; // "1->2"
  window_suspicious_ratio: number | null;
  window_has_A: boolean | null;
  window_has_B: boolean | null;
  window_suspicious_ratio_A: number | null;
  distraction_detected: boolean;
  alert: string | null; // "ATTACK_DETECTED" hoặc null
};

export type VideoSummary = {
  total_frames: number;
  fps: number;
  detect_count: number;
  alert_triggered: boolean;
  distraction_detected: boolean;
  taskB_model_used: string | null;
  suspicious_frames_for_attack: number[];
};

export type PredictVideoResponse = {
  summary: VideoSummary;
  events: VideoEvent[];
};

export type HealthResponse = {
  status: string;
  device: string;
  taskA_loaded: boolean;
  taskB_loaded: boolean;
  taskB_models: string[];
};

// Stream Event type cho SSE
export type StreamEvent = {
  type: "metadata" | "event" | "summary" | "done" | "error";
  // Metadata fields
  total_frames?: number;
  fps?: number;
  // Event fields
  frame_idx?: number;
  time_s?: number | null;
  stage?: number;
  taskA?: TaskAResult;
  taskB?: TaskBResult & { model_name: string };
  suspicious?: boolean;
  suspicious_A?: boolean;
  suspicious_B?: boolean;
  stage_switch?: string;
  window_suspicious_ratio?: number | null;
  window_has_A?: boolean | null;
  window_has_B?: boolean | null;
  window_suspicious_ratio_A?: number | null;
  distraction_detected?: boolean;
  alert?: string | null;
  // Summary fields
  detect_count?: number;
  alert_triggered?: boolean;
  taskB_model_used?: string | null;
  suspicious_frames_for_attack?: number[];
  // Error fields
  message?: string;
};

// ============================================================
// API Functions
// ============================================================

/**
 * Kiểm tra trạng thái server và models
 */
export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`);
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Predict ảnh đơn
 * @param file - File ảnh (.jpg, .png, .bmp)
 * @param options - Options cho prediction
 */
export async function predictImage(
  file: File,
  options: {
    run_taskA?: boolean;
    model_name_A?: string;
    run_taskB?: boolean;
    run_both?: boolean;
    taskB_name?: string;
  } = {}
): Promise<PredictImageResponse> {
  const {
    run_taskA = true,
    model_name_A = "ResNet18",
    run_taskB = false,
    run_both = false,
    taskB_name = "custom_cabin_attack",
  } = options;

  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams();
  if (run_both) {
    params.append("run_both", "true");
  } else {
    params.append("run_taskA", String(run_taskA));
    params.append("model_name_A", model_name_A);
    params.append("run_taskB", String(run_taskB));
  }
  params.append("taskB_name", taskB_name);

  const url = `${API_URL}/predict_image?${params.toString()}`;
  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return res.json();
}



/**
 * Predict video file with Server-Sent Events (SSE) - Real-time streaming
 * @param file - File video (.mp4, .avi, .mov, .mkv)
 * @param options - Options cho prediction
 * @param onEvent - Callback khi nhận được event
 * @param onError - Callback khi có lỗi
 * @returns AbortController để có thể cancel
 */
export function predictVideoSSE(
  file: File,
  options: {
    run_taskA?: boolean;
    model_name_A?: string;
    run_taskB?: boolean;
    taskB_name?: string;
  } = {},
  onEvent: (event: StreamEvent) => void,
  onError?: (error: Error) => void
): AbortController {
  const {
    run_taskA = true,
    model_name_A = "ResNet18",
    run_taskB = true,
    taskB_name = "custom_cabin_attack",
  } = options;

  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams();
  params.append("run_taskA", String(run_taskA));
  params.append("model_name_A", model_name_A);
  params.append("run_taskB", String(run_taskB));
  params.append("taskB_name", taskB_name);

  const url = `${API_URL}/predict_video_stream_sse?${params.toString()}`;
  const abortController = new AbortController();

  fetch(url, {
    method: "POST",
    body: formData,
    signal: abortController.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      if (!res.body) {
        throw new Error("Response body is null");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Giữ lại phần chưa hoàn chỉnh

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const jsonStr = line.slice(6); // Bỏ "data: "
              const data = JSON.parse(jsonStr);
              onEvent(data);
            } catch (e) {
              console.error("Failed to parse SSE data:", e);
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name === "AbortError") {
        return; // User cancelled, ignore
      }
      if (onError) {
        onError(err instanceof Error ? err : new Error(String(err)));
      } else {
        console.error("SSE error:", err);
      }
    });

  return abortController;
}

