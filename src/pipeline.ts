import { readFile } from "node:fs/promises";
import path from "node:path";
import { normaliseDates } from "./dates";
import { readShoebox } from "./inputs";
import type { Extractor, InputDoc } from "./model/extractor";
import { Extraction, Profile } from "./schema";
import { validate, type ParsedDoc, type Validated } from "./validate";

// shoebox folder → one model call per document → schema parse → guard → result.

export async function readProfile(dir: string): Promise<Profile> {
  try {
    return Profile.parse(JSON.parse(await readFile(path.join(dir, "profile.json"), "utf8")));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return Profile.parse({});
    throw e;
  }
}

export async function run(dir: string, extractor: Extractor, today: string, onDoc?: (name: string) => void) {
  const { docs, skipped } = await readShoebox(dir);
  const profile = await readProfile(dir);
  const parsed: ParsedDoc[] = [];
  for (const doc of docs) {
    onDoc?.(doc.name);
    let raw: unknown;
    try {
      raw = await extractor.extract(doc);
    } catch (e) {
      parsed.push({ name: doc.name, text: doc.text, extraction: null, parseError: `model call failed: ${(e as Error).message}` });
      continue;
    }
    const r = Extraction.safeParse(normaliseDates(raw));
    parsed.push({
      name: doc.name,
      text: doc.text,
      raw,
      extraction: r.success ? r.data : null,
      parseError: r.success ? undefined : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    });
  }
  const validated: Validated = validate(parsed, profile, today);
  // Files we couldn't open still belong on the sheet, so nothing disappears silently.
  for (const s of skipped) validated.findings.push({ doc: s.name, rule: "IN", level: "review", message: `not read: ${s.why}` });
  return { parsed, validated, skipped };
}
