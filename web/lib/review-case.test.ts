import { expect, test } from "bun:test";
import { reviewCaseInputSchema } from "@/lib/intake";
import { draftFromCase, serializeReviewCase } from "@/lib/review-case";

test("legacy medication input defaults to active", () => {
  const parsed = reviewCaseInputSchema.parse({
    medications: [{ raw: "warfarin" }],
    allergies: [],
    diagnoses: [],
    labs: [],
  });
  expect(parsed.medications[0]?.status).toBe("active");
});

test("draft round-trip preserves source-bound medication chronology", () => {
  const draft = draftFromCase({
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
  expect(serializeReviewCase(draft).medications[0]).toEqual({
    raw: "warfarin",
    status: "held",
    episode: "admission",
    start: "before admission",
    end: "hospital day 1",
    source_span: "warfarin was held on admission",
  });
});
