import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export default getRequestConfig(async () => {
  // Read locale from cookie, fallback to "en"
  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value ?? "en";
  const supported = ["en", "vi"];
  const resolved = supported.includes(locale) ? locale : "en";

  return {
    locale: resolved,
    messages: (await import(`../messages/${resolved}.json`)).default,
  };
});
