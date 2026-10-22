import { extractionJsonSchema } from "../schema";
import type { Extractor, InputDoc } from "./extractor";

// Gemma 4 on this laptop through Ollama. The request goes to 127.0.0.1 only:
// receipts and rent records never leave the machine. Output is constrained
// to the extraction schema with Ollama's structured outputs (`format`).

const SYSTEM = `You read one Irish household document: a lease, a rent payment (bank app screenshot, transfer confirmation, landlord letter), a medical receipt, or a dentist's Med 2 form.
Return JSON matching the schema. Rules:
- Copy values exactly as printed. Dates as YYYY-MM-DD. Amounts in euro as numbers.
- For every value you fill, put the exact text you read it from in "evidence" under the same field name.
- If a value is not on the document, use null. Never guess a landlord, RTB number, or amount.
- For medical receipts pick the closest category. A check-up, scale-and-polish or cleaning is routine_dental. An eye test is routine_eye_care.
- prescribedOrReferred is true only if the document says a doctor or practitioner prescribed, referred or advised it.
- If the document is none of these, use kind "other" and say why.`;

export class OllamaExtractor implements Extractor {
  readonly label: string;

  constructor(
    private readonly model = process.env.OLLAMA_MODEL ?? "gemma4:e4b",
    private readonly host = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434",
  ) {
    const url = new URL(this.host);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      // The privacy promise is "nothing leaves the laptop". Refuse rather than quietly break it.
      throw new Error(`OLLAMA_HOST must be local, got ${url.hostname}`);
    }
    this.label = `ollama ${this.model}`;
  }

  async extract(doc: InputDoc): Promise<unknown> {
    const user = doc.text
      ? `File: ${doc.name}\n\n${doc.text}`
      : `File: ${doc.name}\n\nRead the attached image.`;
    const res = await fetch(`${this.host}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: extractionJsonSchema,
        options: { temperature: 0 },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user, ...(doc.bytes ? { images: [doc.bytes.toString("base64")] } : {}) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { message?: { content?: string } };
    return JSON.parse(body.message?.content ?? "null");
  }
}
