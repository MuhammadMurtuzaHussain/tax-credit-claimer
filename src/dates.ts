// Small models copy dates the way the document prints them, whatever the
// prompt says. Turning Irish date formats into YYYY-MM-DD is a job for code:
// it's deterministic, and day-first is the only reading that makes sense here.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const DATE_FIELDS = ["date", "startDate", "endDate", "coversFrom", "coversTo", "periodFrom", "periodTo"] as const;

const pad = (n: number) => String(n).padStart(2, "0");

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Every date written in a piece of text, as YYYY-MM-DD. */
export function datesIn(text: string): string[] {
  const found = text.match(
    /\b\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})\b|\b\d{1,2}(?:st|nd|rd|th)?\s+[a-z]{3,9}\.?,?\s+\d{4}\b|\b[a-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/gi,
  ) ?? [];
  return found.map(toIsoDate).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
}

/** "14/04/2025", "14.04.25", "1 January 2024", "1st Jan 2024", "January 1, 2024" → YYYY-MM-DD. Anything else is returned as it was. */
export function toIsoDate(value: string): string {
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1])) ?? value; // day first, as in Ireland
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{4})$/i);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    if (month) return iso(Number(m[3]), month, Number(m[1])) ?? value;
  }
  m = s.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i);
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    if (month) return iso(Number(m[3]), month, Number(m[2])) ?? value;
  }
  return value;
}

/** Normalise the date fields of a raw model answer before the schema sees it. */
export function normaliseDates(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const out = { ...(raw as Record<string, unknown>) };
  for (const f of DATE_FIELDS) if (typeof out[f] === "string") out[f] = toIsoDate(out[f] as string);
  if (Array.isArray(out.payments)) out.payments = out.payments.map(normaliseDates);
  return out;
}
