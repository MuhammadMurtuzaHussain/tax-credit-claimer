import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Extractor, InputDoc } from "./model/extractor";
import { Extraction, Profile } from "./schema";
import { validate, type ParsedDoc, type Validated } from "./validate";

// shoebox folder → one model call per document → schema parse → guard → result.

const MIME: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/plain",
  ".eml": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export async function readShoebox(dir: string): Promise<{ docs: InputDoc[]; skipped: string[] }> {
  const docs: InputDoc[] = [];
  const skipped: string[] = [];
  for (const name of (await readdir(dir)).sort()) {
    if (name.startsWith(".") || name === "profile.json") continue;
    const mime = MIME[path.extname(name).toLowerCase()];
    if (!mime) {
      skipped.push(name); // PDFs and HEIC are v2
      continue;
    }
    const bytes = await readFile(path.join(dir, name));
    const isText = mime === "text/plain";
    docs.push({ name, mime, text: isText ? bytes.toString("utf8") : null, bytes: isText ? null : bytes });
  }
  return { docs, skipped };
}

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
    const r = Extraction.safeParse(raw);
    parsed.push({
      name: doc.name,
      text: doc.text,
      extraction: r.success ? r.data : null,
      parseError: r.success ? undefined : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    });
  }
  const validated: Validated = validate(parsed, profile, today);
  return { parsed, validated, skipped };
}
