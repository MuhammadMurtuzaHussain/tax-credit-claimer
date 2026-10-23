import {
  HEALTH_RELIEF_RATE,
  NEEDS_PRACTITIONER,
  NON_QUALIFYING,
  RENT_CREDIT_RATE,
  RENT_CREDIT_YEARS,
  claimDeadline,
  claimableYears,
  rentCreditCap,
  type HealthCategory,
} from "./rules";
import type { Extraction, Lease, Med2, MedicalReceipt, Profile, RentPayment } from "./schema";

// Gemma reads; this file decides. Every rule here is plain code the model
// can't talk its way past:
//   G1 the model's output must match the schema, or the document needs review;
//   G2 every amount, date and name must be quoted from the document (text docs);
//   G3 the same payment or receipt is only counted once;
//   G4 only the last four tax years (plus this one) can be claimed;
//   G5 rent must be paid to the landlord on the lease, inside the lease term;
//   G6 a landlord's statement must cover a single tax year;
//   G7 the Rent Tax Credit is 20% of rent, capped per year;
//   G8 questions only you can answer (relative landlord, HAP) block the rent credit;
//   H1 routine dental, routine eye care and cosmetic work never count;
//   H2 medicines and physio count only if a practitioner prescribed or referred them;
//   H3 non-routine dental needs a matching Med 2 from the dentist;
//   H4 line items must add up to the receipt total;
//   H5 money paid back by an insurer or the HSE is taken off.
// Money is handled in cents. The model's arithmetic is never used.

export type ParsedDoc = {
  name: string;
  text: string | null;
  extraction: Extraction | null;
  /** The model's answer as it came back, kept for the audit trail. */
  raw?: unknown;
  parseError?: string;
};

export type Finding = {
  doc: string;
  rule: string;
  /** dropped: rightly excluded. review: excluded until you check it. note: counted, but look. */
  level: "dropped" | "review" | "note";
  message: string;
};

export type RentLine = { doc: string; date: string; amount: number };
export type RentYear = {
  year: number;
  lines: RentLine[];
  rentPaid: number;
  cap: number;
  credit: number;
  deadline: string;
  inYear: boolean;
};

export type HealthLine = { doc: string; date: string; provider: string; category: HealthCategory | "med2"; net: number };
export type HealthYear = {
  year: number;
  lines: HealthLine[];
  total: number;
  estimatedRelief: number;
  deadline: string;
  inYear: boolean;
};

export type Validated = {
  today: string;
  profile: Profile;
  lease: Lease | null;
  leaseDoc: string | null;
  rentYears: RentYear[];
  rentBlocked: string[];
  rentToConfirm: string[];
  healthYears: HealthYear[];
  findings: Finding[];
};

const cents = (euro: number) => Math.round(euro * 100);
const euro = (c: number) => c / 100;
const yearOf = (iso: string) => Number(iso.slice(0, 4));
const squash = (s: string) => s.toLowerCase().replace(/[\s,]+/g, " ").trim();

/** G2: the value is really in the document, either through its evidence quote or printed as-is. */
export function grounded(doc: ParsedDoc, ev: Record<string, string>, field: string, value: string | number): boolean {
  if (doc.text === null) return true; // images are checked by eye, see the "note" finding
  if (quoted(doc.text, ev[field], value)) return true;
  // Small models often skip the quote. A name or amount printed verbatim is just as grounded.
  // Dates are printed in too many ways for that, so they still need a quote.
  if (typeof value === "number") {
    const printed = [value.toFixed(2), value.toLocaleString("en-IE", { minimumFractionDigits: 2 })];
    return printed.some((p) => new RegExp(`(^|[^\\d.,])${p.replace(/[.,]/g, "\\$&")}(?![\\d])`).test(doc.text!));
  }
  return !/^\d{4}-\d{2}-\d{2}$/.test(value) && squash(doc.text).includes(squash(value));
}

function quoted(text: string, quote: string | undefined, value: string | number): boolean {
  if (!quote || !squash(text).includes(squash(quote))) return false;
  if (typeof value === "number") {
    const numbers = (quote.match(/\d[\d,]*(?:\.\d{1,2})?/g) ?? []).map((n) => Number(n.replace(/,/g, "")));
    return numbers.some((n) => cents(n) === cents(value));
  }
  // A date must at least carry its year, as "2025" or as "14/03/25".
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return quote.includes(value.slice(0, 4)) || new RegExp(`\\d[/.-]${value.slice(2, 4)}\\b`).test(quote);
  }
  return true;
}

