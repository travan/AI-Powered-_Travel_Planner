/** All future consecutive trip windows contained in a calendar month. */
export function flexibleMonthWindows(
  month: string,
  days: number,
  today: string,
): { start: string; end: string }[] {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 30
  )
    return [];
  const [year, number] = month.split("-").map(Number);
  if (year! < 1000 || year! > 9998) return [];
  const count = new Date(Date.UTC(year!, number!, 0)).getUTCDate();
  return Array.from({ length: Math.max(0, count - days + 1) }, (_, i) => ({
    start: `${month}-${String(i + 1).padStart(2, "0")}`,
    end: `${month}-${String(i + days).padStart(2, "0")}`,
  })).filter((window) => window.start >= today);
}

export function plannerToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
