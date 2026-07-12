import { Suspense } from "react";
import goldenCaseData from "../../data/fixtures/discharge-hf-afib.json";
import publishedCaseData from "../public/data/published-cases.json";
import { AgentWorkspace } from "@/components/agent-workspace";
import { I18nProvider } from "@/lib/i18n";
import type { PublishedCase } from "@/components/published-case-gallery";
import type { ReviewCaseInput } from "@/lib/review-case";

const goldenCase = goldenCaseData as ReviewCaseInput;
const publishedCases = publishedCaseData.cases as PublishedCase[];

export default function ReviewPage() {
  return (
    <Suspense>
      <I18nProvider>
        <AgentWorkspace goldenCase={goldenCase} publishedCases={publishedCases} />
      </I18nProvider>
    </Suspense>
  );
}