function surnameMatch(payee: string, landlord: string): boolean {
  const words = (s: string) => new Set(squash(s).split(/[^a-z']+/).filter((w) => w.length > 2));
  const l = words(landlord);
  return [...words(payee)].some((w) => l.has(w));
}

export function validate(docs: ParsedDoc[], profile: Profile, today: string): Validated {
  const findings: Finding[] = [];
  const add = (doc: string, rule: string, level: Finding["level"], message: string) =>
    findings.push({ doc, rule, level, message });
  const window = new Set(claimableYears(today));
  const thisYear = yearOf(today);

  // G1 + G2: keep only extractions that parsed and are grounded in their document.
  const ok: { doc: ParsedDoc; x: Extraction }[] = [];
  for (const doc of docs) {
    if (!doc.extraction) {
      add(doc.name, "G1", "review", `no usable reading from the model (${doc.parseError ?? "no output"})`);
      continue;
    }
    const x = doc.extraction;
    const keyFields: [string, string | number][] =
      x.kind === "rent_payment" ? [["amount", x.amount], ["date", x.date], ["payee", x.payee]]
      : x.kind === "medical_receipt" ? [["total", x.total], ["date", x.date], ["provider", x.provider]]
      : x.kind === "med2" ? [["amount", x.amount], ["dentist", x.dentist]]
      : x.kind === "lease" ? [["landlordName", x.landlordName], ["startDate", x.startDate]]
      : [];
    const bad = keyFields.filter(([f, v]) => !grounded(doc, x.evidence, f, v)).map(([f]) => f);
    if (bad.length) {
      add(doc.name, "G2", "review", `couldn't find ${bad.join(", ")} in the document as the model read it; check by eye`);
      continue;
    }
    if (doc.text === null && x.kind !== "other") add(doc.name, "G2", "note", "read from an image: check the amount and date by eye");
    if (x.kind === "other") {
      add(doc.name, "G1", "dropped", `not a rent or medical document (${x.why})`);
      continue;
    }
    ok.push({ doc, x });
  }

  // ---- Rent ----
  const leases = ok.filter((d): d is { doc: ParsedDoc; x: Lease } => d.x.kind === "lease");
  const lease = leases.at(-1)?.x ?? null;
  const leaseDoc = leases.at(-1)?.doc.name ?? null;
  if (leases.length > 1) add(leases[0].doc.name, "G5", "note", "more than one lease found; using the latest one for landlord details");
  if (lease && !lease.rtbNumber) add(leaseDoc!, "G5", "note", "no RTB number on the lease. You can still claim, but Revenue may ask for it later");

  const rentByYear = new Map<number, RentLine[]>();
  const seenRent = new Set<string>();
  for (const { doc, x } of ok) {
    if (x.kind !== "rent_payment") continue;
    const p: RentPayment = x;
    // G6: a statement covering a period counts in the year it covers, and must not straddle years.
    if (p.coversFrom && p.coversTo && yearOf(p.coversFrom) !== yearOf(p.coversTo)) {
      add(doc.name, "G6", "review", "this statement spans two tax years; ask the landlord for one per year");
      continue;
    }
    const date = p.coversTo ?? p.date;
    const year = yearOf(date);
    const key = `${p.date}|${cents(p.amount)}`;
    if (seenRent.has(key)) {
      add(doc.name, "G3", "dropped", `same payment as another document (${p.date}, €${p.amount.toFixed(2)})`);
      continue;
    }
    seenRent.add(key);
    if (year < RENT_CREDIT_YEARS.first || year > RENT_CREDIT_YEARS.last) {
      add(doc.name, "G4", "dropped", `the Rent Tax Credit doesn't exist for ${year}`);
      continue;
    }
    if (!window.has(year)) {
      add(doc.name, "G4", "dropped", `${year} can no longer be claimed (deadline was ${claimDeadline(year)})`);
      continue;
    }
    if (!lease) {
      add(doc.name, "G5", "note", "no lease in the shoebox, so the landlord couldn't be checked");
    } else {
      if (!surnameMatch(p.payee, lease.landlordName)) {
        add(doc.name, "G5", "review", `paid to "${p.payee}", but the lease landlord is "${lease.landlordName}"`);
        continue;
      }
      const from = p.coversFrom ?? p.date;
      if (from < lease.startDate || (lease.endDate && date > lease.endDate)) {
        add(doc.name, "G5", "review", `payment falls outside the lease term (${lease.startDate} to ${lease.endDate ?? "open"})`);
        continue;
      }
    }
    const lines = rentByYear.get(year) ?? [];
    lines.push({ doc: doc.name, date: p.date, amount: p.amount });
    rentByYear.set(year, lines);
  }

  const rentYears: RentYear[] = [...rentByYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, lines]) => {
      const paid = lines.reduce((s, l) => s + cents(l.amount), 0);
      const cap = cents(rentCreditCap(year, profile.jointlyAssessed));
      return {
        year,
        lines,
        rentPaid: euro(paid),
        cap: euro(cap),
        credit: euro(Math.min(Math.round(paid * RENT_CREDIT_RATE), cap)), // G7
        deadline: claimDeadline(year),
        inYear: year === thisYear,
      };
    });

  // G8: what only the person can answer.
  const questions: [keyof Profile, string][] = [
    ["landlordIsRelative", "Your landlord is not related to you"],
    ["receivesHousingSupport", "You don't get HAP, Rent Supplement or RAS for this home"],
    ["landlordIsApprovedHousingBody", "Your landlord is not a housing association or Approved Housing Body"],
    ["isPrincipalResidence", "This is your main home (or a home you rent to work or study)"],
  ];
  const rentBlocked: string[] = [];
  const rentToConfirm: string[] = [];
  for (const [key, statement] of questions) {
    const answer = profile[key];
    const blocks = key === "isPrincipalResidence" ? answer === false : answer === true;
    if (blocks) rentBlocked.push(`Not eligible: ${statement.charAt(0).toLowerCase()}${statement.slice(1)} is false`);
    else if (answer === null) rentToConfirm.push(statement);
  }

  // ---- Health ----
  const med2s = ok.filter((d): d is { doc: ParsedDoc; x: Med2 } => d.x.kind === "med2");
  const usedMed2 = new Set<string>();
  const healthByYear = new Map<number, HealthLine[]>();
  const seenHealth = new Set<string>();
  const pushHealth = (year: number, line: HealthLine) => {
    const lines = healthByYear.get(year) ?? [];
    lines.push(line);
    healthByYear.set(year, lines);
  };

  for (const { doc, x } of ok) {
    if (x.kind !== "medical_receipt") continue;
    const r: MedicalReceipt = x;
    const year = yearOf(r.date);
    const key = `${r.date}|${squash(r.provider)}|${cents(r.total)}`;
    if (seenHealth.has(key)) {
      add(doc.name, "G3", "dropped", "same receipt as another document");
      continue;
    }
    seenHealth.add(key);
    if (!window.has(year)) {
      add(doc.name, "G4", "dropped", `${year} can no longer be claimed (deadline was ${claimDeadline(year)})`);
      continue;
    }
    if (NON_QUALIFYING.has(r.category)) {
      add(doc.name, "H1", "dropped", `${r.category.replace(/_/g, " ")} doesn't qualify for health expenses relief`);
      continue;
    }
    if (NEEDS_PRACTITIONER.has(r.category) && !r.prescribedOrReferred) {
      add(doc.name, "H2", "review", "only counts if a doctor or practitioner prescribed or referred it; the receipt doesn't say so");
      continue;
    }
    if (r.lineItems.length) {
      const sum = r.lineItems.reduce((s, l) => s + cents(l.amount), 0);
      if (sum !== cents(r.total)) {
        add(doc.name, "H4", "review", `line items add up to €${euro(sum).toFixed(2)}, not the €${r.total.toFixed(2)} total`);
        continue;
      }
    }
    if (r.category === "non_routine_dental") {
      const m = med2s.find((m) => m.x.taxYear === year && cents(m.x.amount) === cents(r.total) && !usedMed2.has(m.doc.name));
      if (!m) {
        add(doc.name, "H3", "review", "non-routine dental needs a Med 2 from your dentist for the same year and amount");
        continue;
      }
      usedMed2.add(m.doc.name);
    }
    if (r.reimbursed > r.total) {
      add(doc.name, "H5", "review", "reimbursed more than the receipt total");
      continue;
    }
    if (r.reimbursed > 0) add(doc.name, "H5", "note", `€${r.reimbursed.toFixed(2)} paid back by insurer or HSE, taken off`);
    pushHealth(year, {
      doc: doc.name,
      date: r.date,
      provider: r.provider,
      category: r.category,
      net: euro(cents(r.total) - cents(r.reimbursed)),
    });
  }

  // A Med 2 is itself the dentist's receipt. One with no matching receipt still counts.
  for (const { doc, x } of med2s) {
    if (usedMed2.has(doc.name)) continue;
    if (!window.has(x.taxYear)) {
      add(doc.name, "G4", "dropped", `${x.taxYear} can no longer be claimed (deadline was ${claimDeadline(x.taxYear)})`);
      continue;
    }
    pushHealth(x.taxYear, { doc: doc.name, date: `${x.taxYear}`, provider: x.dentist, category: "med2", net: x.amount });
  }

  const healthYears: HealthYear[] = [...healthByYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, lines]) => {
      const total = lines.reduce((s, l) => s + cents(l.net), 0);
      return {
        year,
        lines,
        total: euro(total),
        estimatedRelief: euro(Math.round(total * HEALTH_RELIEF_RATE)),
        deadline: claimDeadline(year),
        inYear: year === thisYear,
      };
    });

  return { today, profile, lease, leaseDoc, rentYears, rentBlocked, rentToConfirm, healthYears, findings };
}
