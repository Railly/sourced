import { describe, expect, test } from "bun:test";
import { emptyReviewCase } from "./review-case";
import { canSubmitComposer, labUnitOptions, packetConfirmationBlocker } from "./workspace-ux";

describe("canSubmitComposer", () => {
  test("allows a file for intake but never treats a locked attachment as an answer", () => {
    const shared = { busy: false, disabled: false, deidentified: true, hasText: false, hasFile: true };
    expect(canSubmitComposer({ ...shared, attachmentLocked: false, requireText: false })).toBe(true);
    expect(canSubmitComposer({ ...shared, attachmentLocked: true, requireText: true })).toBe(false);
    expect(canSubmitComposer({ ...shared, hasText: true, attachmentLocked: true, requireText: true })).toBe(true);
  });
});

describe("labUnitOptions", () => {
  test("prioritizes conventional units without dropping the extracted unit", () => {
    expect(labUnitOptions("BP systolic", "mm Hg").slice(0, 2)).toEqual(["mm Hg", "mmHg"]);
    expect(labUnitOptions("Temp", "")).toEqual(expect.arrayContaining(["°C", "°F"]));
  });
});

describe("packetConfirmationBlocker", () => {
  test("explains every state that prevents confirmation", () => {
    const draft = emptyReviewCase();
    expect(packetConfirmationBlocker(draft, 1, false)).toContain("clarification");
    expect(packetConfirmationBlocker(draft, 0, false)).toContain("at least one medication");
    draft.medications = ["sertraline"];
    draft.labs = [{ name: "INR", value: "not a number", unit: "ratio", refLow: "", refHigh: "" }];
    expect(packetConfirmationBlocker(draft, 0, false)).toContain("lab row");
    draft.labs = [];
    expect(packetConfirmationBlocker(draft, 0, false)).toBeNull();
  });

  test("localizes confirmation blockers in Spanish", () => {
    const draft = emptyReviewCase();
    expect(packetConfirmationBlocker(draft, 1, false, "es")).toContain("Mantener como desconocido");
  });
});
