import type { Activity } from "./itinerary";

const systemNames = [
  ["Trở về chỗ ở", "Return to accommodation"],
  [
    "Di chuyển tới điểm kết thúc hành trình",
    "Transfer to the final journey endpoint",
  ],
  ["Chỗ ở dự kiến", "Planned accommodation"],
  [
    "Mục dự kiến — chưa đủ thông tin địa điểm",
    "Planned item — location details pending",
  ],
] as const;

type ActivityName = Pick<Activity, "name" | "kind" | "evidence">;

export function isSystemActivityName(activity: ActivityName): boolean {
  return (
    activity.evidence?.source !== "user" &&
    ["transfer", "check_in", "check_out", "rest"].includes(
      activity.kind ?? "",
    ) &&
    systemNames.some((pair) => pair.includes(activity.name as never))
  );
}

export function localizedSystemName(
  activity: ActivityName,
  locale: string,
): string {
  const pair =
    isSystemActivityName(activity) &&
    systemNames.find((pair) => pair.includes(activity.name as never));
  return pair ? pair[locale === "vi" ? 0 : 1] : activity.name;
}

const assumptions: Record<string, string> = {
  "Proposed itinerary with planning allowances; confirm before booking.":
    "Lịch trình dự kiến; các khoản chi là dự toán, cần xác nhận trước khi đặt.",
  "Suggested lodging area; no specific property has been selected. Costs are room/night allowances to confirm before booking.":
    "Khu vực lưu trú đề xuất, chưa chọn khách sạn cụ thể. Chi phí là dự toán phòng/đêm; cần xác nhận trước khi đặt.",
  "Accommodation not selected": "Chưa chọn chỗ ở",
  "Price unavailable: no verified price source. Excluded from the total.":
    "Chưa có nguồn giá được xác minh. Khoản này không được cộng vào tổng.",
  "Incomplete planning estimate; confirm the missing price or travel details before booking.":
    "Chưa đủ giá hoặc thông tin di chuyển; cần xác nhận trước khi đặt.",
  "Unverified AI planning allowance, not a quote; confirm before booking.":
    "Dự toán AI chưa được xác minh, chưa phải báo giá; cần xác nhận trước khi đặt.",
  "Separate meal allowance during main travel, not a destination restaurant visit or a guaranteed onboard meal. Arrange food separately; not included in the main fare estimate.":
    "Ăn uống trong lúc di chuyển được tính riêng, không phải bữa ăn được bảo đảm trên phương tiện hay tại nhà hàng ở điểm đến. Cần tự thu xếp; chưa gồm trong giá vé chính.",
  "Included in the main travel budget; duration is a provisional allowance. Confirm the actual service and local arrival/departure times.":
    "Khoản này tính trong chi phí di chuyển chính; thời lượng chỉ là dự kiến. Cần xác nhận dịch vụ và giờ đến/đi địa phương.",
  "Room charges are counted in the accommodation budget.":
    "Tiền phòng được tính trong chi phí lưu trú.",
  "Included in the daily local or main travel allowance; no extra charge.":
    "Khoản này tính trong chi phí đi lại nội đô hoặc di chuyển chính; không cộng thêm.",
  "Catalog planning estimate; confirm the current price.":
    "Giá dự toán từ dữ liệu nguồn; cần xác nhận giá hiện tại.",
  "Catalog allowance for all local rides for the group this day.":
    "Dự toán từ dữ liệu nguồn cho các chuyến đi nội đô của cả nhóm trong ngày.",
  "Planning allowance per room per night; confirm taxes and availability.":
    "Dự toán mỗi phòng mỗi đêm; cần xác nhận thuế và tình trạng phòng.",
  "Confirmed group travel total for all main legs.":
    "Tổng tiền di chuyển cho cả nhóm trên mọi chặng chính do bạn xác nhận.",
  "Included in the confirmed group total on the first leg.":
    "Đã tính trong tổng tiền cả nhóm được xác nhận ở chặng đầu.",
  "Catalog planning allowance for this main route per person; confirm current prices.":
    "Dự toán mỗi người cho chặng chính từ dữ liệu nguồn; cần xác nhận giá hiện tại.",
  "Price not available; confirm before booking.":
    "Chưa có giá; cần xác nhận trước khi đặt.",
  "Travel price is missing; confirm before booking.":
    "Chưa có giá di chuyển; cần xác nhận trước khi đặt.",
  "Local-only route. All travel within this city is already included in the daily local transport allowance; no additional main travel charge.":
    "Hành trình trong một thành phố. Chi phí đi lại tính ở khoản di chuyển nội đô từng ngày, không cộng thêm chặng chính.",
  "10% planning contingency, not a confirmed service charge.":
    "Dự phòng 10% các khoản đã có giá; không phải phí dịch vụ đã xác nhận.",
};

export function localizedPlanningText(
  value: string | undefined,
  locale: string,
): string | undefined {
  if (!value) return value;
  if (locale === "vi") return assumptions[value] ?? value;
  return (
    Object.entries(assumptions).find(([, vi]) => vi === value)?.[0] ?? value
  );
}
