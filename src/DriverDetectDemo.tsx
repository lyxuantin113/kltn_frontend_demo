import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { predictImage, checkHealth, type PredictImageResponse, type HealthResponse } from "./api/driverDetectionApi";
import { getTaskALabelDisplay } from "./constants/taskALabels";
/**
 * Driver Detection – React Frontend (FastAPI client)
 * -------------------------------------------------------
 * Upload ảnh và dự đoán với Task A (Mất tập trung) và/hoặc Task B (Nguy hiểm)
 * Sử dụng Backend API: /predict_image
 */

const LABEL_COLORS: Record<string, string> = {
  c0: "bg-emerald-500",
  c1: "bg-orange-500",
  c2: "bg-pink-500",
  c3: "bg-indigo-500",
  c4: "bg-yellow-500",
  c5: "bg-purple-500",
  c6: "bg-red-500",
  c7: "bg-blue-500",
  c8: "bg-teal-500",
  c9: "bg-amber-500",
};

export default function DriverDetectDemo() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictImageResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  // Image dimensions for bounding boxes
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number } | null>(null);
 
  // Options
  const [runTaskA, setRunTaskA] = useState(true);
  const [taskAName, setTaskAName] = useState("ResNet50");
  const [runTaskB, setRunTaskB] = useState(false);
  const [taskBName, setTaskBName] = useState("custom_cabin_attack");

  // Load health check và available Task B models
  useEffect(() => {
    checkHealth()
      .then(setHealth)
      .catch(() => {});
  }, []);

  const onPick = () => inputRef.current?.click();

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, []);

  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/")) {
      setError("Vui lòng chọn tệp ảnh (jpg/png)");
      return;
    }

    setError(null);
    setFile(f);
    setResult(null);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const canSubmit = useMemo(() => !!file && !loading, [file, loading]);
  const predict = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await predictImage(file, {
        run_taskA: runTaskA,
        model_name_A: taskAName,
        run_taskB: runTaskB,
        run_both: runTaskA && runTaskB,
        taskB_name: taskBName,
      });
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi gọi API");
    } finally {
      setLoading(false);
    }
  };

  const clearSelection = () => {
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const finalAlertColor = useMemo(() => {
    if (!result?.final_alert) return "bg-neutral-500";
    if (result.final_alert === "ATTACK") return "bg-red-600";
    return LABEL_COLORS[result.final_alert] || "bg-sky-500";
  }, [result]);

  return (
    <div className="flex gap-4">
      {/* Uploader */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="relative max-w-7/12 w-full rounded-sm shadow-block border border-neutral-800 bg-neutral-900/60 p-6 transition hover:border-neutral-700"
      >
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          {previewUrl ? (
            <div className="relative inline-block w-full">
              <img
                src={previewUrl}
                alt="preview"
                className="w-full rounded-xl object-contain"
                onLoad={(e) => {
                  setImgNaturalSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
                }}
              />
              {/* Bounding Boxes Overlay */}
              {result?.taskA?.boxes && imgNaturalSize && (
                <div className="absolute inset-0 pointer-events-none">
                  {result.taskA.boxes.map((boxItem, idx) => {
                    const [x1, y1, x2, y2] = boxItem.box;
                    const widthPct = ((x2 - x1) / imgNaturalSize.w) * 100;
                    const heightPct = ((y2 - y1) / imgNaturalSize.h) * 100;
                    const leftPct = (x1 / imgNaturalSize.w) * 100;
                    const topPct = (y1 / imgNaturalSize.h) * 100;
                    
                    return (
                      <div
                        key={idx}
                        className="absolute border-2 border-yellow-400 z-10"
                        style={{
                          left: `${leftPct}%`,
                          top: `${topPct}%`,
                          width: `${widthPct}%`,
                          height: `${heightPct}%`,
                        }}
                      >
                        <span className="absolute -top-5 left-0 bg-yellow-400 text-black text-xs px-1 font-bold whitespace-nowrap">
                          {boxItem.label} {(boxItem.conf * 100).toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-10 w-10 text-neutral-500"
              >
                <path d="M12 2a5 5 0 00-5 5v2H6a4 4 0 100 8h12a4 4 0 100-8h-1V7a5 5 0 00-5-5z" />
              </svg>
              <p className="text-neutral-400">Kéo & thả ảnh vào đây hoặc</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={onPick}
              className="rounded-sm bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20 btn-hover-effect"
            >
              Chọn ảnh
            </button>
            {file && (
              <button
                onClick={clearSelection}
                className="rounded-sm bg-white/5 px-4 py-2 text-sm text-neutral-300 hover:bg-white/10 btn-hover-effect"
              >
                Xóa
              </button>
            )}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
          </div>
        </div>
      </div>

      <div className="rounded-sm shadow-block max-w-5/12 w-full border border-neutral-800 bg-neutral-900/60 p-5">
        {/* Options */}
        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={runTaskA}
                onChange={(e) => setRunTaskA(e.target.checked)}
                className="rounded"
              />
              <span>Task A (Mất tập trung)</span>
            </label>
          </div>

          {runTaskA && health && health.taskA_models.length > 0 && (
            <div className="flex items-center gap-2 text-sm ml-6 mb-2">
              <span className="text-neutral-400">Task A Model:</span>
              <select
                value={taskAName}
                onChange={(e) => setTaskAName(e.target.value)}
                className="rounded-lg bg-neutral-800 px-2 py-1 text-xs outline-none"
              >
                {health?.taskA_models.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={runTaskB}
                onChange={(e) => setRunTaskB(e.target.checked)}
                className="rounded"
              />
              <span>Task B (Nguy hiểm / Tấn công)</span>
            </label>
          </div>
       
          {runTaskB && health && health.taskB_models.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-neutral-400">Task B Model:</span>
              <select
                value={taskBName}
                onChange={(e) => setTaskBName(e.target.value)}
                className="rounded-lg bg-neutral-800 px-2 py-1 text-xs outline-none"
              >
                {health.taskB_models.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            disabled={!canSubmit || (!runTaskA && !runTaskB)}
            onClick={predict}
            className={`rounded-sm px-5 py-2 text-sm font-semibold btn-hover-effect ${
              canSubmit && (runTaskA || runTaskB)
                ? "bg-emerald-500 hover:bg-emerald-400 text-white"
                : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
            }`}
          >
            {loading ? "Đang dự đoán..." : "Dự đoán"}
          </button>
          {file && (
            <div className="text-xs text-neutral-400">{file.name} • {(file.size / 1024).toFixed(1)} KB</div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-6 space-y-4">
            {/* Final Alert */}
            {result.final_alert && (
              <div className={`rounded-xl px-4 py-3 ${finalAlertColor} text-white font-semibold`}>
                {result.final_alert === "ATTACK"
                  ? "⚠️ Phát hiện nguy hiểm"
                  : `Label: ${result.final_alert} - ${getTaskALabelDisplay(result.final_alert)}`}
              </div>
            )}

            {/* Task A Results */}
            {result.taskA && (
              <div className="rounded-xl bg-white/5 p-4">
                <h3 className="text-sm font-semibold mb-3">Task A: Tài xế mất tập trung</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-300">Predicted:</span>
                    <span className={`px-2 py-1 rounded text-sm font-medium ${
                      result.taskA.suspicious ? "bg-orange-500" : "bg-emerald-500"
                    }`}>
                      {result.taskA.pred_label} - {getTaskALabelDisplay(result.taskA.pred_label)} {result.taskA.suspicious ? "⚠️" : "✓"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {result.taskA.probs.map((prob, i) => {
                      const color = LABEL_COLORS[prob.label] || "bg-sky-500";
                      const pct = `${(prob.score * 100).toFixed(1)}%`;
                      return (
                        <div key={i} className="text-xs">
                          <div className="flex items-center justify-between mb-1 text-neutral-300">
                            <span>{prob.label}</span>
                            <span className="text-neutral-400">{pct}</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
                            <div className={`h-full ${color} transition-all`} style={{ width: pct }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Task B Results */}
            {result.taskB && (
              <div className="rounded-xl bg-white/5 p-4">
                <h3 className="text-sm font-semibold mb-3">Task B: Phát hiện nguy hiểm ({result.taskB.model_name})</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-300">Predicted:</span>
                    <span className={`px-2 py-1 rounded text-sm font-medium ${
                      result.taskB.is_pos_thr ? "bg-red-600" : "bg-emerald-500"
                    }`}>
                      {result.taskB.pred_label_argmax} {result.taskB.is_pos_thr ? "⚠️" : "✓"}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-400">
                    {result.taskB.pos_class} probability: {(result.taskB.prob_pos * 100).toFixed(2)}%
                  </div>
                  <div className="space-y-1">
                    {result.taskB.probs.map((prob, i) => {
                      const pct = `${(prob.score * 100).toFixed(1)}%`;
                      const isPos = prob.label === result.taskB!.pos_class;
                      return (
                        <div key={i} className="text-xs">
                          <div className="flex items-center justify-between mb-1 text-neutral-300">
                            <span>{prob.label}</span>
                            <span className="text-neutral-400">{pct}</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
                            <div
                              className={`h-full ${isPos ? "bg-red-500" : "bg-emerald-500"} transition-all`}
                              style={{ width: pct }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}