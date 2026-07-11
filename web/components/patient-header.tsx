import type { PatientContext } from "@/lib/types";

export function PatientHeader({ summary, patient }: { summary: string; patient?: PatientContext }) {
  const title = summary.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? summary;
  const pending =
    /INR (?:check|follow-up)[^.]{0,60}pending/i.test(summary) ||
    /control de INR pendiente/i.test(patient?.note ?? "")
      ? "INR follow-up pending"
      : undefined;
  const duplicate = patient?.duplicate_medications?.[0];

  return (
    <section aria-labelledby="patient-overview-heading" className="pt-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h1
          id="patient-overview-heading"
          className="max-w-4xl font-serif-display text-[22px] leading-snug tracking-[-0.01em] text-ink sm:text-[27px]"
        >
          {title}
        </h1>
        <span className="shrink-0 rounded-full border border-info-border bg-info-bg px-3 py-1.5 text-[11px] font-semibold text-info">
          Synthetic or de-identified · no PHI
        </span>
      </div>

      {patient ? (
        <dl className="mt-4 grid grid-cols-2 border-y border-hairline sm:grid-cols-3 xl:grid-cols-6">
          <OverviewCell label="Diagnoses" value={patient.diagnoses.join("; ")} />
          <OverviewCell
            label="Medications"
            value={patient.medications.map((medication) => medication.name).join("; ")}
          />
          <OverviewCell label="Allergies" value={patient.allergies.join("; ") || "None recorded"} />
          <OverviewCell
            label="Key labs"
            value={patient.labs.map((lab) => `${lab.name} ${lab.value}${lab.unit ? ` ${lab.unit}` : ""}`).join("; ")}
          />
          <OverviewCell label="Pending" value={pending ?? "Review actions below"} />
          <OverviewCell
            label="Reconciliation"
            value={
              duplicate
                ? `${duplicate.medications.map((medication) => medication.name).join(" / ")} share ${duplicate.ingredient_name}`
                : "No duplicate ingredient detected"
            }
            warning={Boolean(duplicate)}
          />
        </dl>
      ) : null}

      <details className="group mt-3 text-[12.5px] text-ink-muted">
        <summary className="w-fit cursor-pointer list-none font-medium text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2">
          Full patient context <span aria-hidden="true">↓</span>
        </summary>
        <p className="mt-3 max-w-4xl leading-relaxed text-pretty">{summary}</p>
      </details>
    </section>
  );
}

function OverviewCell({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="min-w-0 border-b border-hairline px-3 py-4 odd:border-r sm:border-r sm:last:border-r-0 xl:border-b-0 xl:px-4">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className={`mt-1.5 text-[12px] leading-relaxed ${warning ? "font-medium text-moderate" : "text-ink"}`}>
        {value}
      </dd>
    </div>
  );
}
