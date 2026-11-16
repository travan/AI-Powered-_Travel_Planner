const messages: Record<string, { en: string; vi: string }> = {
  AI_PROVIDER_CONFIGURATION_INVALID: {
    en: "The planning service configuration needs attention. Please try again later.",
    vi: "Dịch vụ tạo lịch trình cần được kiểm tra cấu hình. Vui lòng thử lại sau.",
  },
  AI_AUTH_INVALID: {
    en: "The planning service cannot connect to its AI provider.",
    vi: "Dịch vụ tạo lịch trình chưa kết nối được với nhà cung cấp AI.",
  },
  AI_RATE_LIMITED: {
    en: "The AI service is busy. Please wait before submitting a new request.",
    vi: "Dịch vụ AI đang bận. Hãy chờ một lúc trước khi tạo yêu cầu mới.",
  },
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
  params?: Record<string, string | number>,
  pipelineVersion?: number,
) {
  const language = locale.toLowerCase().startsWith("vi") ? "vi" : "en";
  if (code === "AI_QUOTA_EXHAUSTED") {
    const timestamp =
      typeof params?.retry_at === "string" ? Date.parse(params.retry_at) : NaN;
    const reset = Number.isFinite(timestamp)
      ? new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Ho_Chi_Minh",
        }).format(timestamp)
      : null;
    const message =
      language === "vi"
        ? `Dịch vụ tạo lịch trình đã hết hạn mức AI dùng chung. ${reset ? `Dự kiến cấp lại từ ${reset} (giờ Việt Nam).` : "Chưa xác định được thời điểm cấp lại."} Yêu cầu vẫn được lưu; hãy thử lại khi hạn mức phục hồi.`
        : `The planning service has reached its shared AI allowance. ${reset ? `Expected reset: ${reset} (Vietnam time).` : "The recovery time is not yet known."} Your request is saved; try again after the allowance is restored.`;
    return pipelineVersion === 2
      ? message +
          (language === "vi"
            ? " Khi đó, hãy quay lại bộ lập kế hoạch để tạo yêu cầu mới."
            : " Then return to the planner to create a new request.")
      : message;
  }
  return (
    (code && messages[code]?.[language]) ||
    (language === "vi"
      ? "Không thể hoàn tất hành trình. Hãy kiểm tra lại yêu cầu."
      : "Planning could not be completed. Review your request.")
  );
}
