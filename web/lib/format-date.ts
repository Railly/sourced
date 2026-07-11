export function formatRetrievedAt(isoTimestamp: string, locale: "en" | "es" = "en"): string {
  const formatter = new Intl.DateTimeFormat(locale === "es" ? "es-419" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  return `${formatter.format(new Date(isoTimestamp))} UTC`;
}
