import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Extractor, InputDoc } from "./extractor";

// Stands in for Gemma: returns canned answers from `fake-responses.json` next
// to the shoebox. Some answers are deliberately wrong (an amount the document
// doesn't contain, a routine check-up labelled as treatment) so the guard has
// something to catch, the way a small local model sometimes would.

export class FakeExtractor implements Extractor {
  readonly label = "fake (canned responses)";
  private responses: Record<string, unknown> | null = null;

  constructor(private readonly file: string) {}

  static forShoebox(dir: string) {
    return new FakeExtractor(path.join(dir, "..", "fake-responses.json"));
  }

  async extract(doc: InputDoc): Promise<unknown> {
    this.responses ??= JSON.parse(await readFile(this.file, "utf8")) as Record<string, unknown>;
    const hit = this.responses[doc.name];
    if (hit === undefined) return { kind: "other", why: "fake extractor has no canned answer for this file", evidence: {} };
    return hit;
  }
}
