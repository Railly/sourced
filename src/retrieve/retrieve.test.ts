import { expect, test } from "bun:test";
import type { Medication } from "../types/index.ts";
import { ddinterPair, type DdinterRow } from "./index.ts";

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

function medication(name: string): Medication {
  return { raw: name, name, rxcui: "1", resolution: "exact" };
}

test("matches an exact DDInter pair in reverse order", () => {
  const evidence = ddinterPair(medication("amiodarone"), medication("warfarin"), rows, NOW);
  expect(evidence?.quoted_text).toBe("Major");
  expect(evidence?.source_id).toBe("DDInter1951/DDInter76");
});

test("uses the strongest DDInter component match for a combination medication", () => {
  const evidence = ddinterPair(
    medication("sulfamethoxazole / trimethoprim"),
    medication("warfarin"),
    rows,
    NOW,
  );
  expect(evidence?.quoted_text).toBe("Major");
  expect(evidence?.source_id).toBe("DDInter1951/DDInter1724");
});

test("returns null when no exact component pair exists", () => {
  expect(ddinterPair(medication("furosemide"), medication("amiodarone"), rows, NOW)).toBeNull();
});
