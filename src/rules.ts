// The tax rules, as plain data. The model never sees these and never computes
// money: every euro on the fill-in sheet comes from this file and validate.ts.
// Checked against revenue.ie on 2026-10-22. Re-check every January (Budget
// changes land then) and update RULES_CHECKED_ON.

export const RULES_CHECKED_ON = "2026-10-22";

export const SOURCES = {
  rentCredit: "https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/land-and-property/rent-credit/index.aspx",
  rentHowMuch: "https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/land-and-property/rent-credit/how-much-claim.aspx",
  rentConditions: "https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/land-and-property/rent-credit/qualifying-conditions.aspx",
  rentHowToClaim: "https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/land-and-property/rent-credit/how-to-claim.aspx",
  health: "https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/health-and-age/health-expenses/index.aspx",
  healthQualifying: "https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/health-and-age/health-expenses/what-are-qualifying-expenses.aspx",
  healthHowToClaim: "https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/health-and-age/health-expenses/how-do-you-claim-health-expenses.aspx",
  dental: "https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/health-and-age/health-expenses/dental-expenses.aspx",
  fourYearRule: "https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/four-year-rule/index.aspx",
} as const;

/** Rent Tax Credit exists for these tax years only. */
export const RENT_CREDIT_YEARS = { first: 2022, last: 2028 } as const;

/** Maximum Rent Tax Credit per tax year, in euro. */
export function rentCreditCap(year: number, jointlyAssessed: boolean): number {
  if (year < RENT_CREDIT_YEARS.first || year > RENT_CREDIT_YEARS.last) return 0;
  const base = year <= 2023 ? 500 : 1000;
  return jointlyAssessed ? base * 2 : base;
}

/** Credit is 20% of rent paid, up to the cap (and up to your tax liability, which we can't see). */
export const RENT_CREDIT_RATE = 0.2;

/** Health expenses are relieved at the standard rate. Nursing homes get the higher rate (out of scope). */
export const HEALTH_RELIEF_RATE = 0.2;

/** Keep receipts (and Med 2 forms) this many years. */
export const RECEIPT_RETENTION_YEARS = 6;

/** Four-year rule: claims for tax year Y must be made by 31 December of Y + 4. */
export function claimDeadline(year: number): string {
  return `${year + 4}-12-31`;
}

export function claimableYears(today: string): number[] {
  const now = Number(today.slice(0, 4));
  return [now - 4, now - 3, now - 2, now - 1, now];
}

export const HEALTH_CATEGORIES = [
  "gp_or_consultant",
  "prescribed_medicine",
  "hospital_or_diagnostic",
  "physio_or_similar_referred",
  "non_routine_dental",
  "routine_dental",
  "routine_eye_care",
  "cosmetic",
  "other_health",
] as const;
export type HealthCategory = (typeof HEALTH_CATEGORIES)[number];

/** Categories Revenue lists as not qualifying. Code drops these whatever the model says. */
export const NON_QUALIFYING: ReadonlySet<HealthCategory> = new Set(["routine_dental", "routine_eye_care", "cosmetic"]);

/** Categories that only qualify when a practitioner prescribed, referred or advised them. */
export const NEEDS_PRACTITIONER: ReadonlySet<HealthCategory> = new Set(["prescribed_medicine", "physio_or_similar_referred"]);
