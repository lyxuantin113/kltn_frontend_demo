import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { predictVideoSSE, checkHealth, type HealthResponse, type StreamEvent } from "./api/driverDetectionApi";
import { getTaskALabelDisplay } from "./constants/taskALabels";

/**
 * Real-time Video Detection Component với SSE
 * Upload video và nhận kết quả real-time khi đang xử lý
 */

export default function VideoRealtimeDemo() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  
  // Options
  const [runTaskA, setRunTaskA] = useState(true);
  const [taskAName, setTaskAName] = useState("ResNet50"); // Default model
  const [runTaskB, setRunTaskB] = useState(true);
  const [taskBName, setTaskBName] = useState("custom_cabin_attack");
  
  // Advanced Config State
  const [stage1Stride, setStage1Stride] = useState(16);
  const [stage2Stride, setStage2Stride] = useState(4);
  
  // Task A Config
  const [taskASuspiciousProbThr, setTaskASuspiciousProbThr] = useState(0.7);
  const [taskADistractionRatio, setTaskADistractionRatio] = useState(0.6);
  const [distractionCooldown, setDistractionCooldown] = useState(3.0);
  const [yoloConf, setYoloConf] = useState(0.5);
  
  // Task B Config
  const [suspiciousWindow, setSuspiciousWindow] = useState(5);
  const [suspiciousThreshRatio, setSuspiciousThreshRatio] = useState(0.8);
  const [taskBSuspiciousRatio, setTaskBSuspiciousRatio] = useState(0.8);
  const [taskBDetectedRatio, setTaskBDetectedRatio] = useState(0.5);
  const [attackCooldown, setAttackCooldown] = useState(2.0);
  
  // Stream data
  const [metadata, setMetadata] = useState<{ total_frames: number; fps: number } | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [summary, setSummary] = useState<StreamEvent | null>(null);
  const [currentEventIdx, setCurrentEventIdx] = useState(-1);
  const [progress, setProgress] = useState(0);
  
  // Playback
  const [playing, setPlaying] = useState(false);
  const [alertShown, setAlertShown] = useState(false);
  
  // UI State
  const [expandedVideoInfo, setExpandedVideoInfo] = useState(true);
  const [expandedCurrentEvent, setExpandedCurrentEvent] = useState(true);
  const [expandedSetup, setExpandedSetup] = useState(true);
  const [expandedOptions, setExpandedOptions] = useState(true);
  
  // Abort controller
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    checkHealth().then(setHealth).catch(() => {});
  }, []);
  

  // Sound effect cho distraction (với debounce)
  const lastDistractionTime = useRef<number>(0);
  useEffect(() => {
    if (!playing || currentEventIdx < 0) return;
    const event = events[currentEventIdx];
    if (event?.distraction_detected) {
      const now = Date.now();
      if (now - lastDistractionTime.current > 500) {
        lastDistractionTime.current = now;
        try {
          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const audioContext = new AudioContextClass();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.value = 800;
          oscillator.type = "sine";
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
          
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.1);
        } catch {
          // Ignore audio errors
        }
      }
    }
  }, [events, currentEventIdx, playing]);

  // Alert cho attack
  useEffect(() => {
    if (!summary) {
      setAlertShown(false);
    }
  }, [summary]);

  useEffect(() => {
    if (!playing || currentEventIdx < 0) return;
    const event = events[currentEventIdx];
    if (event?.alert === "ATTACK_DETECTED" && !alertShown) {
      setAlertShown(true);
      console.log("🚨 Phát hiện nguy hiểm tại frame", event.frame_idx, "thời gian", event.time_s);
    }
  }, [events, currentEventIdx, playing, alertShown]);

  const handleFile = (f: File) => {
    if (!f.type.startsWith("video/")) {
      setError("Vui lòng chọn file video (.mp4/.avi/.mov/.mkv)");
      return;
    }
    setError(null);
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    setEvents([]);
    setMetadata(null);
    setSummary(null);
    setCurrentEventIdx(-1);
    setProgress(0);
    setAlertShown(false);
  };

  const onPickVideo = () => fileInputRef.current?.click();

  const onChangeVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const startProcessing = () => {
    if (!file) return;
    
    // Cancel previous if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    setProcessing(true);
    setError(null);
    setEvents([]);
    setMetadata(null);
    setSummary(null);
    setCurrentEventIdx(-1);
    setProgress(0);
    setAlertShown(false);

    const controller = predictVideoSSE(
      file,
      {
        run_taskA: runTaskA,
        model_name_A: taskAName, // Pass selected model name
        run_taskB: runTaskB,
        taskB_name: taskBName,
        // Pass config params
        stage1_stride: stage1Stride,
        stage2_stride: stage2Stride,
        taskA_suspicious_prob_thr: taskASuspiciousProbThr,
        taskA_distraction_ratio: taskADistractionRatio,
        distraction_cooldown_seconds: distractionCooldown,
        yolo_conf: yoloConf,
        suspicious_window: suspiciousWindow,
        suspicious_thresh_ratio: suspiciousThreshRatio,
        taskB_suspicious_ratio: taskBSuspiciousRatio,
        taskB_detected_ratio: taskBDetectedRatio,
        attack_cooldown_seconds: attackCooldown,
      },
      (event: StreamEvent) => {
        if (event.type === "metadata") {
          setMetadata({
            total_frames: event.total_frames || 0,
            fps: event.fps || 0,
          });
          // Tự động play video khi nhận metadata (nếu user chưa play)
          if (videoRef.current && videoRef.current.paused) {
            videoRef.current.play().catch(() => {
              // Ignore nếu user chưa tương tác với page
            });
          }
        } else if (event.type === "event") {
          setEvents((prev) => {
            const newEvents = [...prev, event];
            // Update progress
            if (metadata) {
              const progressPct = ((event.frame_idx || 0) / metadata.total_frames) * 100;
              setProgress(Math.min(progressPct, 100));
            }
            return newEvents;
          });
        } else if (event.type === "summary") {
          setSummary(event);
          setProcessing(false);
        } else if (event.type === "done") {
          setProcessing(false);
        } else if (event.type === "error") {
          setError(event.message || "Có lỗi xảy ra");
          setProcessing(false);
        }
      },
      (err) => {
        setError(err.message);
        setProcessing(false);
      }
    );

    abortControllerRef.current = controller;
  };

  const stopProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setProcessing(false);
  };

  const handleVideoTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const currentTime = videoRef.current.currentTime;
    
    // Nếu chưa có events, không làm gì
    if (events.length === 0) return;
    
    // Tìm event gần nhất với thời gian hiện tại
    let foundIdx = -1;
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.time_s !== null && event.time_s !== undefined && currentTime >= event.time_s) {
        foundIdx = i;
        break;
      }
    }
    
    if (foundIdx >= 0 && foundIdx !== currentEventIdx) {
      setCurrentEventIdx(foundIdx);
    }
    
    // Nếu video chạy quá nhanh so với events đã xử lý, có thể pause tạm
    // (Tùy chọn: chỉ áp dụng nếu muốn sync chặt chẽ)
    if (processing && events.length > 0) {
      const lastEventTime = events[events.length - 1].time_s;
      if (lastEventTime !== null && lastEventTime !== undefined) {
        // Nếu video chạy quá 2 giây so với event cuối cùng, pause tạm
        if (currentTime > lastEventTime + 2.0) {
          // videoRef.current.pause(); // Uncomment nếu muốn pause khi chạy quá nhanh
        }
      }
    }
  }, [events, currentEventIdx, processing]);

  const currentEvent = useMemo(() => {
    if (currentEventIdx >= 0 && currentEventIdx < events.length) {
      return events[currentEventIdx];
    }
    return null;
  }, [events, currentEventIdx]);

  return (
    <div>
        {/* Setup Dự đoán Block */}
        <div className="shadow-block my-4 rounded-sm border border-neutral-800 bg-neutral-900/60 p-4">
          <div 
            className="flex items-center justify-between cursor-pointer border-b border-neutral-800 pb-2 mb-3"
            onClick={() => setExpandedSetup(!expandedSetup)}
          >
            <h3 className="text-sm font-semibold text-neutral-300">
              Setup Dự đoán
            </h3>
            <span className="text-neutral-400">{expandedSetup ? "▼" : "▶"}</span>
          </div>
          
          {expandedSetup && (
            <div className="space-y-4">
              {/* Chung */}
              <div>
                <h4 className="text-xs font-medium text-blue-400 mb-2">Chung (Task A & B)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1" title="Khoảng cách giữa các frame được xử lý ở giai đoạn 1 (bình thường)">
                      Stage 1 Stride (Thưa)
                    </label>
                    <input 
                      type="number" 
                      value={stage1Stride}
                      onChange={(e) => setStage1Stride(Number(e.target.value))}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                      disabled={processing}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1" title="Khoảng cách giữa các frame được xử lý ở giai đoạn 2 (khi phát hiện nghi vấn)">
                      Stage 2 Stride (Dày)
                    </label>
                    <input 
                      type="number" 
                      value={stage2Stride}
                      onChange={(e) => setStage2Stride(Number(e.target.value))}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                      disabled={processing}
                    />
                  </div>
                </div>
              </div>

              {/* Task A */}
              {runTaskA && (
                <div>
                  <h4 className="text-xs font-medium text-orange-400 mb-2">Task A (Mất tập trung)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1" title="Ngưỡng xác suất để coi là nghi vấn (suspicious)">
                        Suspicious Prob Thr (Ngưỡng nghi vấn)
                      </label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={taskASuspiciousProbThr}
                        min="0"
                        max="1"
                        onChange={(e) => setTaskASuspiciousProbThr(Number(e.target.value))}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                        disabled={processing}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1" title="Tỷ lệ frame nghi vấn trong cửa sổ để cảnh báo mất tập trung">
                        Distraction Ratio (Tỷ lệ cảnh báo)
                      </label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={taskADistractionRatio}
                        min="0"
                        max="1"
                        onChange={(e) => setTaskADistractionRatio(Number(e.target.value))}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                        disabled={processing}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1" title="Thời gian chờ giữa 2 lần cảnh báo liên tiếp">
                        Cooldown (s)
                      </label>
                      <input 
                        type="number" 
                        step="0.5"
                        value={distractionCooldown}
                        onChange={(e) => setDistractionCooldown(Number(e.target.value))}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                        disabled={processing}
                      />
                    </div>
                    {taskAName.toLowerCase().includes("yolo") && (
                      <div>
                        <label className="block text-xs text-neutral-400 mb-1">YOLO Conf</label>
                        <input 
                          type="number" 
                          step="0.05"
                          value={yoloConf}
                          onChange={(e) => setYoloConf(Number(e.target.value))}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                          disabled={processing}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Task B */}
              {runTaskB && (
                <div>
                  <h4 className="text-xs font-medium text-red-400 mb-2">Task B (Nguy hiểm / Tấn công)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1" title="Số lượng frame trong cửa sổ trượt để tính toán tỷ lệ">
                        Suspicious Window (Cửa sổ trượt)
                      </label>
                      <input 
                        type="number" 
                        value={suspiciousWindow}
                        onChange={(e) => setSuspiciousWindow(Number(e.target.value))}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                        disabled={processing}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1" title="Hệ số nhân với ngưỡng tốt nhất (Best Thr) để xác định nghi vấn. Công thức: Thr_nghi_vấn = Best_Thr * Ratio">
                        Suspicious Thresh Ratio (Hệ số nghi vấn)
                      </label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={suspiciousThreshRatio}
                        min="0"
                        max="2"
                        onChange={(e) => setSuspiciousThreshRatio(Number(e.target.value))}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                        disabled={processing}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1" title="Tỷ lệ frame nghi vấn cần thiết để kích hoạt cảnh báo. Công thức: Số_frame_nghi_vấn / Window >= Ratio">
                        Task B Suspicious Ratio (Tỷ lệ nghi vấn)
                      </label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={taskBSuspiciousRatio}
                        min="0"
                        max="1"
                        onChange={(e) => setTaskBSuspiciousRatio(Number(e.target.value))}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                        disabled={processing}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1" title="Tỷ lệ frame phát hiện (vượt ngưỡng Best Thr) cần thiết để kích hoạt cảnh báo. Công thức: Số_frame_phát_hiện / Window >= Ratio">
                        Task B Detected Ratio (Tỷ lệ phát hiện)
                      </label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={taskBDetectedRatio}
                        min="0"
                        max="1"
                        onChange={(e) => setTaskBDetectedRatio(Number(e.target.value))}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                        disabled={processing}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1" title="Thời gian chờ giữa 2 lần cảnh báo liên tiếp">
                        Cooldown (s)
                      </label>
                      <input 
                        type="number" 
                        step="0.5"
                        value={attackCooldown}
                        onChange={(e) => setAttackCooldown(Number(e.target.value))}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                        disabled={processing}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      {/* Options - Luôn hiển thị để user có thể chọn trước */}
      <div className="shadow-block my-4 rounded-sm border border-neutral-800 bg-neutral-900/60 p-4">
        <div 
          className="flex items-center justify-between cursor-pointer border-b border-neutral-800 pb-2 mb-3"
          onClick={() => setExpandedOptions(!expandedOptions)}
        >
          <h3 className="text-sm font-semibold text-neutral-300">
            Chọn mô hình
          </h3>
          <span className="text-neutral-400">{expandedOptions ? "▼" : "▶"}</span>
        </div>
        
        {expandedOptions && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={runTaskA}
                    onChange={(e) => setRunTaskA(e.target.checked)}
                    className="rounded"
                    disabled={processing}
                  />
                  <span>Task A (Mất tập trung)</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={runTaskB}
                    onChange={(e) => setRunTaskB(e.target.checked)}
                    className="rounded"
                    disabled={processing}
                  />
                  <span>Task B (Nguy hiểm)</span>
                </label>
              </div>
              
              {runTaskA && health && health.taskA_models.length > 0 && (
                <div className="flex items-center gap-2 text-sm ml-6">
                  <span className="text-neutral-400">Task A Model:</span>
                  <select
                    value={taskAName}
                    onChange={(e) => setTaskAName(e.target.value)}
                    className="rounded-lg bg-neutral-800 px-2 py-1 text-xs outline-none"
                    disabled={processing}
                  >
                    {health?.taskA_models.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {runTaskB && (
                <div className="flex items-center gap-2 text-sm ml-6">
                  <span className="text-neutral-400">Task B Model:</span>
                  {health && health.taskB_models.length > 0 ? (
                    <select
                      value={taskBName}
                      onChange={(e) => setTaskBName(e.target.value)}
                      className="rounded-lg bg-neutral-800 px-2 py-1 text-xs outline-none"
                      disabled={processing}
                    >
                      {health.taskB_models.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-neutral-500">
                      {health ? "Không có model nào" : "Đang tải..."}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
    <div className="grid grid-cols-12 gap-4">
      {/* LEFT: Video + Controls */}
      <div className="col-span-12 md:col-span-7">
        <div className="shadow-block relative rounded-sm border border-neutral-800 bg-neutral-900/60 p-4">
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              src={previewUrl || undefined}
              className="h-full w-full object-contain"
              controls
              onTimeUpdate={handleVideoTimeUpdate}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
            
            {/* Overlay alerts */}
            {currentEvent?.alert === "ATTACK_DETECTED" && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-red-900/80">
                <div className="rounded-xl bg-red-600 px-8 py-4 text-2xl font-bold text-white">
                  ⚠️ Phát hiện nguy hiểm ⚠️
                </div>
              </div>
            )}
            
            {currentEvent?.distraction_detected && (
              <div className="pointer-events-none absolute left-3 top-3 rounded-xl bg-orange-500/80 px-3 py-2 text-sm font-semibold text-white">
                ⚠️ Phát hiện mất tập trung
              </div>
            )}

            {/* Progress indicator khi đang xử lý (không che video) */}
            {processing && (
              <div className="pointer-events-none absolute top-3 right-3 rounded-lg bg-black/70 px-3 py-2">
                <div className="text-xs text-white mb-1">
                  Đang xử lý: {progress.toFixed(1)}%
                </div>
                <div className="w-32 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="text-xs text-neutral-300 mt-1">
                  {events.length} events
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={onPickVideo}
              className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20 btn-hover-effect"
              disabled={processing}
            >
              Chọn video
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={onChangeVideo}
            />
            
            {file && (
              <>
                {!processing ? (
                  <button
                    onClick={startProcessing}
                    className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 btn-hover-effect"
                  >
                    Bắt đầu xử lý
                  </button>
                ) : (
                  <button
                    onClick={stopProcessing}
                    className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400 btn-hover-effect"
                  >
                    Dừng
                  </button>
                )}
              </>
            )}
          </div>

          {error && (
            <div className="mt-3 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Results */}
      <div className="col-span-12 md:col-span-5">
        {/* Metadata */}
        {metadata && (
          <div className="shadow-block rounded-sm border border-neutral-800 bg-neutral-900/60 p-4 mb-4">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setExpandedVideoInfo(!expandedVideoInfo)}
            >
              <h3 className="text-lg font-semibold">Video Info</h3>
              <span className="text-neutral-400">{expandedVideoInfo ? "▼" : "▶"}</span>
            </div>
            
            {expandedVideoInfo && (
              <div className="space-y-2 text-sm mt-3">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Tổng frames:</span>
                  <span className="text-neutral-200">{metadata.total_frames}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">FPS:</span>
                  <span className="text-neutral-200">{metadata.fps.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Events nhận được:</span>
                  <span className="text-neutral-200">{events.length}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        {summary && (
          <div className="shadow-block rounded-sm border border-neutral-800 bg-neutral-900/60 p-4 mb-4">
            <h3 className="text-lg font-semibold mb-3">Tổng kết</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-400">Số lần detect:</span>
                <span className="text-neutral-200">{summary.detect_count || 0}</span>
              </div>
              {summary.alert_triggered && (
                <div className="mt-2 rounded-lg bg-red-900/40 px-3 py-2 text-red-300">
                  ⚠️ Đã phát hiện nguy hiểm
                </div>
              )}
              {summary.distraction_detected && (
                <div className="mt-2 rounded-lg bg-orange-900/40 px-3 py-2 text-orange-300">
                  ⚠️ Đã phát hiện mất tập trung
                </div>
              )}
            </div>
          </div>
        )}

        {/* Current Event */}
        {currentEvent && (
          <div className="shadow-block rounded-sm border border-neutral-800 bg-neutral-900/60 p-4 mb-4">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setExpandedCurrentEvent(!expandedCurrentEvent)}
            >
              <h3 className="text-lg font-semibold">
                Event #{currentEventIdx + 1} / {events.length}
              </h3>
              <span className="text-neutral-400">{expandedCurrentEvent ? "▼" : "▶"}</span>
            </div>

            {expandedCurrentEvent && (
              <div className="space-y-2 text-sm mt-3">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Frame:</span>
                  <span className="text-neutral-200">{currentEvent.frame_idx}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Time:</span>
                  <span className="text-neutral-200">
                    {currentEvent.time_s !== null && currentEvent.time_s !== undefined
                      ? `${currentEvent.time_s.toFixed(2)}s`
                      : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Stage:</span>
                  <span className="text-neutral-200">{currentEvent.stage}</span>
                </div>
                
                {currentEvent.taskA && (
                  <div className="mt-3 rounded-sm bg-white/5 p-2">
                    <div className="text-xs font-semibold mb-1">Task A:</div>
                    <div className="text-xs text-neutral-300">
                      {currentEvent.taskA.pred_label} - {getTaskALabelDisplay(currentEvent.taskA.pred_label)} {currentEvent.taskA.suspicious ? "⚠️" : "✓"}
                    </div>
                  </div>
                )}
                
                {currentEvent.taskB && (() => {
                  const isSuspicious = currentEvent.suspicious_B && !currentEvent.taskB.is_pos_thr;
                  const prob = currentEvent.taskB.prob_pos ?? 0;
                  const posClass = currentEvent.taskB.pos_class;
                  
                  return (
                    <div className="mt-3 rounded-sm bg-white/5 p-2">
                      <div className="text-xs font-semibold mb-1">Task B:</div>
                      <div className={`text-xs ${
                        currentEvent.taskB.is_pos_thr 
                          ? "text-red-400 font-bold" 
                          : isSuspicious 
                          ? "text-yellow-300 font-semibold" 
                          : "text-green-400"
                      }`}>
                        {posClass} ({prob.toFixed(4)})
                        {currentEvent.taskB.is_pos_thr 
                          ? <span className="ml-1">⚠️ PHÁT HIỆN</span> 
                          : isSuspicious 
                          ? <span className="ml-1">⚠️ Nghi vấn</span>
                          : <span className="ml-1">✓ An toàn</span>}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Events List */}
        {events.length > 0 && (
          <div className="shadow-block rounded-sm border border-neutral-800 bg-neutral-900/60 p-4">
            <h3 className="text-md font-semibold mb-3">Events Timeline ({events.length})</h3>
            <div className="max-h-64 overflow-auto space-y-1">
              {events.map((event, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    if (videoRef.current && event.time_s !== null && event.time_s !== undefined) {
                      videoRef.current.currentTime = event.time_s;
                    }
                  }}
                  className={`rounded-lg px-3 py-2 text-xs cursor-pointer transition ${
                    idx === currentEventIdx
                      ? "bg-emerald-500/20 border border-emerald-500"
                      : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>#{idx + 1}</span>
                    <span className="text-neutral-400">
                      {event.time_s !== null && event.time_s !== undefined
                        ? `${event.time_s.toFixed(1)}s`
                        : "N/A"}
                    </span>
                  </div>
                  
                  {/* Task A Details */}
                  {event.taskA && (() => {
                    const taskA = event.taskA;
                    const probScore = taskA.probs.find(p => p.label === taskA.pred_label)?.score ?? 0;
                    return (
                      <div className="mt-1 text-xs">
                        <span className="text-blue-300">Task A:</span>{" "}
                        <span className={taskA.suspicious ? "text-orange-400 font-semibold" : "text-green-400"}>
                          {taskA.pred_label} - {getTaskALabelDisplay(taskA.pred_label)} ({probScore.toFixed(2)})
                        </span>
                      </div>
                    );
                  })()}
                  
                  {/* Task B Details */}
                  {event.taskB && (() => {
                    const isSuspicious = event.suspicious_B && !event.taskB.is_pos_thr;
                    const prob = event.taskB.prob_pos ?? 0;
                    const posClass = event.taskB.pos_class;
                    
                    return (
                      <div className="mt-1 text-xs">
                        <span className="text-purple-300">Task B:</span>{" "}
                        <span className={
                          event.taskB.is_pos_thr 
                            ? "text-red-400 font-semibold" 
                            : isSuspicious 
                            ? "text-yellow-400 font-semibold" 
                            : "text-green-400"
                        }>
                          {posClass} ({prob.toFixed(4)})
                          {event.taskB.is_pos_thr 
                            ? <span className="ml-1">⚠️ PHÁT HIỆN</span> 
                            : isSuspicious 
                            ? <span className="ml-1">⚠️ Nghi vấn</span> 
                            : <span className="ml-1">✓ An toàn</span>}
                        </span>
                      </div>
                    );
                  })()}
                  
                  {event.alert && (
                    <div className="mt-1 text-red-400 font-semibold">
                      ⚠️ {event.alert === "ATTACK_DETECTED" ? "Phát hiện nguy hiểm" : event.alert}
                    </div>
                  )}
                  {event.distraction_detected && (
                    <div className="mt-1 text-orange-400">⚠️ Phát hiện mất tập trung</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!processing && events.length === 0 && !summary && (
          <div className="shadow-block rounded-sm border border-neutral-800 bg-neutral-900/60 p-4">
            <p className="text-sm text-neutral-400 text-center">
              Chọn video và bắt đầu xử lý để xem kết quả real-time
            </p>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
