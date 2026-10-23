// How well does the model read a shoebox?
//
// Two sets:
//   samples   fixtures/shoebox + eval/truth.json, synthetic, committed
//   private   eval/private/shoebox + eval/private/truth.json, your own
//             redacted documents, git-ignored, never leaves the laptop
//
// A truth file holds the right answer for each file: its kind, the key date
// and amount, the medical category, and how many rent payments a statement
// holds. Optional "_totals" ({ rent, health }) is compared with the sheet,
// and "_today" (YYYY-MM-DD) pins the four-year window.
//
// Usage:  pnpm eval                          samples, Ollama gemma4:e4b
//         pnpm eval --model fake             samples, harness sanity check
//         pnpm eval:private                  your documents
//         pnpm eval:private --init           first run: makes the folder, or
//                                            drafts truth.draft.json from Gemma
//         OLLAMA_MODEL=gemma4:26b pnpm eval:private
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { FakeExtractor } from "../src/model/fake";
import type { Extractor } from "../src/model/extractor";
import { OllamaExtractor } from "../src/model/ollama";
import { run } from "../src/pipeline";
import type { ParsedDoc } from "../src/validate";

type Truth = { kind: string; date?: string; money?: number; category?: string; payments?: number };
type TruthFile = Record<string, Truth> & { _totals?: { rent: number; health: number }; _today?: string };

const { values } = parseArgs({
  options: {
    model: { type: "string", default: "ollama" },
    set: { type: "string", default: "samples" },
    init: { type: "boolean", default: false },
  },
});

const PRIVATE = values.set === "private";
const set = PRIVATE
  ? { dir: "eval/private/shoebox", truth: "eval/private/truth.json", results: "eval/private/results" }
  : { dir: "fixtures/shoebox", truth: "eval/truth.json", results: "eval/results" };

if (PRIVATE) {
  // Code guarantees, not good intentions: refuse to touch real documents
  // unless git is ignoring every path they or their readings could land in.
  for (const p of ["eval/private/shoebox/x.pdf", "eval/private/truth.json", "eval/private/results/x.json"]) {
    if (!gitIgnores(p)) {
      console.error(`Refusing to run: git would track ${p}. Check .gitignore has "eval/private/".`);
      process.exit(1);
    }
  }
  if (!existsSync(set.dir) || (await readdir(set.dir)).length === 0) {
    await mkdir(set.dir, { recursive: true });
    console.log(`Put your redacted documents in ${set.dir}/ (see eval/README.md), then run: pnpm eval:private --init`);
    process.exit(0);
  }
  if (values.model === "fake") {
    console.error("The fake model only knows the samples. Use Ollama for your own documents.");
    process.exit(1);
  }
}

const extractor: Extractor = values.model === "fake" ? FakeExtractor.forShoebox(set.dir) : new OllamaExtractor();
const truth: TruthFile = existsSync(set.truth) ? JSON.parse(await readFile(set.truth, "utf8")) : {};
const today = truth._today ?? (PRIVATE ? new Date().toISOString().slice(0, 10) : "2026-10-22");

if (!existsSync(set.truth) && !values.init) {
  console.error(`No ${set.truth} yet. Run with --init to draft one from the model's first reading.`);
  process.exit(1);
}

const t0 = Date.now();
const { parsed, validated } = await run(set.dir, extractor, today, (name) => console.log(`  · ${name}`));
const seconds = (Date.now() - t0) / 1000;

function reading(p: ParsedDoc): Truth {
  const x = p.extraction as Record<string, unknown> | null;
  return {
    kind: (x?.kind as string | undefined) ?? "(none)",
    date: (x?.date as string | undefined) ?? (x?.coversTo as string | undefined) ?? (x?.startDate as string | undefined),
    money: (x?.amount as number | undefined) ?? (x?.total as number | undefined),
    category: x?.category as string | undefined,
    payments: Array.isArray(x?.payments) ? x.payments.length : undefined,
  };
}

