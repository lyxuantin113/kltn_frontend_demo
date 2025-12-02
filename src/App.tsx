import { useState } from "react";
import DriverDetectDemo from "./DriverDetectDemo";
import VideoRealtimeDemo from "./VideoRealtimeDemo";

const TABS = [
  {
    id: "image",
    label: "1. Predict Image",
    description: "Dự đoán trên ảnh đơn lẻ",
    component: <DriverDetectDemo />,
  },
  {
    id: "realtime",
    label: "2. Predict Video Realtime",
    description: "Mô phỏng realtime: dự đoán theo từng frame với stride để giảm tải",
    component: <VideoRealtimeDemo />,
  },
];

export default function App() {
  const [selectedIdx, setSelectedIdx] = useState(0);

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Khóa Luận Tốt Nghiệp - Nhóm 04 – Demo</h1>
          <h3 className="text-xl font-medium tracking-tight">Sinh viên: Lý Xuân Tín & Võ Lê Minh Quân</h3>
          <h3 className="text-xl font-medium tracking-tight">Giảng viên hướng dẫn: TS. Hồ Đắc Quán</h3>
        </header>

        {/* Tabs Navigation */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            {TABS.map((tab, idx) => (
              <button
                key={tab.id}
                onClick={() => setSelectedIdx(idx)}
                className={`px-4 py-2 mr-2 text-sm font-medium !rounded-none btn-hover-effect ${
                  selectedIdx === idx
                    ? "border-b-2 border-blue-500 text-blue-400 shadow-blue-500 shadow-md"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Description */}
        <div className="mb-6 rounded-lg bg-neutral-900/60 border border-neutral-800 px-4 py-3">
          <p className="text-sm text-neutral-300">
            <span className="font-semibold text-white">{TABS[selectedIdx].label}:</span>{" "}
            {TABS[selectedIdx].description}
          </p>
        </div>

        {/* Tab Content */}
        <div>{TABS[selectedIdx].component}</div>

        {/* Footer */}
        <div className="flex justify-center mt-10 text-neutral-400">
          Thanks for using our demo!
        </div>
      </div>
    </div>
  );
}
