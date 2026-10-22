import { RECEIPT_RETENTION_YEARS, RULES_CHECKED_ON, SOURCES } from "./rules";
import type { HealthYear, RentYear, Validated } from "./validate";

// The fill-in sheet: what to click in myAccount and what to type in each box.
// It never logs in or submits. You do that, with this open beside it.

const eur = (n: number) => `€${n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function daysUntil(deadline: string, today: string): number {
  return Math.round((Date.parse(deadline) - Date.parse(today)) / 86_400_000);
}

function pathFor(inYear: boolean, year: number, section: string): string {
  return inYear
    ? `myAccount → PAYE Services → Manage your tax for the current year → Add new credits → ${section}`
    : `myAccount → PAYE Services → Review your tax for the previous 4 years → request a Statement of Liability for ${year} → Complete Income Tax Return → Tax Credits & Reliefs → ${section}`;
}

function rentBlock(v: Validated, y: RentYear): string[] {
  const l = v.lease;
  const out = [
    `### Rent Tax Credit, ${y.year}`,
    "",
    `**Where:** ${pathFor(y.inYear, y.year, "You and your family → Rent Tax Credit")}`,
    "",
    "| Box | Type this | From |",
    "| --- | --- | --- |",
    `| Landlord name | ${l?.landlordName ?? "_not found: fill by hand_"} | ${v.leaseDoc ?? "-"} |`,
    `| Landlord address | ${l?.landlordAddress ?? "_not on the lease_"} | ${v.leaseDoc ?? "-"} |`,
    `| Rented property address | ${l?.propertyAddress ?? "_not found: fill by hand_"} | ${v.leaseDoc ?? "-"} |`,
    `| Eircode | ${l?.eircode ?? "_not on the lease_"} | ${v.leaseDoc ?? "-"} |`,
    `| RTB registration number | ${l?.rtbNumber ?? "_not on the lease: optional now, Revenue may ask later_"} | ${v.leaseDoc ?? "-"} |`,
    `| Tenancy start | ${l?.startDate ?? "-"} | ${v.leaseDoc ?? "-"} |`,
    `| Rent paid in ${y.year} | **${eur(y.rentPaid)}** | ${y.lines.length} document(s) below |`,
    "",
    `Credit we expect: **${eur(y.credit)}** (20% of rent, capped at ${eur(y.cap)}; Revenue also caps it at the income tax you paid, which this tool can't see).`,
    "",
    "<details><summary>Payments counted</summary>",
    "",
    ...y.lines.map((p) => `- ${p.date}: ${eur(p.amount)} (${p.doc})`),
    "",
    "</details>",
    "",
  ];
  return out;
}

function healthBlock(y: HealthYear): string[] {
  const byKind = new Map<string, number>();
  for (const l of y.lines) {
    const kind = l.category === "med2" ? "non routine dental" : l.category.replace(/_/g, " ");
    byKind.set(kind, Math.round(((byKind.get(kind) ?? 0) + l.net) * 100) / 100);
  }
  return [
    `### Health expenses, ${y.year}`,
    "",
    `**Where:** ${pathFor(y.inYear, y.year, "Health → Health expenses")}`,
    "",
    "| Box | Type this |",
    "| --- | --- |",
    ...[...byKind].map(([kind, amount]) => `| ${kind} | ${eur(amount)} |`),
    `| **Total** qualifying expenses (after anything paid back) | **${eur(y.total)}** |`,
    "",
    `Relief we expect: about **${eur(y.estimatedRelief)}** (20% standard rate).`,
    "",
    "| Date | Provider | Kind | Counted | File |",
    "| --- | --- | --- | --- | --- |",
    ...y.lines.map((l) => `| ${l.date} | ${l.provider} | ${l.category.replace(/_/g, " ")} | ${eur(l.net)} | ${l.doc} |`),
    "",
  ];
}

export function renderSheet(v: Validated): string {
  const years = [...new Set([...v.rentYears.map((y) => y.year), ...v.healthYears.map((y) => y.year)])].sort();
  const rentTotal = v.rentBlocked.length ? 0 : v.rentYears.reduce((s, y) => s + y.credit, 0);
  const healthTotal = v.healthYears.reduce((s, y) => s + y.estimatedRelief, 0);

  const out: string[] = [
    "# Your Revenue claim sheet",
    "",
    `Made on ${v.today}. Nothing was sent anywhere: open [myAccount](https://www.ros.ie/myaccount-web/home.html) yourself and copy these in.`,
    "",
    `**Expected back: about ${eur(rentTotal + healthTotal)}** (rent ${eur(rentTotal)}, health ${eur(healthTotal)}), if you paid at least that much income tax in those years.`,
    "",
  ];

  const urgent = years.filter((y) => daysUntil(`${y + 4}-12-31`, v.today) <= 90);
  for (const y of urgent) {
    out.push(`> [!WARNING]`, `> ${y} closes on ${y + 4}-12-31, in ${daysUntil(`${y + 4}-12-31`, v.today)} days. Do it first.`, "");
  }

  if (v.rentBlocked.length) {
    out.push("## Rent Tax Credit: not claimable", "", ...v.rentBlocked.map((b) => `- ${b}`), "");
  } else if (v.rentToConfirm.length && v.rentYears.length) {
    out.push(
      "## Before you claim the rent credit, confirm",
      "",
      ...v.rentToConfirm.map((q) => `- [ ] ${q}`),
      "",
      "_Answer these once in `profile.json` and they disappear._",
      "",
    );
  }

  for (const year of years) {
    out.push(`## ${year}${years.length > 1 ? ` (claim by ${year + 4}-12-31)` : ""}`, "");
    if (!v.rentBlocked.length) {
      const r = v.rentYears.find((y) => y.year === year);
      if (r) out.push(...rentBlock(v, r));
    }
    const h = v.healthYears.find((y) => y.year === year);
    if (h) out.push(...healthBlock(h));
    out.push("Submit the return for this year before moving to the next. Each year is a separate claim.", "");
  }

  const review = v.findings.filter((f) => f.level === "review");
  const dropped = v.findings.filter((f) => f.level === "dropped");
  const notes = v.findings.filter((f) => f.level === "note");
  if (review.length) {
    out.push("## Check these by hand (not counted yet)", "", ...review.map((f) => `- **${f.doc}** (${f.rule}): ${f.message}`), "");
  }
  if (dropped.length) {
    out.push("## Left out, and why", "", ...dropped.map((f) => `- **${f.doc}** (${f.rule}): ${f.message}`), "");
  }
  if (notes.length) {
    out.push("## Notes", "", ...notes.map((f) => `- **${f.doc}** (${f.rule}): ${f.message}`), "");
  }

  out.push(
    "---",
    "",
    `Keep every receipt and Med 2 for ${RECEIPT_RETENTION_YEARS} years: you don't upload them, but Revenue can ask. ` +
      `Rules checked against revenue.ie on ${RULES_CHECKED_ON}: [Rent Tax Credit](${SOURCES.rentCredit}), ` +
      `[how much](${SOURCES.rentHowMuch}), [health expenses](${SOURCES.healthQualifying}), [four-year rule](${SOURCES.fourYearRule}). ` +
      "This sheet is a helper, not tax advice.",
    "",
  );
  return out.join("\n");
}