if (values.init) {
  // Gemma's first reading becomes the draft. Correcting a draft is quicker than typing one.
  const draft: Record<string, unknown> = { _today: today };
  for (const p of parsed) draft[p.name] = JSON.parse(JSON.stringify(reading(p))); // drops undefined fields
  const out = set.truth.replace(/\.json$/, ".draft.json");
  await writeFile(out, JSON.stringify(draft, null, 2) + "\n");
  console.log(`\nWrote ${out} from ${extractor.label}'s reading of ${parsed.length} files.`);
  console.log(`Fix anything it got wrong, delete fields you don't want scored, then rename it to ${path.basename(set.truth)}.`);
  process.exit(0);
}

let kindOk = 0;
let fieldsOk = 0;
let fieldsAll = 0;
let scored = 0;
const rows = parsed.map((p) => {
  const want = truth[p.name];
  const got = reading(p);
  if (!want) {
    console.log(`${p.name.padEnd(34)} ---- ${String(got.kind).padEnd(16)} (no truth entry, not scored)`);
    return { file: p.name, got, parseError: p.parseError, raw: p.raw };
  }
  scored++;
  const checks: [keyof Truth, boolean][] = [];
  if (want.date) checks.push(["date", got.date === want.date]);
  if (want.money !== undefined) checks.push(["money", got.money === want.money]);
  if (want.category) checks.push(["category", got.category === want.category]);
  if (want.payments !== undefined) checks.push(["payments", got.payments === want.payments]);
  if (got.kind === want.kind) kindOk++;
  fieldsAll += checks.length;
  fieldsOk += checks.filter(([, ok]) => ok).length;
  const wrong = checks.filter(([, ok]) => !ok).map(([f]) => `${f}=${JSON.stringify(got[f])} (want ${JSON.stringify(want[f])})`);
  console.log(
    `${p.name.padEnd(34)} ${got.kind === want.kind ? "ok  " : "KIND"} ${String(got.kind).padEnd(16)} ${wrong.join(" ")}` +
      (p.parseError ? `  [${p.parseError.slice(0, 80)}]` : ""),
  );
  return { file: p.name, want, got, wrong, parseError: p.parseError, raw: p.raw };
});

const rent = validated.rentBlocked.length ? 0 : validated.rentYears.reduce((s, y) => s + y.credit, 0);
const health = validated.healthYears.reduce((s, y) => s + y.estimatedRelief, 0);
const missing = Object.keys(truth).filter((k) => !k.startsWith("_") && !parsed.some((p) => p.name === k));
for (const f of validated.findings.filter((f) => f.level === "review")) console.log(`held: ${f.doc} (${f.rule}) ${f.message}`);
for (const m of missing) console.log(`missing: ${m} is in the truth file but not in the folder`);

const perDoc = parsed.length ? seconds / parsed.length : 0;
const summary = `${extractor.label} · ${values.set} · kind ${kindOk}/${scored} · fields ${fieldsOk}/${fieldsAll} · held ${validated.findings.filter((f) => f.level === "review").length} · ${perDoc.toFixed(1)}s per doc`;
console.log(`\n${summary}`);
const t = truth._totals;
console.log(`rent €${rent}${t ? ` (want €${t.rent})` : ""} · health €${health}${t ? ` (want €${t.health})` : ""}`);
if (PRIVATE) console.log("The summary line above has no document contents and is safe to share.");

await mkdir(set.results, { recursive: true });
const out = `${set.results}/${new Date().toISOString().slice(0, 16).replace(/:/g, "")}-${extractor.label.replace(/[^a-z0-9.]+/gi, "_")}.json`;
await writeFile(out, JSON.stringify({ summary, kindOk, fieldsOk, fieldsAll, seconds, rent, health, findings: validated.findings, rows }, null, 2));
console.log(`saved ${out}`);

function gitIgnores(p: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", p], { stdio: "ignore" });
    return true;
  } catch (e) {
    // Exit 1 means "not ignored". Anything else (no git, not a repo) means git can't track it either.
    return (e as { status?: number }).status !== 1;
  }
}
