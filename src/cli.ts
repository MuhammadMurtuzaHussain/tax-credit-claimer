import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { FakeExtractor } from "./model/fake";
import type { Extractor } from "./model/extractor";
import { OllamaExtractor } from "./model/ollama";
import { run } from "./pipeline";
import { renderSheet } from "./sheet";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string", default: "ollama" },
    out: { type: "string", default: "out" },
    today: { type: "string" },
  },
});

const dir = positionals[0];
if (!dir) {
  console.error("usage: pnpm claim <shoebox-folder> [--model ollama|fake] [--out out] [--today YYYY-MM-DD]");
  process.exit(1);
}

const today = values.today ?? new Date().toISOString().slice(0, 10);
const extractor: Extractor = values.model === "fake" ? FakeExtractor.forShoebox(dir) : new OllamaExtractor();

console.log(`Reading ${dir} with ${extractor.label}`);
const { parsed, validated, skipped } = await run(dir, extractor, today, (name) => console.log(`  · ${name}`));
for (const s of skipped) console.log(`  - skipped ${s.name} (${s.why})`);

await mkdir(values.out!, { recursive: true });
const sheetPath = path.join(values.out!, "claim-sheet.md");
await writeFile(sheetPath, renderSheet(validated));
await writeFile(path.join(values.out!, "extractions.json"), JSON.stringify({ parsed: parsed.map(({ text: _t, ...p }) => p), validated }, null, 2));

const rent = validated.rentBlocked.length ? 0 : validated.rentYears.reduce((s, y) => s + y.credit, 0);
const health = validated.healthYears.reduce((s, y) => s + y.estimatedRelief, 0);
const count = (lvl: string) => validated.findings.filter((f) => f.level === lvl).length;
console.log(`\nExpected back: about €${(rent + health).toFixed(2)} (rent €${rent.toFixed(2)}, health €${health.toFixed(2)})`);
console.log(`${count("review")} to check by hand, ${count("dropped")} left out. Sheet: ${sheetPath}`);
