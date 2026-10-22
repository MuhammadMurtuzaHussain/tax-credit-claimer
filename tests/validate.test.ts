import { describe, expect, it } from "vitest";
import { FakeExtractor } from "../src/model/fake";
import { run } from "../src/pipeline";
import { claimDeadline, rentCreditCap } from "../src/rules";
import { Profile, type Extraction } from "../src/schema";
import { grounded, validate, type ParsedDoc } from "../src/validate";

const TODAY = "2026-10-22";
const profile = Profile.parse({});

const doc = (name: string, text: string | null, extraction: Extraction): ParsedDoc => ({ name, text, extraction });
const pay = (date: string, amount: number, payee = "Mary Byrne"): Extraction => ({
  kind: "rent_payment", date, amount, payee, coversFrom: null, coversTo: null, reference: null,
  evidence: { amount: `€${amount}`, date, payee },
});
const payText = (date: string, amount: number, payee = "Mary Byrne") => `To ${payee} €${amount} on ${date}`;

describe("rules", () => {
  it("caps the rent credit by year and assessment", () => {
    expect(rentCreditCap(2022, false)).toBe(500);
    expect(rentCreditCap(2024, false)).toBe(1000);
    expect(rentCreditCap(2025, true)).toBe(2000);
    expect(rentCreditCap(2021, false)).toBe(0);
    expect(rentCreditCap(2029, false)).toBe(0);
  });
  it("applies the four-year rule", () => {
    expect(claimDeadline(2022)).toBe("2026-12-31");
  });
});

describe("G2 grounding", () => {
  const d: ParsedDoc = { name: "x", text: "Total: €42.50\n14/04/2025", extraction: null };
  it("accepts a number the quote really contains", () => {
    expect(grounded(d, { total: "Total: €42.50" }, "total", 42.5)).toBe(true);
  });
  it("rejects a number the model made up", () => {
    expect(grounded(d, { total: "Total: €52.50" }, "total", 52.5)).toBe(false);
    expect(grounded(d, { total: "Total: €42.50" }, "total", 52.5)).toBe(false);
  });
  it("accepts a two-digit year in a date", () => {
    const short: ParsedDoc = { name: "x", text: "Paid 14/04/25", extraction: null };
    expect(grounded(short, { date: "14/04/25" }, "date", "2025-04-14")).toBe(true);
  });
  it("skips images, which are flagged for checking by eye instead", () => {
    expect(grounded({ ...d, text: null }, {}, "total", 99)).toBe(true);
  });
});

describe("rent", () => {
  it("never credits more than 20% or the cap", () => {
    const v = validate(
      [doc("a", payText("2025-01-01", 900), pay("2025-01-01", 900)), doc("b", payText("2024-06-01", 9000), pay("2024-06-01", 9000))],
      profile,
      TODAY,
    );
    expect(v.rentYears.map((y) => [y.year, y.credit])).toEqual([[2024, 1000], [2025, 180]]);
  });

  it("counts a duplicated screenshot once", () => {
    const v = validate(
      [doc("a", payText("2025-02-01", 1150), pay("2025-02-01", 1150)), doc("b", payText("2025-02-01", 1150), pay("2025-02-01", 1150))],
      profile,
      TODAY,
    );
    expect(v.rentYears[0].rentPaid).toBe(1150);
    expect(v.findings).toContainEqual(expect.objectContaining({ doc: "b", rule: "G3", level: "dropped" }));
  });

  it("drops rent paid to someone other than the lease landlord", () => {
    const lease: Extraction = {
      kind: "lease", landlordName: "Mary Byrne", landlordAddress: null, propertyAddress: "Apt 4", eircode: null,
      rtbNumber: null, monthlyRent: 1000, startDate: "2025-01-01", endDate: null, tenants: [],
      evidence: { landlordName: "Mary Byrne", startDate: "2025" },
    };
    const v = validate(
      [doc("lease", "Mary Byrne 2025", lease), doc("p", payText("2025-03-01", 1000, "Sean Murphy"), pay("2025-03-01", 1000, "Sean Murphy"))],
      profile,
      TODAY,
    );
    expect(v.rentYears).toEqual([]);
    expect(v.findings).toContainEqual(expect.objectContaining({ doc: "p", rule: "G5", level: "review" }));
  });

  it("blocks the credit when the landlord is a relative", () => {
    const v = validate([doc("a", payText("2025-01-01", 900), pay("2025-01-01", 900))], Profile.parse({ landlordIsRelative: true }), TODAY);
    expect(v.rentBlocked).toHaveLength(1);
  });
});

describe("health", () => {
  const receipt = (over: Partial<Extract<Extraction, { kind: "medical_receipt" }>>): Extraction => ({
    kind: "medical_receipt", date: "2025-03-01", provider: "Clinic", patient: null, description: "", category: "gp_or_consultant",
    total: 100, lineItems: [], reimbursed: 0, prescribedOrReferred: false,
    evidence: { total: "€100", date: "2025", provider: "Clinic" }, ...over,
  });
  const text = "Clinic 2025 €100";

  it("drops routine dental whatever the receipt says", () => {
    const v = validate([doc("r", text, receipt({ category: "routine_dental" }))], profile, TODAY);
    expect(v.healthYears).toEqual([]);
  });
  it("holds non-routine dental until a Med 2 matches", () => {
    const alone = validate([doc("r", text, receipt({ category: "non_routine_dental" }))], profile, TODAY);
    expect(alone.healthYears).toEqual([]);
    const med2: Extraction = { kind: "med2", taxYear: 2025, dentist: "Dr X", patient: null, treatment: "Crown", amount: 100, evidence: { amount: "€100", dentist: "Dr X" } };
    const both = validate([doc("r", text, receipt({ category: "non_routine_dental" })), doc("m", "Dr X €100", med2)], profile, TODAY);
    expect(both.healthYears[0].total).toBe(100); // counted once, not twice
  });
  it("takes off what the insurer paid back", () => {
    const v = validate([doc("r", text, receipt({ reimbursed: 40 }))], profile, TODAY);
    expect(v.healthYears[0].total).toBe(60);
    expect(v.healthYears[0].estimatedRelief).toBe(12);
  });
  it("holds a receipt whose line items don't add up", () => {
    const v = validate([doc("r", text, receipt({ lineItems: [{ description: "a", amount: 30 }] }))], profile, TODAY);
    expect(v.findings).toContainEqual(expect.objectContaining({ rule: "H4", level: "review" }));
  });
});

describe("end to end on the sample shoebox", () => {
  it("produces the expected totals with the fake model", async () => {
    const { validated } = await run("fixtures/shoebox", FakeExtractor.forShoebox("fixtures/shoebox"), TODAY);
    const rent = validated.rentYears.reduce((s, y) => s + y.credit, 0);
    const health = validated.healthYears.reduce((s, y) => s + y.estimatedRelief, 0);
    expect(rent).toBe(1930);
    expect(health).toBe(209);
    expect(validated.findings.filter((f) => f.level === "review").map((f) => f.doc)).toEqual(["pharmacy-2025-04.txt"]);
  });
});
