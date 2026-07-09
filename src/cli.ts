import { ingest } from "./ingest/index.ts";

async function main(): Promise<void> {
  const fixturePath = process.argv[2];
  if (!fixturePath) {
    console.error("Usage: bun run src/cli.ts <fixture.json>");
    process.exit(1);
  }

  const file = Bun.file(fixturePath);
  if (!(await file.exists())) {
    console.error(`ingest: file not found: ${fixturePath}`);
    process.exit(1);
  }

  const raw = await file.json();
  const context = await ingest(raw);

  console.log(JSON.stringify(context, null, 2));

  const unresolved = context.medications.filter((m) => m.resolution === "unresolved");
  if (unresolved.length > 0) {
    console.error(`\n${unresolved.length} medication(s) unresolved:`);
    for (const med of unresolved) {
      console.error(`  - "${med.raw}"`);
    }
  }
}

main().catch((error) => {
  console.error("ingest failed:", error);
  process.exit(1);
});
