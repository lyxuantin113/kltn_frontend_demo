/**
 * Mapping các label Task A (Driver Distraction) với tên tiếng Việt
 */
export const TASK_A_LABELS: Record<string, string> = {
  c0: "An toàn",
  c1: "Nhắn – Phải",
  c2: "Điện – Phải",
  c3: "Nhắn – Trái",
  c4: "Điện – Trái",
  c5: "Mở radio",
  c6: "Uống nước",
  c7: "Nhìn sau",
  c8: "Trang điểm",
  c9: "Trò chuyện",
  // YOLO Labels
  "Safe Driving": "An toàn",
  "Texting": "Nhắn tin",
  "Talking on the phone": "Nghe điện thoại",
  "Operating the Radio": "Chỉnh radio",
  "Drinking": "Uống nước",
  "Reaching Behind": "Với ra sau",
  "Hair and Makeup": "Trang điểm",
  "Talking to Passenger": "Trò chuyện",
  "Eyes Closed": "Nhắm mắt",
  "Yawning": "Ngáp",
  "Nodding Off": "Ngủ gật",
  "Eyes Open": "Mở mắt",
};

/**
 * Lấy tên hiển thị cho label Task A
 * @param label - Label (ví dụ: "c0", "c1", ...)
 * @returns Tên tiếng Việt hoặc label gốc nếu không tìm thấy
 */
export function getTaskALabelDisplay(label: string): string {
  return TASK_A_LABELS[label] || label;
}

