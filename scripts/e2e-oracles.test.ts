import { describe, expect, test } from "bun:test";
import {
  assertClinicalOracles,
  fingerprintEntries,
  inclusiveSchedule,
  normalizeMedication,
} from "./e2e-oracles";

const valid = {
  activeMedications: ["Apixaban (Eliquis) 5 mg BID", "Amiodarone 200 mg daily"],
  expectedActiveMedications: ["apixaban", "amiodarone"],
  forbiddenActiveMedications: [],
  expectedSurvivingPairs: [["apixaban", "amiodarone"]],
  forbiddenPairs: [],
  findings: [{ drugs: ["Apixaban", "Amiodarone"], citationCount: 2, renderedCitationCount: 2 }],
  reportFindingCount: 1,
};

describe("clinical E2E oracles", () => {
  test("normalizes medication labels and accepts a cited surviving pair", () => {
    expect(normalizeMedication("  Ápixaban (Eliquis)  ")).toBe("apixaban eliquis");
    expect(assertClinicalOracles(valid).reportFindingCount).toBe(1);
  });

  test("requires an expected pair to survive in one finding", () => {
    expect(() => assertClinicalOracles({
      ...valid,
      findings: [
        { drugs: ["Apixaban", "Diltiazem"], citationCount: 1, renderedCitationCount: 1 },
        { drugs: ["Amiodarone", "Warfarin"], citationCount: 1, renderedCitationCount: 1 },
      ],
      reportFindingCount: 2,
    })).toThrow("single finding");
  });

  test("rejects forbidden medications and pairs", () => {
    expect(() => assertClinicalOracles({
      ...valid,
      forbiddenActiveMedications: ["eliquis"],
    })).toThrow("Forbidden active medications survived");
    expect(() => assertClinicalOracles({
      ...valid,
      forbiddenPairs: [["apixaban", "amiodarone"]],
    })).toThrow("Forbidden pairs were published");
  });

  test("does not use tiny substring matches", () => {
    expect(() => assertClinicalOracles({
      ...valid,
      expectedActiveMedications: ["api"],
    })).toThrow("Missing expected active medications: api");
    expect(assertClinicalOracles({
      ...valid,
      activeMedications: ["api"],
      expectedActiveMedications: ["api"],
    }).activeMedications).toEqual(["api"]);
  });

  test("rejects uncited findings and count mismatches", () => {
    expect(() => assertClinicalOracles({
      ...valid,
      findings: [{ drugs: ["Apixaban", "Amiodarone"], citationCount: 0, renderedCitationCount: 0 }],
    })).toThrow("no cited evidence");
    expect(() => assertClinicalOracles({ ...valid, reportFindingCount: 2 })).toThrow("does not match report count");
  });

  test("rejects a citation count that is not rendered", () => {
    expect(() => assertClinicalOracles({
      ...valid,
      findings: [{ drugs: ["Apixaban", "Amiodarone"], citationCount: 2, renderedCitationCount: 1 }],
    })).toThrow("rendered 1 citations");
  });

  test("rejects malformed pair contracts", () => {
    expect(() => assertClinicalOracles({
      ...valid,
      expectedSurvivingPairs: [["apixaban"]],
    })).toThrow("invalid pair");
  });
});

test("fingerprint entries are order independent and content sensitive", () => {
  const left = fingerprintEntries([
    { path: "b.ts", contents: "two" },
    { path: "a.ts", contents: "one" },
  ]);
  const right = fingerprintEntries([
    { path: "a.ts", contents: "one" },
    { path: "b.ts", contents: "two" },
  ]);
  const changed = fingerprintEntries([
    { path: "a.ts", contents: "changed" },
    { path: "b.ts", contents: "two" },
  ]);
  expect(left).toBe(right);
  expect(changed).not.toBe(left);
});

test("eight-hour schedules include the exact final boundary", () => {
  const start = 1_000;
  const end = start + 8 * 3_600_000;
  const smoke = inclusiveSchedule(start, end, 600_000);
  const intake = inclusiveSchedule(start, end, 1_800_000, 1_800_000);
  const full = inclusiveSchedule(start, end, 3_600_000, 3_600_000);
  expect(smoke).toHaveLength(49);
  expect(intake).toHaveLength(16);
  expect(full).toHaveLength(8);
  expect(smoke.at(-1)).toBe(end);
  expect(intake.at(-1)).toBe(end);
  expect(full.at(-1)).toBe(end);
});
