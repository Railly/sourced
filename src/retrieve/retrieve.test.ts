import { expect, test } from "bun:test";
import type { Medication } from "../types/index.ts";
import {
  createDdinterDataset,
  ddinterPair,
  medicationLabelTargets,
  medicationPairsForRetrieval,
  parseDdinterCsv,
  selectBestLabel,
  selectSupportingPassage,
  type DdinterRow,
} from "./index.ts";

const NOW = "2026-07-10T17:00:00.000Z";

const rows: DdinterRow[] = [
  {
    idA: "DDInter1874",
    drugA: "Trimethoprim",
    idB: "DDInter1951",
    drugB: "Warfarin",
    level: "Moderate",
  },
  {
    idA: "DDInter1951",
    drugA: "Warfarin",
    idB: "DDInter76",
    drugB: "Amiodarone",
    level: "Major",
  },
  {
    idA: "DDInter1951",
    drugA: "Warfarin",
    idB: "DDInter1724",
    drugB: "Sulfamethoxazole",
    level: "Major",
  },
];

const dataset = createDdinterDataset(rows);

function medication(name: string): Medication {
  return { raw: name, name, rxcui: "1", resolution: "exact" };
}

test("matches an exact DDInter pair in reverse order", () => {
  const evidence = ddinterPair(medication("amiodarone"), medication("warfarin"), dataset, NOW);
  expect(evidence?.quoted_text).toBe("Drug_A: Warfarin; Drug_B: Amiodarone; Level: Major");
  expect(evidence?.subject_drugs).toEqual(["Warfarin", "Amiodarone"]);
  expect(evidence?.source_id).toBe("DDInter1951/DDInter76");
});

test("uses the strongest DDInter component match for a combination medication", () => {
  const evidence = ddinterPair(
    medication("sulfamethoxazole / trimethoprim"),
    medication("warfarin"),
    dataset,
    NOW,
  );
  expect(evidence?.quoted_text).toBe(
    "Drug_A: Warfarin; Drug_B: Sulfamethoxazole; Level: Major",
  );
  expect(evidence?.source_id).toBe("DDInter1951/DDInter1724");
});

test("returns null when no exact component pair exists", () => {
  expect(
    ddinterPair(medication("furosemide"), medication("amiodarone"), dataset, NOW),
  ).toBeNull();
});

test("pair retrieval excludes non-active chronology and treats legacy status as active", () => {
  const pairs = medicationPairsForRetrieval({
    medications: [
      { ...medication("Active drug"), status: "active" },
      medication("Legacy drug"),
      { ...medication("Historical drug"), status: "historical" },
      { ...medication("Held drug"), status: "held" },
      { ...medication("Stopped drug"), status: "stopped" },
      { ...medication("One-time drug"), status: "one-time" },
      { ...medication("Uncertain drug"), status: "uncertain" },
    ],
    allergies: [],
    diagnoses: [],
    labs: [],
  });
  expect(pairs.map(([left, right]) => [left.name, right.name])).toEqual([
    ["Active drug", "Legacy drug"],
  ]);
});

test("parses quoted drug names with commas without shifting columns", () => {
  const parsed = parseDdinterCsv(
    'DDInterID_A,Drug_A,DDInterID_B,Drug_B,Level\nDDInter935,"Insulin human (inhalation, rapid acting)",DDInter652,Epinephrine,Moderate\n',
    "quoted.csv",
  );
  expect(parsed).toEqual([
    {
      idA: "DDInter935",
      drugA: "Insulin human (inhalation, rapid acting)",
      idB: "DDInter652",
      drugB: "Epinephrine",
      level: "Moderate",
      sourceFile: "quoted.csv",
    },
  ]);
});

test("keeps the strongest duplicate pair in the lookup index", () => {
  const duplicates = createDdinterDataset([
    { idA: "1", drugA: "A", idB: "2", drugB: "B", level: "Moderate" },
    { idA: "2", drugA: "B", idB: "1", drugB: "A", level: "Major" },
  ]);
  expect(ddinterPair(medication("A"), medication("B"), duplicates, NOW)?.quoted_text).toBe(
    "Drug_A: B; Drug_B: A; Level: Major",
  );
});

test("selects the most recent exact generic label instead of the first result", () => {
  const label = selectBestLabel(
    [
      {
        set_id: "wrong",
        effective_time: "20260101",
        openfda: { generic_name: ["amiodarone combination"] },
        drug_interactions: ["text"],
      },
      {
        set_id: "older-exact",
        effective_time: "20250101",
        openfda: { generic_name: ["amiodarone"] },
        drug_interactions: ["text"],
      },
      {
        set_id: "newer-exact",
        effective_time: "20260201",
        openfda: { generic_name: ["amiodarone"] },
        drug_interactions: ["text"],
      },
    ],
    "amiodarone",
  );
  expect(label?.set_id).toBe("newer-exact");
});

test("extracts a short exact passage containing the interacting medication", () => {
  const text =
    "General information about the product. Amiodarone potentiates the anticoagulant response to warfarin. Monitor prothrombin time.";
  expect(selectSupportingPassage(text, ["warfarin"])).toBe(
    "Amiodarone potentiates the anticoagulant response to warfarin. Monitor prothrombin time.",
  );
});

test("retrieves label targets for a brand and each declared ingredient", () => {
  const targets = medicationLabelTargets([{
    raw: "Aldactone 100 mg",
    name: "Aldactone",
    rxcui: "17767",
    resolution: "exact",
    ingredients: [{ rxcui: "9997", name: "spironolactone" }],
  }]);
  expect(targets.map((item) => [item.name, item.rxcui])).toEqual([
    ["Aldactone", "17767"],
    ["spironolactone", "9997"],
  ]);
});
