import { expect, test } from "bun:test";
import { ingest } from "./index.ts";
import { extractDrugName } from "./rxnav.ts";

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
  expect(med?.status).toBe("active");
});

test("preserves source-bound medication chronology", async () => {
  const patient = await ingest({
    medications: [{
      raw: "warfarin",
      status: "held",
      episode: "admission",
      start: "before admission",
      end: "hospital day 1",
      source_span: "warfarin was held on admission",
    }],
    allergies: [],
    diagnoses: [],
    labs: [],
  });
  expect(patient.medications[0]).toMatchObject({
    status: "held",
    episode: "admission",
    start: "before admission",
    end: "hospital day 1",
    source_span: "warfarin was held on admission",
  });
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

test("isolates drug names from dose, route, frequency, and source ingredient text", () => {
  expect(extractDrugName("sertraline 50 mg daily")).toBe("sertraline");
  expect(
    extractDrugName(
      "Bromfed DM syrup (brompheniramine 2 mg, pseudoephedrine 30 mg, dextromethorphan 10 mg per 5 mL), 5 mL every 6 hours",
    ),
  ).toBe("Bromfed DM");
  expect(extractDrugName("diltiazem 20mg IV")).toBe("diltiazem");
});

test("preserves source-declared combination ingredients for pair retrieval", async () => {
  const patient = await ingest({
    medications: [{
      raw: "Bromfed DM syrup (brompheniramine 2 mg, pseudoephedrine 30 mg, dextromethorphan 10 mg per 5 mL), 5 mL every 6 hours",
    }],
    allergies: [],
    diagnoses: [],
    labs: [],
  });
  expect(patient.medications[0]?.ingredients?.map((item) => item.name.toLowerCase())).toContain(
    "dextromethorphan",
  );
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

test("rejects a fuzzy approximate match with no shared drug stem", async () => {
  // RxNav approximate-matches "new antiretroviral regimen" to an unrelated
  // analgesic brand; the stem guard must reject it rather than hallucinate.
  const p = await ingest({
    medications: [{ raw: "new antiretroviral regimen" }],
    allergies: [],
    diagnoses: [],
    labs: [],
  });
  expect(p.medications[0]?.rxcui).toBeNull();
  expect(p.medications[0]?.resolution).toBe("unresolved");
});

test("resolves phytonadione to vitamin K, not a fuzzy analgesic brand", async () => {
  const p = await ingest({
    medications: [{ raw: "Phytonadione (vitamin-K) 2.5 mg by mouth" }],
    allergies: [],
    diagnoses: [],
    labs: [],
  });
  expect(p.medications[0]?.name.toLowerCase()).toContain("vitamin k");
  expect(p.medications[0]?.rxcui).toBeTruthy();
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

test("flags brand and ingredient concepts that resolve to the same active ingredient", async () => {
  const patient = await ingest({
    medications: [{ raw: "warfarin" }, { raw: "Coumadin" }],
    allergies: [],
    diagnoses: [],
    labs: [],
  });
  expect(patient.duplicate_medications).toHaveLength(1);
  expect(patient.duplicate_medications?.[0]?.ingredient_name.toLowerCase()).toBe("warfarin");
});
