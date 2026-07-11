import { CheckCircle, Circle } from "@phosphor-icons/react";
import { useI18n } from "@/lib/i18n";

const stages = ["source", "extracting", "clarifying", "confirming", "reviewing"] as const;

export type WorkspacePhase = "empty" | "extracting" | "clarifying" | "confirming" | "reviewing" | "complete";

function phaseIndex(phase: WorkspacePhase): number {
  if (phase === "empty") return -1;
  if (phase === "complete") return stages.length;
  return stages.findIndex((stage) => stage === phase);
}

export function WorkspaceStageRail({ phase }: { phase: WorkspacePhase }) {
  const { t } = useI18n();
  const active = phaseIndex(phase);
  return (
    <ol data-testid="review-progress" aria-label={t("stage.label")} className="grid grid-cols-2 gap-3 border-b border-hairline pb-4 sm:grid-cols-5">
      {stages.map((stage, index) => {
        const complete = index < active || phase === "complete";
        const current = index === active;
        return (
          <li key={stage} aria-current={current ? "step" : undefined} className="flex min-w-0 items-center gap-2">
            {complete ? (
              <CheckCircle className="h-4 w-4 shrink-0 text-verified" weight="fill" />
            ) : (
              <Circle className={`h-4 w-4 shrink-0 ${current ? "text-info" : "text-hairline-strong"}`} weight={current ? "duotone" : "regular"} />
            )}
            <span className={`truncate text-[10.5px] font-medium ${current ? "text-ink" : complete ? "text-verified" : "text-ink-faint"}`}>
              {t(`stage.${stage}` as "stage.source" | "stage.extracting" | "stage.clarifying" | "stage.confirming" | "stage.reviewing")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
