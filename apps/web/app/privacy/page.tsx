import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = { title: "Privacy — Horizon Travel Planner" };
const policy = {
  vi: {
    title: "Quyền riêng tư — Horizon Travel Planner",
    updated: "Cập nhật ngày 10/11/2026",
    intro:
      "Horizon Travel Planner là ứng dụng lập kế hoạch du lịch do Trà Nguyễn Thị Vân vận hành. Trang này giải thích dữ liệu được xử lý khi bạn dùng ứng dụng và đăng nhập bằng Google.",
    sections: [
      [
        "Thông tin đăng nhập Google",
        "Ứng dụng chỉ yêu cầu openid, email và profile. Google cung cấp mã định danh tài khoản, email và thông tin hồ sơ cơ bản. Ứng dụng lưu mã định danh Google, email và tên để tạo hoặc liên kết tài khoản. Ứng dụng không nhận mật khẩu Google và không yêu cầu quyền đọc Gmail, Drive, Calendar hay danh bạ.",
      ],
      [
        "Mục đích sử dụng",
        "Thông tin Google được dùng để xác thực, hiển thị tài khoản và cho phép bạn truy cập lịch trình của mình. Dữ liệu nhận từ Google không được dùng để bán quảng cáo, bán cho nhà môi giới dữ liệu hoặc huấn luyện mô hình AI. Token Google được xử lý để xác minh đăng nhập; ứng dụng không lưu Google access/refresh token để gọi dịch vụ Google sau đó.",
      ],
      [
        "Dữ liệu du lịch và AI",
        "Ứng dụng lưu thông tin bạn nhập như điểm đến, ngày đi, ngân sách, sở thích và lịch trình đã tạo. Khi bạn yêu cầu lập lịch trình bằng AI, thông tin yêu cầu du lịch được gửi đến nhà cung cấp AI đang được cấu hình; production hiện dùng Cloudflare Workers AI. Mã định danh Google và token OAuth không được thêm vào prompt. Hãy tránh nhập thông tin nhạy cảm không cần thiết vào yêu cầu du lịch.",
      ],
      [
        "Ghi nhớ và dataset huấn luyện",
        "Mỗi yêu cầu, kết quả AI (kể cả bản sửa và kết quả cache), phản hồi, chỉnh sửa lịch trình và thay đổi chi tiêu được lưu trong database. Nếu bật ghi nhớ, các lần tạo sau tham khảo lịch sử riêng và chi tiêu đã duyệt mà bạn còn quyền truy cập. Có thể tắt ghi nhớ trong mục Quyền riêng tư và cá nhân hóa ở Hồ sơ. Khi bạn gửi phản hồi, điểm, ghi chú và tuyến tóm tắt được gửi qua email cho đội vận hành. Lưu dữ liệu không tự huấn luyện lại trọng số model. Chuẩn bị dataset mặc định tắt và cần lựa chọn riêng: bản xuất JSONL chỉ gồm lịch trình được đánh giá tốt, đủ chất lượng và thống kê chi tiêu đã duyệt; loại trừ yêu cầu tự do, danh tính Google, tên người, địa chỉ, ngày đi cụ thể, token và mã đặt chỗ. Dataset không tự gửi đến dịch vụ huấn luyện. Xóa tài khoản sẽ xóa lịch sử học trong database; file đã tải về cần tự quản lý.",
      ],
      [
        "Lưu trữ và nhà cung cấp hạ tầng",
        "Ứng dụng dùng Vercel cho web, Cloudflare cho API và AI, Supabase PostgreSQL cho dữ liệu ứng dụng. Các dịch vụ này xử lý dữ liệu cần thiết để vận hành hệ thống; nhà vận hành có thể truy cập dữ liệu để hỗ trợ và xử lý sự cố. Phiên đăng nhập lưu trong cookie HttpOnly và bản ghi phiên phía server. Log ứng dụng production giới hạn ở thông tin kỹ thuật, không chủ động ghi nội dung prompt, hồ sơ Google, mật khẩu, cookie hay token. Google và nhà cung cấp hạ tầng có thể xử lý dữ liệu kỹ thuật theo chính sách riêng.",
      ],
      [
        "Cookie và thời gian lưu",
        "Cookie phiên truy cập có thời hạn 15 phút; cookie làm mới phiên tối đa 30 ngày. Cookie ngôn ngữ ghi nhớ lựa chọn giao diện. Log Cloudflare Free giữ tối đa 7 ngày; nếu cấu hình Grafana Free làm nơi nhận log thì log ở đó giữ tối đa 14 ngày. Tài khoản và lịch trình được lưu để bạn có thể sử dụng lại cho đến khi được xóa; các mốc hết hạn phiên không tự xóa tài khoản hoặc lịch trình.",
      ],
      [
        "Lựa chọn và yêu cầu xóa dữ liệu",
        "Bạn có thể đăng xuất hoặc thu hồi quyền của ứng dụng tại trang kết nối tài khoản Google. Thu hồi quyền Google không tự xóa tài khoản, lịch trình hoặc phiên ứng dụng đã cấp; hãy đăng xuất và liên hệ địa chỉ bên dưới nếu muốn yêu cầu xóa dữ liệu hoặc hỗ trợ về quyền truy cập. Yêu cầu được nhà vận hành xử lý sau khi xác minh quyền sở hữu tài khoản. Một số bản sao có thể còn trong hệ thống sao lưu theo vòng đời của nhà cung cấp.",
      ],
      [
        "Thay đổi",
        "Trang này sẽ được cập nhật khi cách xử lý dữ liệu thay đổi. Nếu ứng dụng cần thêm quyền Google hoặc dùng dữ liệu Google cho mục đích mới, ứng dụng sẽ yêu cầu sự đồng ý tương ứng trước khi thực hiện.",
      ],
    ],
    contact: "Liên hệ về dữ liệu và hỗ trợ",
    back: "Quay lại ứng dụng",
    connections: "Quản lý kết nối Google",
  },
  en: {
    title: "Privacy — Horizon Travel Planner",
    updated: "Updated November 10, 2026",
    intro:
      "Horizon Travel Planner is a travel planning application operated by Trà Nguyễn Thị Vân. This page explains the data processed when you use the application and sign in with Google.",
    sections: [
      [
        "Google sign-in information",
        "The application requests only openid, email and profile. Google provides an account identifier, email address and basic profile information. The application stores your Google identifier, email and name to create or link your account. It does not receive your Google password or request access to Gmail, Drive, Calendar or contacts.",
      ],
      [
        "How Google information is used",
        "Google information is used to authenticate you, display your account and provide access to your trips. Data received from Google is not used for advertising, sold to data brokers or used to train AI models. Google tokens are processed to verify sign-in; the application does not store Google access or refresh tokens for later calls to Google services.",
      ],
      [
        "Travel data and AI",
        "The application stores information you enter, such as destinations, dates, budgets, preferences and generated trips. When you request an AI itinerary, your travel request is sent to the configured AI provider; production currently uses Cloudflare Workers AI. Google account identifiers and OAuth tokens are not added to prompts. Avoid entering unnecessary sensitive information in travel requests.",
      ],
      [
        "Planning memory and training datasets",
        "Each request, AI candidate (including repairs and cache returns), feedback, revision and spending change is stored in the database. When enabled, planning memory uses your history and approved expenses you can still access. You can disable memory under Privacy and personalization in your profile. When you submit feedback, the rating, note and route summary are emailed to the team. Storage does not automatically retrain model weights. Dataset preparation is off by default and requires a separate choice: JSONL exports include positively reviewed, quality-checked plans and approved spending statistics, excluding free-text requests, Google identity, personal names, addresses, exact dates, tokens and booking references. Datasets are not automatically uploaded to training services. Account deletion removes database learning history; downloaded files remain under your control.",
      ],
      [
        "Storage and infrastructure providers",
        "The application uses Vercel for the web, Cloudflare for its API and AI, and Supabase PostgreSQL for application data. These services process the data needed to operate the application; the operator may access data for support and troubleshooting. Application sessions use HttpOnly cookies and server-side session records. Production application logs are limited to technical information and do not intentionally record prompts, Google profiles, passwords, cookies or tokens. Google and infrastructure providers may process technical data under their own policies.",
      ],
      [
        "Cookies and retention",
        "Access-session cookies expire after 15 minutes; refresh-session cookies last up to 30 days. A language cookie remembers your interface preference. Cloudflare Free logs are retained for up to seven days; if Grafana Free is configured as the log destination, its logs are retained for up to 14 days. Accounts and trips are retained for reuse until deleted; session expiry does not automatically delete an account or its trips.",
      ],
      [
        "Your choices and deletion requests",
        "You can sign out or revoke the application's access in your Google Account connections. Revoking Google access does not automatically delete your application account, trips or existing application sessions; sign out and contact the address below to request deletion or help with access. The operator handles requests after verifying account ownership. Copies may remain in backups according to provider retention cycles.",
      ],
      [
        "Changes",
        "This page will be updated when data handling changes. If the application needs additional Google permissions or a new use of Google data, it will request the relevant consent before proceeding.",
      ],
    ],
    contact: "Data requests and support",
    back: "Back to the application",
    connections: "Manage Google connections",
  },
};
export default async function PrivacyPage() {
  const content = (await getLocale()) === "vi" ? policy.vi : policy.en;
  return (
    <main className="mx-auto max-w-3xl space-y-7 px-6 py-12 text-on-surface">
      <Link href="/plan" className="text-primary underline">
        {content.back}
      </Link>
      <header className="space-y-3">
        <h1 className="text-3xl font-bold">{content.title}</h1>
        <p className="text-sm text-on-surface-variant">{content.updated}</p>
        <p>{content.intro}</p>
      </header>
      {content.sections.map(([title, text]) => (
        <section key={title} className="space-y-2">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="leading-7">{text}</p>
        </section>
      ))}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">{content.contact}</h2>
        <a
          className="text-primary underline"
          href="mailto:travan.it.96@gmail.com"
        >
          travan.it.96@gmail.com
        </a>
        <p>
          <a
            className="text-primary underline"
            href="https://myaccount.google.com/connections"
            rel="noreferrer"
          >
            {content.connections}
          </a>
        </p>
      </section>
    </main>
  );
}
