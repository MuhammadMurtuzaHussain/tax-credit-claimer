// How well does the model read the sample shoebox?
//
// eval/truth.json holds the right answer for each fixture: its kind, the key
// date and amount, and the medical category. The run also compares the final
// euro totals with what a perfect reading would give.
//
// Usage:  pnpm eval                          (Ollama, gemma4:e4b)
//         OLLAMA_MODEL=gemma4:26b pnpm eval
//         pnpm eval --model fake             (sanity check of the harness)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { FakeExtractor } from "../src/model/fake";
import type { Extractor } from "../src/model/extractor";
import { OllamaExtractor } from "../src/model/ollama";
import { run } from "../src/pipeline";

type Truth = { kind: string; date?: string; money?: number; category?: string };

const { values } = parseArgs({ options: { model: { type: "string", default: "ollama" } } });
const dir = "fixtures/shoebox";
const truth = JSON.parse(await readFile("eval/truth.json", "utf8")) as Record<string, Truth> & {
  _totals: { rent: number; health: number };
};
const extractor: Extractor = values.model === "fake" ? FakeExtractor.forShoebox(dir) : new OllamaExtractor();

const t0 = Date.now();
const { parsed, validated } = await run(dir, extractor, "2026-10-22");
const seconds = (Date.now() - t0) / 1000;

let kindOk = 0;
let fieldsOk = 0;
let fieldsAll = 0;
const rows = parsed.map((p) => {
  const want = truth[p.name];
  const x = p.extraction as Record<string, unknown> | null;
  const got = {
    kind: x?.kind ?? "(none)",
    date: (x?.date as string | undefined) ?? (x?.coversTo as string | undefined) ?? (x?.startDate as string | undefined),
    money: (x?.amount as number | undefined) ?? (x?.total as number | undefined),
    category: x?.category as string | undefined,
  };
  const checks: [string, boolean][] = [];
  if (want.date) checks.push(["date", got.date === want.date]);
  if (want.money !== undefined) checks.push(["money", got.money === want.money]);
  if (want.category) checks.push(["category", got.category === want.category]);
  if (got.kind === want.kind) kindOk++;
  fieldsAll += checks.length;
  fieldsOk += checks.filter(([, ok]) => ok).length;
  const wrong = checks.filter(([, ok]) => !ok).map(([f]) => `${f}=${JSON.stringify(got[f as keyof typeof got])}`);
  const line = `${p.name.padEnd(34)} ${got.kind === want.kind ? "ok  " : "KIND"} ${String(got.kind).padEnd(16)} ${wrong.join(" ")}${p.parseError ? `  [${p.parseError.slice(0, 80)}]` : ""}`;
  console.log(line);
  return { file: p.name, want, got, wrong, parseError: p.parseError, raw: p.raw };
});

const rent = validated.rentBlocked.length ? 0 : validated.rentYears.reduce((s, y) => s + y.credit, 0);
const health = validated.healthYears.reduce((s, y) => s + y.estimatedRelief, 0);
const n = parsed.length;
for (const f of validated.findings.filter((f) => f.level === "review")) console.log(`held: ${f.doc} (${f.rule}) ${f.message}`);
console.log(`\nkind ${kindOk}/${n} · fields ${fieldsOk}/${fieldsAll} · ${seconds.toFixed(0)}s (${(seconds / n).toFixed(1)}s per doc)`);
console.log(`rent €${rent} (perfect €${truth._totals.rent}) · health €${health} (perfect €${truth._totals.health})`);

await mkdir("eval/results", { recursive: true });
const out = `eval/results/${new Date().toISOString().slice(0, 16).replace(/:/g, "")}-${extractor.label.replace(/[^a-z0-9.]+/gi, "_")}.json`;
await writeFile(out, JSON.stringify({ extractor: extractor.label, kindOk, fieldsOk, fieldsAll, seconds, rent, health, findings: validated.findings, rows }, null, 2));
console.log(`saved ${out}`);
