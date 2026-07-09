const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatRetrievedAt(isoTimestamp: string): string {
  return `${dateFormatter.format(new Date(isoTimestamp))} UTC`;
}
