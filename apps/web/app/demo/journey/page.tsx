"use client";
import { UiText, useUiText } from "../../../components/i18n/UiText";

import React, { useState } from "react";
import Link from "next/link";
import {
  createPlanningCriteria,
  type Activity,
  type Itinerary,
  type TimelineKind,
} from "@travel/types";
import { JourneySummary } from "../../../components/itinerary/JourneySummary";
import { DayTimeline } from "../../../components/itinerary/DayTimeline";
import { TransportSection } from "../../../components/itinerary/TransportSection";
import { StayDiningRecommendations } from "../../../components/itinerary/StayDiningRecommendations";
import { BudgetBreakdown } from "../../../components/itinerary/BudgetBreakdown";
import { CoHorizonLogo } from "../../../components/layout/CoHorizonLogo";

const criteria = createPlanningCriteria();
criteria.journey.origin = { label: "Hà Nội", source: "manual" };
criteria.journey.destinations = ["da-nang"];
criteria.budget.total = 8000000;
criteria.transport_preferences = {
  mode: "flight",
  confirmed: false,
  arrival_at: "2026-11-20T10:00",
  departure_at: "2026-11-22T17:00",
  airport_buffer_minutes: 120,
};
criteria.stay_preferences.nightly_budget = 650000;
criteria.dining_preferences.cafe =
  "Quán địa phương yên tĩnh, gần tuyến tham quan";
