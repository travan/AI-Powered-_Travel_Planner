import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { OllamaProvider } from "../packages/ai/src/providers/ollama.ts";
import {
  buildDetailPrompt,
  SYSTEM_PROMPT,
} from "../packages/ai/src/prompts/itinerary.ts";
import * as types from "../packages/types/src/index.ts";
import * as enrichment from "../apps/server/src/modules/itinerary/enrichment/travel-enrichment.ts";
import type {
  Itinerary,
  ItineraryInput,
} from "../packages/types/src/itinerary.ts";
import type { PreFetchedCityData } from "../packages/ai/src/provider.ts";

const { createPlanningCriteria } =
  (types as unknown as { default?: typeof types }).default ?? types;
const { itineraryQuality, enrichTravel, reconcileBudget } =
  (enrichment as unknown as { default?: typeof enrichment }).default ??
  enrichment;
const output = resolve(
  process.argv[2] ??
    `test-results/local-model-review/osaka-${new Date().toISOString().replace(/[:.]/g, "-")}`,
);
await mkdir(output, { recursive: true });
const planning = createPlanningCriteria();
planning.journey.origin = { label: "Hà Nội", source: "manual" };
planning.journey.destinations = ["osaka"];
planning.budget.currency = "USD";
planning.transport_preferences.mode = "flight";
planning.experience_preferences.interests = [
  "ẩm thực địa phương",
  "văn hóa",
  "đi bộ",
  "Universal Studios Japan",
];
const input: ItineraryInput = {
  cities: ["osaka"],
  num_days: 7,
  num_travelers: 2,
  currency: "USD",
  trip_style: "mid_range",
  locale: "vi",
  planning,
  prompt_text:
    "Lập lịch trình Osaka 7 ngày cho 2 người, xuất phát và trở về Hà Nội, nhịp độ cân bằng. Mỗi ngày đầy đủ phải có ăn sáng, hoạt động buổi sáng, ăn trưa, hoạt động buổi chiều, ăn tối, đi chơi sau bữa tối và chặng trở về khách sạn. Mỗi mục nêu giờ dự kiến, thời lượng, làm gì cụ thể và mẹo thực tế. Có một ngày dành cho Universal Studios Japan; bố trí nghỉ và bữa ăn hợp lý. Chưa có ngày đi, giờ bay, khách sạn hoặc ngân sách cố định. Không bịa giờ bay, giá đang bán, giờ mở cửa hoặc địa chỉ. Vẫn phải dự trù chi phí cho từng bữa ăn, hoạt động, đi lại và phòng/đêm; ghi rõ đây là ước tính lập ngân sách, đơn vị người/nhóm/phòng và giả định sử dụng. Chỗ ở và quán ăn chỉ là gợi ý, dùng khu vực tìm kiếm rõ ràng khi không có dữ liệu tin cậy. Không nhồi thêm địa điểm chỉ để đủ số lượng.",
};
const cities: PreFetchedCityData[] = [
  {
    city: "Osaka",
    country: "JP",
    timezone: "Asia/Tokyo",
    currency: "JPY",
    lat: null,
    lon: null,
    places: [],
    restaurants: [],
    hotels: [],
    sunrise: "Unknown",
    sunset: "Unknown",
    daylight_hours: "Unknown",
    weather_note:
      "No live weather or venue catalog supplied in this standalone test.",
    weather_highlights: [],
    weather_warnings: [],
    transport_options: [],
    ticket_options: {},
  },
];
const provider = new OllamaProvider({
  baseURL: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
  overviewModel: process.env.OLLAMA_OVERVIEW_MODEL ?? "gemma4:latest",
  detailModel: process.env.OLLAMA_DETAIL_MODEL ?? "qwen3.5:9b",
});
const overview = await provider.generateOverview(input, cities);
const save = (name: string, value: unknown) =>
  writeFile(
    resolve(output, name),
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
  );
