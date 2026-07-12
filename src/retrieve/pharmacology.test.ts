import { expect, test } from "bun:test";
import type { EvidenceObject, Finding } from "../types/index.ts";
import { crossReferencePharmacology, enrichFindingsMechanism, type PharmacologyProfile } from "./pharmacology.ts";

function profile(over: Partial<PharmacologyProfile> & { drug: string }): PharmacologyProfile {
  return {
    rxcui: over.drug,
    setId: "set",
    splUrl: "https://example",
    inhibits: new Map(),
    substrateOf: new Map(),
    qtProlonging: null,
    anticholinergic: null,
    ...over,
  };
}

test("CYP inhibitor + substrate on the same enzyme yields one named mechanism", () => {
  const amiodarone = profile({ drug: "Amiodarone", inhibits: new Map([["2C9", "Amiodarone inhibits CYP2C9."]]) });
  const warfarin = profile({ drug: "Warfarin", substrateOf: new Map([["2C9", "Warfarin is a CYP2C9 substrate."]]) });
  const evidence = crossReferencePharmacology([amiodarone, warfarin], "2026-07-12T00:00:00Z");
  const cyp = evidence.filter((e) => e.id.startsWith("cyp:"));
  expect(cyp).toHaveLength(1);
  expect(cyp[0]?.claim_text).toContain("Amiodarone inhibits CYP2C9");
  expect(cyp[0]?.subject_drugs).toEqual(["Amiodarone", "Warfarin"]);
});

test("substrate without a matching inhibitor produces no CYP evidence", () => {
  const a = profile({ drug: "A", substrateOf: new Map([["3A4", "q"]]) });
  const b = profile({ drug: "B", substrateOf: new Map([["3A4", "q"]]) });
  expect(crossReferencePharmacology([a, b], "now").filter((e) => e.id.startsWith("cyp:"))).toHaveLength(0);
});

test("two QT-labeled drugs yield an additive QT evidence object", () => {
  const methadone = profile({ drug: "Methadone", qtProlonging: "Methadone can prolong the QT interval." });
  const metronidazole = profile({ drug: "Metronidazole", qtProlonging: "Metronidazole has been associated with QT prolongation." });
  const qt = crossReferencePharmacology([methadone, metronidazole], "now").filter((e) => e.id.startsWith("qt:"));
  expect(qt).toHaveLength(1);
  expect(qt[0]?.claim_text).toContain("QT");
});

test("enrichment names the mechanism and cites the evidence on a matching finding", () => {
  const evidence: EvidenceObject[] = [{
    id: "qt:Methadone:Metronidazole",
    claim_text: "Methadone and Metronidazole both carry QT-prolongation warnings; additive torsades risk",
    source_name: "openFDA-label",
    source_id: "s",
    source_url: "u",
    subject_drugs: ["Methadone", "Metronidazole"],
    quoted_text: "q",
    supporting_text: "q",
    retrieval_query: "r",
    retrieved_at: "now",
  }];
  const finding: Finding = { status: "flagged", severity: "minor", drugs: ["Methadone", "Metronidazole"], headline: "h", mechanism: "DDInter classifies the pair as Minor.", why_this_patient: "w", evidence_ids: ["ddinter:1:2"] };
  const [enriched] = enrichFindingsMechanism([finding], evidence);
  expect(enriched?.mechanism).toContain("QT-prolongation");
  expect(enriched?.evidence_ids).toContain("qt:Methadone:Metronidazole");
});

test("enrichment leaves a finding with no matching mechanism untouched", () => {
  const finding: Finding = { status: "flagged", severity: "minor", drugs: ["X", "Y"], headline: "h", mechanism: "orig", why_this_patient: "w", evidence_ids: ["ddinter:1:2"] };
  const [same] = enrichFindingsMechanism([finding], []);
  expect(same?.mechanism).toBe("orig");
});
