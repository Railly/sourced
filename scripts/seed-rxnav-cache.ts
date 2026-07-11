import { ingest } from "../src/ingest/index.ts";
import { flushRxNavCache, isRxNavRecording } from "../src/ingest/rxnav-cache.ts";

/**
 * Records the RxNav responses the ingest tests depend on into the committed
 * cache so `bun test` (and CI with RXNAV_OFFLINE=1) never hits the network.
 * Run with RXNAV_RECORD=1 when a test adds a new medication string.
 */
if (!isRxNavRecording()) {
  console.error("Run with RXNAV_RECORD=1 to seed the RxNav cache.");
  process.exit(1);
}

const drugs = [
  "amiodarona 200mg",
  "Coumadin 5mg",
  "Coumadin",
  "warfarin",
  "Bromfed DM syrup (brompheniramine 2 mg, pseudoephedrine 30 mg, dextromethorphan 10 mg per 5 mL), 5 mL every 6 hours",
];

for (const raw of drugs) {
  await ingest({ medications: [{ raw }], allergies: [], diagnoses: [], labs: [] });
}
flushRxNavCache();
console.log(`Seeded RxNav cache for ${drugs.length} test medications.`);
