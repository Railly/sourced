import { expect, test } from "bun:test";
import { languageInstruction, translate } from "./i18n";

test("English is the explicit translation default", () => {
  expect(translate("en", "app.newReview")).toBe("New review");
});

test("Spanish translations interpolate values", () => {
  expect(translate("es", "packet.sharedAmbiguityBody", { first: "warfarina", second: "Coumadin" }))
    .toBe("warfarina y Coumadin comparten una sola aclaración.");
});

test("language instructions preserve clinical source data", () => {
  const instruction = languageInstruction("es");
  expect(instruction).toContain("Spanish");
  expect(instruction).toContain("medication names");
  expect(instruction).toContain("source quotations");
});
