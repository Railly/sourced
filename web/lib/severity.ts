import type { Severity, Status } from "./types";

export interface SeverityStyle {
  label: string;
  text: string;
  bg: string;
  border: string;
  accent: string;
}

const SEVERITY_STYLES: Record<Severity, SeverityStyle> = {
  major: {
    label: "Major",
    text: "text-major",
    bg: "bg-major-bg",
    border: "border-major-border",
    accent: "bg-major",
  },
  moderate: {
    label: "Moderate",
    text: "text-moderate",
    bg: "bg-moderate-bg",
    border: "border-moderate-border",
    accent: "bg-moderate",
  },
  minor: {
    label: "Minor",
    text: "text-info",
    bg: "bg-info-bg",
    border: "border-info-border",
    accent: "bg-info",
  },
};

export function severityStyle(severity: Severity): SeverityStyle {
  return SEVERITY_STYLES[severity];
}

const STATUS_LABEL: Record<Status, string> = {
  "red-flag": "Red flag",
  flagged: "Flagged interaction",
  informational: "Informational",
};

export function statusLabel(status: Status): string {
  return STATUS_LABEL[status];
}

export function statusStyle(status: Status): SeverityStyle {
  if (status === "red-flag") return SEVERITY_STYLES.major;
  if (status === "flagged") return SEVERITY_STYLES.moderate;
  return SEVERITY_STYLES.minor;
}
