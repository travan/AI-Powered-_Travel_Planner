const messages: Record<string, { en: string; vi: string }> = {
  PLANNING_DATA_INSUFFICIENT: {
    en: "There is not enough verified data or pricing to complete this trip.",
    vi: "Chưa đủ dữ liệu hoặc dự toán để hoàn tất chuyến đi.",
  },
  PLANNING_BUDGET_UNSATISFIABLE: {
    en: "The group estimate exceeds your budget. Adjust the budget, duration or destinations.",
    vi: "Dự toán cả nhóm vượt ngân sách. Hãy điều chỉnh ngân sách, số ngày hoặc điểm đến.",
  },
  AI_RESPONSE_INVALID: {
    en: "The AI response could not satisfy the trip requirements. This request will not call AI again.",
    vi: "Kết quả AI chưa đáp ứng yêu cầu hành trình. Yêu cầu này sẽ không gọi AI thêm lần nữa.",
  },
  AI_RESULT_UNKNOWN: {
    en: "The AI result is uncertain. Automatic inference has stopped to avoid duplicate usage.",
    vi: "Chưa xác định được kết quả AI. Hệ thống đã dừng gọi lại để tránh tiêu tốn token trùng.",
  },
  GENERATION_DEADLINE_EXCEEDED: {
    en: "This request exceeded its processing deadline.",
    vi: "Yêu cầu đã vượt thời hạn xử lý.",
  },
  AI_QUOTA_EXHAUSTED: {
    en: "The AI service quota is exhausted. Try again after it resets.",
    vi: "Dịch vụ AI đã hết hạn mức. Hãy thử lại khi hạn mức được cấp lại.",
  },
  LOCATION_LOOKUP_UNAVAILABLE: {
    en: "The location resolver is temporarily unavailable.",
    vi: "Dịch vụ xác định địa điểm tạm thời chưa khả dụng.",
  },
};
export function planningErrorMessage(
  code?: string | null,
  locale = Intl.DateTimeFormat().resolvedOptions().locale,
) {
  const language = locale.toLowerCase().startsWith("vi") ? "vi" : "en";
  return (
    (code && messages[code]?.[language]) ||
    (language === "vi"
      ? "Không thể hoàn tất hành trình. Hãy kiểm tra lại yêu cầu."
      : "Planning could not be completed. Review your request.")
  );
}