await save("input.json", {
  input,
  cities,
  scope:
    "Standalone test of the actual provider and prompt builder; no authenticated account, city database or history supplied. The provider supplements Osaka venue names from linked public tourism references; trip-date availability and prices are not verified. No bookings or database writes.",
});
await save("system-prompt.txt", SYSTEM_PROMPT(input.locale));
await save(
  "full-detail-template.txt",
  buildDetailPrompt(input, overview, cities),
);
console.log(
  JSON.stringify({
    stage: "generating",
    model: process.env.OLLAMA_DETAIL_MODEL ?? "qwen3.5:9b",
    output,
  }),
);
await rm(resolve(output, "failure.json"), { force: true });
let callNumber = 0;
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
  const call = ++callNumber;
  const callDir = `calls/${String(call).padStart(2, "0")}`;
  await mkdir(resolve(output, callDir), { recursive: true });
  const callSave = (name: string, value: unknown) =>
    save(`${callDir}/${name}`, value);
  const requestBody = args[1]?.body;
  if (typeof requestBody === "string") {
    const request = JSON.parse(requestBody);
    await callSave("request.json", request);
    await callSave("prompt.txt", request.messages[1].content);
    if (call === 1)
      await save("detail-prompt.txt", request.messages[1].content);
    console.log(JSON.stringify({ stage: "request", call }));
  }
  if (call === 1 && process.env.LOCAL_REVIEW_OUTLINE) {
    const source = process.env.LOCAL_REVIEW_OUTLINE;
    const payload = JSON.parse(await readFile(source, "utf8"));
    await callSave("cached-from.txt", source);
    await callSave("response.json", payload);
    await callSave("raw-content.txt", payload.message.content);
    console.log(JSON.stringify({ stage: "cached_outline", source }));
    return new Response(
      JSON.stringify({
        ...payload,
        prompt_eval_count: 0,
        eval_count: 0,
        total_duration: 0,
      }),
      { headers: { "content-type": "application/json" } },
    );
  }
  const response = await nativeFetch(...args);
  const reader = response.clone().body!.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let lastReport = Date.now();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
    if (Date.now() - lastReport > 30_000) {
      await save("stream-progress.txt", raw);
      console.log(
        JSON.stringify({
          stage: "receiving",
          call,
          elapsed_seconds: Math.round((Date.now() - started) / 1000),
          received_characters: raw.length,
        }),
      );
      lastReport = Date.now();
    }
  }
  raw += decoder.decode();
  await callSave("stream.ndjson", raw);
  const chunks = raw
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const content = chunks.map((chunk) => chunk.message?.content ?? "").join("");
  const payload = { ...chunks.at(-1), message: { content } };
  await callSave("response.json", payload);
  if (content) await callSave("raw-content.txt", content);
  return response;
};
const started = Date.now();
let plan: Itinerary;
try {
  plan = await provider.generateDetail(input, overview, cities);
} catch (error) {
  await save("failure.json", {
    elapsed_ms: Date.now() - started,
    error: error instanceof Error ? error.message : String(error),
    usage: provider.getUsage(),
  });
  throw error;
}
await save("model-result.json", plan);
const quality = itineraryQuality(plan, input);
await save("quality-issues.json", quality);
const displayed = reconcileBudget(enrichTravel(plan, [], input), input);
await save("display-result.json", displayed);
const daySummary = plan.days.map((day) => ({
  day: day.day_number,
  activities: day.activities.length,
  meals: day.activities
    .filter((a) => a.kind === "meal")
    .map((a) => a.meal_slot ?? a.name),
  last_stop: day.activities.at(-1)?.name,
}));
await save("metrics.json", {
  elapsed_ms: Date.now() - started,
  usage: provider.getUsage(),
  days: daySummary,
  quality_issue_count: quality.length,
  cached_outline: !!process.env.LOCAL_REVIEW_OUTLINE,
});
let text = `# Kết quả thử model local\n\nModel: ${process.env.OLLAMA_DETAIL_MODEL ?? "qwen3.5:9b"}. Thời gian: ${Math.round((Date.now() - started) / 1000)} giây.\n\nĐầu vào: Osaka, 7 ngày, 2 người, nhịp cân bằng, xuất phát và về Hà Nội. Chưa có ngày đi, giờ bay, ngân sách hay khách sạn đã đặt. Không nạp dữ liệu tài khoản; dùng thêm danh mục địa điểm tham khảo công khai có nguồn. Nội dung bên dưới là gợi ý nguyên văn từ model, chưa xác minh địa điểm hay tính khả thi.\n\n${plan.title}\n\n${plan.overview}\n`;
for (const day of plan.days) {
  text += `\n## Ngày ${day.day_number}: ${day.title}\n\n`;
  for (const a of day.activities)
    text += `- **${a.time} · ${a.duration || `${a.duration_minutes ?? "?"} phút`} · ${a.name}**\n\n  ${a.description}\n\n  Dự toán: ${a.price?.amount ?? "chưa xác định"} ${a.currency}/${a.price?.scope === "person" ? "người" : "nhóm"}. ${a.price?.assumption ?? ""}\n${a.reason ? `\n  Lý do: ${a.reason}\n` : ""}${a.travel_minutes != null ? `\n  Di chuyển dự kiến từ điểm trước: ${a.travel_minutes} phút.\n` : ""}`;
}
text += `\n## Dự toán cho cả nhóm\n\nTổng dự trù: **${displayed.total_cost.toFixed(2)} ${displayed.currency}**. Đây là dự toán, không phải báo giá đã xác nhận.\n\n| Khoản | Dự trù cả nhóm | Giả định |\n|---|---:|---|\n`;
for (const item of displayed.budget_breakdown.items ?? [])
  text += `| ${item.label} | ${item.amount == null ? "Chưa ước tính" : `${item.amount.toFixed(2)} ${displayed.currency}`} | ${item.assumption ?? ""} |\n`;
text += `\n## Kết quả kiểm tra tự động\n\n${quality.length} vấn đề còn lại.\n\n${quality.map((i) => `- ${i.code}: ${i.message}`).join("\n")}\n`;
await save("review.md", text);
console.log(
  JSON.stringify(
    {
      stage: "complete",
      elapsed_ms: Date.now() - started,
      usage: provider.getUsage(),
      days: daySummary,
      quality_issue_count: quality.length,
      output,
    },
    null,
    2,
  ),
);
