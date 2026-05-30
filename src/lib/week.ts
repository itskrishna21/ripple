export function getWeekStart(date: Date = new Date()): string {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;

  utc.setUTCDate(utc.getUTCDate() + diff);

  return utc.toISOString().slice(0, 10);
}
