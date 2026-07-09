import { expect, test } from "bun:test";
import { ingest } from "./index.ts";

// These hit the live RxNav API, so they are integration tests. They assert the
// resolution contract: real drugs (incl. Spanish + brand names) resolve, garbage
// fails loudly (rxcui: null, resolution: "unresolved") and never hallucinates.

test("resolves Spanish generic names to English RxCUI", async () => {
  const p = await ingest({
    note: "",
    medications: [{ raw: "amiodarona 200mg" }],
    allergies: [],
    diagnoses: [],
    labs: [],
  });
  const med = p.medications[0];
  expect(med?.rxcui).toBeTruthy();
  expect(med?.name.toLowerCase()).toContain("amiodarone");
  expect(med?.resolution).not.toBe("unresolved");
});

test("resolves a brand name (Coumadin)", async () => {
  const p = await ingest({
    note: "",
    medications: [{ raw: "Coumadin 5mg" }],
    allergies: [],
    diagnoses: [],
    labs: [],
  });
  expect(p.medications[0]?.rxcui).toBeTruthy();
});

test("fails loudly on gibberish — no hallucinated rxcui", async () => {
  const p = await ingest({
    note: "",
    medications: [{ raw: "not-a-real-drug-xyz123" }],
    allergies: [],
    diagnoses: [],
    labs: [],
  });
  expect(p.medications[0]?.rxcui).toBeNull();
  expect(p.medications[0]?.resolution).toBe("unresolved");
});

test("empty / whitespace med resolves to unresolved, not a crash", async () => {
  const p = await ingest({
    note: "",
    medications: [{ raw: "   " }],
    allergies: [],
    diagnoses: [],
    labs: [],
  });
  expect(p.medications[0]?.resolution).toBe("unresolved");
});
