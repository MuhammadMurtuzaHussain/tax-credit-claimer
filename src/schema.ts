import { z } from "zod";
import { HEALTH_CATEGORIES } from "./rules";

// What the model is asked to return for one document. Every field the model
// fills is a claim about the document, not a decision: validate.ts decides
// what counts. `evidence` holds the exact text the model read each value from,
// so code can check it against the document.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const euro = z.number().nonnegative();

const evidence = z
  .record(z.string(), z.string())
  .describe("Field name → the exact text in the document this value was read from");

export const Lease = z.object({
  kind: z.literal("lease"),
  landlordName: z.string().min(1),
  landlordAddress: z.string().nullable(),
  propertyAddress: z.string().min(1),
  eircode: z.string().nullable(),
  rtbNumber: z.string().nullable(),
  monthlyRent: euro.nullable(),
  startDate: isoDate,
  endDate: isoDate.nullable(),
  tenants: z.array(z.string()),
  evidence,
});

export const RentPayment = z.object({
  kind: z.literal("rent_payment"),
  date: isoDate,
  amount: euro,
  payee: z.string().min(1),
  /** One payment, or a landlord's statement of rent received over a period. */
  coversFrom: isoDate.nullable(),
  coversTo: isoDate.nullable(),
  reference: z.string().nullable(),
  evidence,
});

/** A bank statement: only the payments that look like rent, each with the statement line it came from. */
export const BankStatement = z.object({
  kind: z.literal("bank_statement"),
  bank: z.string().nullable(),
  accountHolder: z.string().nullable(),
  periodFrom: isoDate.nullable(),
  periodTo: isoDate.nullable(),
  payments: z.array(
    z.object({
      date: isoDate,
      amount: euro,
      payee: z.string().min(1),
      /** The whole statement line, copied exactly. Code checks the date and amount against it. */
      line: z.string().min(1),
    }),
  ),
  evidence,
});

export const MedicalReceipt = z.object({
  kind: z.literal("medical_receipt"),
  date: isoDate,
  provider: z.string().min(1),
  patient: z.string().nullable(),
  description: z.string(),
  category: z.enum(HEALTH_CATEGORIES),
  total: euro,
  lineItems: z.array(z.object({ description: z.string(), amount: euro })),
  /** Amount an insurer, the HSE or anyone else paid back. */
  reimbursed: euro,
  prescribedOrReferred: z.boolean(),
  evidence,
});

export const Med2 = z.object({
  kind: z.literal("med2"),
  taxYear: z.number().int(),
  dentist: z.string().min(1),
  patient: z.string().nullable(),
  treatment: z.string(),
  amount: euro,
  evidence,
});

export const Other = z.object({
  kind: z.literal("other"),
  why: z.string(),
  evidence,
});

export const Extraction = z.discriminatedUnion("kind", [Lease, RentPayment, BankStatement, MedicalReceipt, Med2, Other]);

export type Lease = z.infer<typeof Lease>;
export type RentPayment = z.infer<typeof RentPayment>;
export type BankStatement = z.infer<typeof BankStatement>;
export type MedicalReceipt = z.infer<typeof MedicalReceipt>;
export type Med2 = z.infer<typeof Med2>;
export type Extraction = z.infer<typeof Extraction>;

/** Optional `profile.json` in the shoebox: the questions a document can't answer. */
export const Profile = z.object({
  name: z.string().nullable().default(null),
  jointlyAssessed: z.boolean().default(false),
  /** Each of these blocks the Rent Tax Credit if true. null means "not answered yet". */
  landlordIsRelative: z.boolean().nullable().default(null),
  receivesHousingSupport: z.boolean().nullable().default(null),
  landlordIsApprovedHousingBody: z.boolean().nullable().default(null),
  isPrincipalResidence: z.boolean().nullable().default(null),
});
export type Profile = z.infer<typeof Profile>;
