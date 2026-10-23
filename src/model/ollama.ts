import { z } from "zod";
import { BankStatement, Lease, Med2, MedicalReceipt, Other, RentPayment } from "../schema";
import type { Extractor, InputDoc } from "./extractor";

// Gemma 4 on this laptop through Ollama. The request goes to 127.0.0.1 only:
// receipts and rent records never leave the machine.
//
// Two small questions beat one big one for a 4B model. Asked for the whole
// union schema at once, E4B filed half the sample shoebox as "other". So:
//   1. classify: which kind of document is this? (a five-way choice)
//   2. extract: fill that kind's schema only, with hints for that kind.
// Both calls are constrained to JSON Schema with Ollama's `format`. A long
// bank statement is extracted a page at a time, and the pages' payments joined.

const KINDS = {
  lease: "a lease or tenancy agreement between a landlord and tenant",
  rent_payment:
    "proof that one rent payment was made: a bank app screenshot or transfer to a landlord, or a landlord's letter confirming rent received",
  bank_statement: "a bank account statement listing many transactions over a period",
  medical_receipt:
    "a receipt or invoice for health care: GP, consultant, hospital, pharmacy or prescription, physio, dentist, optician, and similar",
  med2: "a Form Med 2 completed by a dentist for specified dental treatment",
  other: "anything else: shopping, food, utility bills, or not readable",
} as const;

const Classify = z.object({ kind: z.enum(Object.keys(KINDS) as [keyof typeof KINDS, ...(keyof typeof KINDS)[]]) });

const CLASSIFY = `You sort Irish household documents. Say which kind this document is:
${Object.entries(KINDS)
  .map(([k, d]) => `- ${k}: ${d}`)
  .join("\n")}
Any receipt from a doctor, pharmacy, dentist or clinic is medical_receipt, whatever the treatment.
Choose med2 only when the document is the Med 2 form itself, titled "Form Med 2". A dentist's receipt that says a Med 2 was issued is still medical_receipt.
Return JSON: {"kind": "..."}`;

const COMMON = `Copy values exactly as printed. Dates as YYYY-MM-DD. Amounts in euro as plain numbers (1150, not "€1,150.00").
For every value you fill, put the exact text you read it from in "evidence" under the same field name.
If a value is not on the document, use null. Never guess a name, RTB number or amount.`;

const HINTS: Record<keyof typeof KINDS, string> = {
  lease: `This is a lease. Set kind to "lease". startDate is when the tenancy begins; endDate is null for a periodic or open tenancy.`,
  rent_payment: `This is proof of rent paid. Set kind to "rent_payment". payee is who the rent was paid to (the landlord).
date is the payment date, or the date a letter was signed. If a letter covers a period ("1 January 2024 to 31 December 2024"), set coversFrom and coversTo; otherwise null.`,
  medical_receipt: `This is a medical receipt. Set kind to "medical_receipt". total is the amount paid. reimbursed is any amount an insurer or the HSE refunds, else 0.
category, pick one:
- gp_or_consultant: GP or consultant visits
- prescribed_medicine: pharmacy or prescription items
- hospital_or_diagnostic: hospital, scans, tests
- physio_or_similar_referred: physio, chiropractor, osteopath, podiatry
- non_routine_dental: crowns, root canal, braces, implants, bridges, surgical wisdom teeth
- routine_dental: check-ups, scale and polish, cleaning, ordinary fillings and extractions
- routine_eye_care: eye tests
- cosmetic: cosmetic procedures
- other_health: anything else medical
prescribedOrReferred is true only if the receipt says a doctor prescribed, referred or advised it (e.g. "Prescription", "Referred by").`,
  bank_statement: `This is a bank statement. Set kind to "bank_statement".
In "payments", list only money going OUT that looks like rent: paid to a landlord, a letting agent or a person, or with RENT in the details.
Leave out shops, bills, subscriptions and money coming in. For each payment, copy the whole statement line exactly into "line".
If this page has no rent payments, return an empty list.`,
  med2: `This is a dentist's Med 2 form. Set kind to "med2". taxYear is the tax year on the form; amount is the amount paid for treatment.`,
  other: `This is not a rent or medical document. Set kind to "other" and say in "why" what it is.`,
};

const SCHEMAS = {
  lease: z.toJSONSchema(Lease),
  rent_payment: z.toJSONSchema(RentPayment),
  bank_statement: z.toJSONSchema(BankStatement),
  medical_receipt: z.toJSONSchema(MedicalReceipt),
  med2: z.toJSONSchema(Med2),
  other: z.toJSONSchema(Other),
};

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
    // The first page is enough to tell what a document is.
    const first = doc.pages ? doc.pages[0].slice(0, 4000) : null;
    const { kind } = Classify.parse(await this.chat(CLASSIFY, doc.name, first, doc.images, z.toJSONSchema(Classify)));
    const system = `You read one Irish household document.\n${HINTS[kind]}\n${COMMON}`;
    if (kind !== "bank_statement" || !doc.pages || doc.pages.length < 2) {
      return this.chat(system, doc.name, doc.text, doc.images, SCHEMAS[kind]);
    }
    const pages: Record<string, unknown>[] = [];
    for (const [i, page] of doc.pages.entries()) {
      const name = `${doc.name}, page ${i + 1} of ${doc.pages.length}`;
      pages.push((await this.chat(system, name, page, [], SCHEMAS[kind])) as Record<string, unknown>);
    }
    const payments = pages.flatMap((p) => (Array.isArray(p?.payments) ? p.payments : []));
    return { ...pages[0], payments };
  }

  private async chat(system: string, name: string, text: string | null, images: Buffer[], format: object): Promise<unknown> {
    const user = text ? `File: ${name}\n\n${text}` : `File: ${name}\n\nRead the attached image${images.length > 1 ? "s (one per page)" : ""}.`;
    const res = await fetch(`${this.host}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        think: false,
        format,
        options: { temperature: 0 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user, ...(images.length ? { images: images.map((b) => b.toString("base64")) } : {}) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { message?: { content?: string } };
    return JSON.parse(body.message?.content ?? "null");
  }
}