criteria.experience_preferences.pace = "relaxed";
function stop(
  time: string,
  name: string,
  kind: TimelineKind,
  duration: string,
  description: string,
  cost: number,
  reason: string,
): Activity {
  return {
    id: `${time}-${name}`,
    time,
    name,
    kind,
    duration,
    description,
    cost,
    currency: "VND",
    category:
      kind === "transfer"
        ? "transport"
        : kind === "meal" || kind === "cafe"
          ? "food"
          : kind === "check_in" || kind === "check_out"
            ? "accommodation"
            : "attraction",
    maps_link: "",
    reason,
    alternative:
      "Điều chỉnh giờ hoặc chọn một địa điểm cùng khu vực nếu trời mưa/đông khách.",
    evidence: { source: "ai_suggestion" },
    price: {
      amount: cost,
      currency: "VND",
      scope: "group",
      status: "estimated",
    },
  };
}
const plan: Itinerary = {
  locale: "vi",
  schema_version: 2,
  version: 1,
  title: "Đà Nẵng thư thả — từ Hà Nội đến lúc trở về",
  overview:
    "Lịch trình minh họa 3 ngày cho 2 người. Tất cả giá, giờ và lựa chọn lưu trú/ăn uống dưới đây là dữ liệu mẫu để xem giao diện.",
  planning: criteria,
  total_cost: 7900000,
  currency: "VND",
  num_days: 3,
  num_travelers: 2,
  issues: [
    {
      code: "DEMO",
      severity: "warning",
      message:
        "Dữ liệu minh họa: chưa đặt vé/phòng; cần kiểm tra lịch bay, giá, thời tiết và quán thực tế.",
    },
    {
      code: "STAY_NOT_SELECTED",
      severity: "warning",
      message:
        "Chưa chọn chỗ ở. Xem phần Lưu trú để kiểm tra số phòng, số đêm và hướng dẫn đặt.",
    },
  ],
  seasonal_notes: {
    travel_month: "11/2026",
    daylight_hours: "",
    sunrise_time: "",
    sunset_time: "",
    weather_note: "Chưa tra dự báo cho ngày đi.",
    highlights: [],
    warnings: [],
  },
  transport_summary: [
    {
      segment: "Chặng đi: nhà → sân bay",
      from: "Điểm xuất phát tại Hà Nội",
      to: "Sân bay Nội Bài",
      recommended_mode: "taxi",
      options: [],
    },
    {
      segment: "Chặng bay đề xuất — cần xác minh",
      from: "Nội Bài",
      to: "Sân bay Đà Nẵng",
      recommended_mode: "flight",
      options: [],
    },
    {
      segment: "Trung chuyển đến chỗ ở",
      from: "Sân bay Đà Nẵng",
      to: "Khu vực Mỹ Khê",
      recommended_mode: "taxi",
      options: [],
    },
    {
      segment: "Chặng về: làm thủ tục trước 2 giờ",
      from: "Khu vực Mỹ Khê",
      to: "Sân bay Đà Nẵng",
      recommended_mode: "taxi",
      options: [],
    },
    {
      segment: "Bay về và về điểm xuất phát",
      from: "Đà Nẵng → Nội Bài",
      to: "Hà Nội",
      recommended_mode: "flight",
      options: [],
    },
  ],
  days: [
    {
      id: "demo-day-1",
      day_number: 1,
      date: "2026-11-20",
      city: "Đà Nẵng",
      title: "Đến nơi, nghỉ ngơi và dạo biển",
      daily_cost_estimate: 3300000,
      activities: [
        stop(
          "10:00",
          "Đến sân bay Đà Nẵng và nhận hành lý",
          "transfer",
          "1h",
          "Mốc giờ giả định để minh họa. Nhận hành lý rồi xác nhận điểm đón xe với tài xế. Giữ phần đầu ngày nhẹ để tránh vội khi chuyến bay chậm.",
          250000,
          "Có khoảng nghỉ và trung chuyển sau chuyến bay.",
        ),
        stop(
          "11:30",
          "Gửi hành lý tại chỗ ở khu Mỹ Khê",
          "check_in",
          "30 min",
          "Xác nhận giờ nhận phòng với nơi lưu trú. Nếu phòng chưa sẵn sàng, hỏi về việc gửi hành lý. Giá phòng được tính trong ngân sách lưu trú, không cộng lại vào mục này.",
          0,
          "Lấy chỗ ở làm điểm neo cho các hoạt động tiếp theo.",
        ),
        stop(
          "12:15",
          "Bữa trưa địa phương gần chỗ ở",
          "meal",
          "1h",
          "Tìm quán món địa phương trong khu vực Mỹ An. Kiểm tra thực đơn và giá trước khi gọi món. Đây là gợi ý tìm theo khu vực, chưa xác minh quán cụ thể.",
          200000,
          "Thuận tuyến, không phải quay lại trung tâm để ăn trưa.",
        ),
        stop(
          "15:00",
          "Café yên tĩnh khu Mỹ An",
          "cafe",
          "1h",
          "Ưu tiên quán độc lập gần chỗ ở để nghỉ sau chuyến đi. Xem menu và hỏi trước nếu cần ổ điện/chỗ làm việc. Quán và giá đồ uống cần được xác minh trực tiếp.",
          100000,
          "Khớp tiêu chí café địa phương và nhịp độ thư thả.",
        ),
        stop(
          "16:30",
          "Dạo bộ bãi biển Mỹ Khê",
          "visit",
          "1h",
          "Đi bộ ở khu vực công cộng, dừng nghỉ theo sức. Kiểm tra điều kiện thời tiết và chỉ dẫn an toàn tại chỗ. Không mặc định hoạt động tắm biển phù hợp trong mọi điều kiện.",
          0,
          "Trải nghiệm nhẹ nhàng gần chỗ ở.",
        ),
        stop(
          "18:30",
          "Ăn tối gần tuyến về chỗ ở",
          "meal",
          "1h",
          "Chọn quán có giá niêm yết và trao đổi khẩu vị với nhân viên. Xác nhận thành phần nếu có ăn kiêng hay dị ứng. Trở về chỗ ở sau bữa tối để nghỉ sớm.",
          300000,
          "Để lại thời gian nghỉ thay vì xếp kín ngày đến.",
        ),
      ],
    },
    {
      id: "demo-day-2",
      day_number: 2,
      date: "2026-11-21",
      city: "Đà Nẵng",
      title: "Văn hóa, món địa phương và café",
      daily_cost_estimate: 1700000,
      activities: [
        stop(
          "08:00",
          "Ăn sáng gần chỗ ở",
          "meal",
          "45 min",
          "Chọn quán sáng trong khu vực lưu trú. Xác minh thời gian bán và thực đơn tại chỗ. Khoản mẫu tính cho cả hai người.",
          120000,
          "Bắt đầu ngày mà không cần di chuyển xa.",
        ),
        stop(
          "09:30",
          "Bảo tàng Điêu khắc Chăm Đà Nẵng",
          "visit",
          "1h 30 min",
          "Dành thời gian xem bộ sưu tập theo nhịp độ của nhóm. Kiểm tra lịch mở cửa, vé và điều kiện tham quan trước khi đi. Chi phí trong demo chỉ là khoản dự trù.",
          200000,
          "Bổ sung trải nghiệm văn hóa vào chuyến đi thư thả.",
        ),
        stop(
          "12:00",
          "Bữa trưa món địa phương khu Hải Châu",
          "meal",
          "1h",
          "Tìm quán thuận đường từ điểm tham quan. Chọn món và hỏi rõ khẩu phần cho hai người. Nếu quán đông, chuyển sang lựa chọn khác trong cùng khu vực.",
          200000,
          "Ghép bữa ăn theo cụm địa lý để giảm đi vòng.",
        ),
        stop(
          "14:00",
          "Café địa phương gần sông Hàn",
          "cafe",
          "1h",
          "Chọn không gian phù hợp để nghỉ buổi chiều. Xác nhận giá đồ uống và tránh giả định mọi quán đều có góc nhìn ra sông. Có thể rút ngắn nếu nhóm muốn nghỉ tại chỗ ở.",
          100000,
          "Giữ một khoảng nghỉ giữa hai trải nghiệm.",
        ),
        stop(
          "16:00",
          "Đi bộ khu vực bờ sông Hàn",
          "visit",
          "1h",
          "Chọn đoạn đường công cộng phù hợp sức đi bộ. Tính thêm thời gian quay về chỗ ở. Không gắn lịch biểu diễn hay sự kiện khi chưa kiểm tra.",
          0,
          "Kết thúc buổi chiều bằng hoạt động nhẹ.",
        ),
        stop(
          "18:30",
          "Ăn tối địa phương và nghỉ ngơi",
          "meal",
          "1h",
          "Ưu tiên quán có thông tin món rõ ràng và phù hợp ngân sách. Xác nhận giờ phục vụ và yêu cầu ăn uống. Giữ buổi tối linh hoạt nếu trời mưa.",
          300000,
          "Phù hợp nhóm muốn nghỉ thay vì lịch tối dày.",
        ),
      ],
    },
    {
      id: "demo-day-3",
      day_number: 3,
      date: "2026-11-22",
      city: "Đà Nẵng",
      title: "Trả phòng và trở về Hà Nội",
      daily_cost_estimate: 2900000,
      activities: [
        stop(
          "08:00",
          "Ăn sáng và thu xếp hành lý",
          "meal",
          "1h",
          "Kiểm tra giấy tờ, hành lý và thông tin chuyến về. Ăn sáng gần chỗ ở để có thời gian chuẩn bị. Đây là ngày di chuyển nên giảm số điểm tham quan.",
          120000,
          "Ưu tiên chặng về thay vì thêm nhiều hoạt động.",
        ),
        stop(
          "11:00",
          "Trả phòng và gửi hành lý nếu cần",
          "check_out",
          "30 min",
          "Giờ minh họa; xác nhận chính sách trả phòng thực tế. Kiểm tra đồ dùng cá nhân và các khoản phát sinh. Chỉ gửi hành lý nếu nơi lưu trú đồng ý.",
          0,
          "Đặt rõ bước trả phòng trước khi ra sân bay.",
        ),
        stop(
          "12:00",
          "Ăn trưa gần điểm lấy hành lý",
          "meal",
          "1h",
          "Chọn quán gần chỗ ở để lấy hành lý thuận tiện. Giữ thời gian ăn linh hoạt. Không lên kế hoạch đi xa trước giờ về.",
          200000,
          "Giảm rủi ro trễ chặng bay.",
        ),
        stop(
          "14:00",
          "Lấy hành lý và di chuyển ra sân bay",
          "transfer",
          "1h",
          "Khung dự phòng mẫu, cần kiểm tra tình hình giao thông. Tính thêm thời gian chờ xe. Đến sân bay trước mốc bay giả định 17:00 để làm thủ tục.",
          250000,
          "Giữ khoảng làm thủ tục 2 giờ theo tiêu chí.",
        ),
        stop(
          "17:00",
          "Chặng bay về Nội Bài",
          "transfer",
          "1h 30 min",
          "Giờ và thời lượng chỉ để minh họa UI. Kiểm tra vé, sân bay và hành lý theo đặt chỗ thật. Không coi đây là lịch bay đang được bán.",
          0,
          "Chặng bay nằm trong ngân sách vé khứ hồi, không tính hai lần.",
        ),
        stop(
          "19:30",
          "Từ Nội Bài về điểm xuất phát Hà Nội",
          "transfer",
          "1h",
          "Mốc giả định sau thời gian lấy hành lý. Chọn phương tiện về địa chỉ cuối cùng. Xác nhận điểm đón và giá với nhà cung cấp.",
          250000,
          "Khép kín hành trình về đúng điểm đầu.",
        ),
      ],
    },
  ],
  hotels: [
    {
      id: "demo-stay",
      name: "Lựa chọn minh họa: chỗ ở khu Mỹ Khê",
      city: "Đà Nẵng",
      rooms: 1,
      nights: 2,
      nightly_estimate: 650000,
      stars: 0,
      price_per_night: "650.000 VND/phòng/đêm — giá mẫu",
      price_range: "",
      booking_url: "",
      airbnb_url: "",
      address: "Khu vực Mỹ Khê, chưa chọn cơ sở cụ thể",
      maps_link: "",
      note: "1 phòng × 2 đêm × 650.000 = 1.300.000 VND cho hai người. Gợi ý khu vực, không phải khách sạn đã xác minh. Trước khi đặt: xác nhận ngày 20–22/11, loại giường, thuế/phí, giờ nhận/trả phòng, chính sách hủy và thanh toán. Chưa đặt phòng.",
    },
  ],
  restaurants: [
    {
      id: "demo-lunch",
      name: "Gợi ý tìm quán món địa phương khu Mỹ An",
      city: "Đà Nẵng",
      day_number: 1,
      time: "12:15",
      kind: "meal",
      cuisine: "Món địa phương",
      price_per_person: "100.000 VND/người — dự trù mẫu",
      price_range: "",
      address: "Chưa chọn quán cụ thể",
      maps_link: "",
      tiktok_search_link: "",
      ig_search_link: "",
      note: "Ngày 1, bữa trưa sau khi gửi hành lý. Ưu tiên gần chỗ ở, món có giá rõ ràng và phù hợp khẩu vị. Xác minh quán, menu và yêu cầu ăn uống trước khi đi.",
    },
    {
      id: "demo-cafe",
      name: "Gợi ý café độc lập khu Mỹ An",
      city: "Đà Nẵng",
      day_number: 1,
      time: "15:00",
      kind: "cafe",
      cuisine: "Café địa phương",
      price_per_person: "50.000 VND/đồ uống — dự trù mẫu",
      price_range: "",
      address: "Tìm theo khu vực lưu trú",
      maps_link: "",
      tiktok_search_link: "",
      ig_search_link: "",
      note: "Ngày 1, nghỉ chiều trước khi dạo biển. Tiêu chí: yên tĩnh, quán độc lập, thuận tuyến. Xem lựa chọn khác trong cùng khu vực nếu hết chỗ hoặc không phù hợp.",
    },
  ],
  suggestions: [],
  budget_breakdown: {
    accommodation: 1300000,
    food: 1800000,
    activities: 400000,
    transport: 3800000,
    contingency: 600000,
    total: 7900000,
    currency: "VND",
    per_person: 3950000,
    per_day: 2633333,
  },
};
const tabs = [
  { id: "schedule", label: "Lịch trình 3 ngày" },
  { id: "transport", label: "Chặng đi / về" },
  { id: "stays", label: "Lưu trú" },
  { id: "dining", label: "Ăn uống & café" },
  { id: "budget", label: "Ngân sách" },
] as const;
export default function JourneyDemoPage() {
  const t = useUiText();

  const [tab, setTab] = useState<string>("schedule");
  return (
    <div className="min-h-screen bg-background text-on-surface">
      <header className="border-b border-outline-variant/20 bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <Link href="/plan" className="inline-flex">
            <CoHorizonLogo className="text-xl text-primary" />
          </Link>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
            {" "}
            <UiText
              id="tc64a8dfe1c08"
              fallback="DEMO · DỮ LIỆU MẪU · KHÔNG CẦN TÀI KHOẢN"
            />{" "}
          </span>
          <Link
            href="/plan"
            className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary"
          >
            {" "}
            <UiText
              id="t31f677fda35d"
              fallback="Thử nhập tiêu chí 5 bước →"
            />{" "}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-5 py-8">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-primary">
            {" "}
            <UiText
              id="tf284354603fe"
              fallback="Hà Nội → Đà Nẵng → Hà Nội"
            />{" "}
          </p>
          <h1 className="mt-2 text-3xl font-black">
            {" "}
            <UiText
              id="tec3f8015bb11"
              fallback="Một chuyến đi đầy đủ, từ lúc xuất phát đến khi trở về"
            />{" "}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-on-surface-variant">
            {" "}
            <UiText
              id="ta4086c37fb1d"
              fallback="Bấm các phần bên dưới để xem timeline, chặng bay/về, cách tính tiền phòng và gợi ý café/quán ăn. Đây là trang trình diễn giao diện với dữ liệu minh họa; không tạo tài khoản, đặt dịch vụ hoặc xác nhận giá thực."
            />{" "}
          </p>
        </div>
        <JourneySummary plan={plan} />
        <nav
          className="flex flex-wrap gap-2"
          aria-label={t("Các phần của demo")}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`rounded-full px-4 py-3 text-sm font-bold ${tab === t.id ? "bg-primary text-on-primary" : "border border-outline-variant/30 bg-surface"}`}
            >
              <UiText text={t.label} />
            </button>
          ))}
        </nav>
        <section aria-live="polite">
          {tab === "schedule" && (
            <DayTimeline
              days={plan.days}
              currency={plan.currency}
              showDailyBudget={false}
            />
          )}
          {tab === "transport" && (
            <TransportSection segments={plan.transport_summary} />
          )}
          {tab === "stays" && (
            <StayDiningRecommendations
              itinerary={{ ...plan, restaurants: [] }}
            />
          )}
          {tab === "dining" && (
            <StayDiningRecommendations itinerary={{ ...plan, hotels: [] }} />
          )}
          {tab === "budget" && (
            <BudgetBreakdown breakdown={plan.budget_breakdown} />
          )}
        </section>
      </main>
    </div>
  );
}
