# Tax Credit Claimer: product requirements

Status: draft v0.1, 2026-10-22. Owner: Haider. Not entered in any challenge.

## 1. Problem

Ireland gives renters money back through the **Rent Tax Credit**, worth up to €1,000 a year per person from 2024. It also gives 20% back on most **medical expenses**. Both can be backdated four years. Plenty of people who qualify never claim, especially students and young renters. The work isn't hard. It's the friction:

- the evidence is scattered across bank-app screenshots, a lease PDF from two flats ago, a landlord's email, and pharmacy receipts in a drawer;
- myAccount asks for each year separately, behind a "Statement of Liability" step that newcomers don't know exists;
- nobody knows which receipts count (a scale-and-polish doesn't; a crown does, but only with a Med 2 from the dentist);
- the deadline is invisible. **Claims for 2022 must be made by 31 December 2026** ([four-year rule](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/four-year-rule/index.aspx)). As of this draft that's about ten weeks away.

## 2. Target user

A renter or student in Ireland, paid through PAYE, who has never claimed the Rent Tax Credit or health expenses relief on Revenue myAccount. Typically:

- 19–30, in a shared flat, digs or student accommodation, or a parent paying for a student child's room;
- has every document somewhere, but not in one place;
- won't read Revenue guidance, but will drag a folder onto a tool and copy numbers into a form if told exactly where;
- cares that bank and medical records don't get uploaded to some startup's server.

Not the target: self-assessed taxpayers filing Form 11 in ROS, landlords, accountants.

## 3. The lazy flow

1. Dump everything into one folder: screenshots, photos of receipts, the lease. No renaming, no sorting.
2. Run one command (later: drop the folder on a desktop window).
3. Gemma 4 on the laptop reads each document. Code checks every value it read.
4. Answer up to four yes/no questions only you can answer: is the landlord a relative, do you get HAP, and so on. You answer them once.
5. Get a **claim sheet** split by year, oldest deadline first. It gives the exact myAccount clicks, then each box with what to type in it and which file it came from.
6. Open myAccount yourself, copy, submit. Most online claims are refunded within five working days ([how to claim health expenses](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/health-and-age/health-expenses/how-do-you-claim-health-expenses.aspx)).

The person's effort is steps 1, 4 and 6. Everything else is the tool.

## 4. Goals and non-goals

**Goals**

- G-1. Someone who has never claimed can go from a messy folder to submitted claims for every open year in **under 30 minutes**.
- G-2. Never overstate. Every euro on the sheet traces to a document and a rule. If unsure, the tool leaves the amount out and says why.
- G-3. Financial and medical documents never leave the laptop.
- G-4. Every rule cites the Revenue page it comes from, and the rules can be updated without touching the model.

**Non-goals**

- Logging in to Revenue, filling forms automatically, or submitting anything. The person always clicks submit.
- Tax advice, or optimising across reliefs. The sheet is a helper that points at the rules.
- Calculating the person's actual tax liability. Revenue caps the credit at the tax they paid. The tool says so but can't see it.
- Cloud sync, accounts, payments.

## 5. Scope

### In v1

| Area | In |
| --- | --- |
| Inputs | Folder of PDFs, `.png`, `.jpg`, `.webp`, `.txt` plus an optional `profile.json`. Text PDFs are read page by page with pdf.js; scanned PDFs (up to 3 pages) are drawn to images for Gemma's vision |
| Documents | Lease or tenancy agreement, rent payment (bank screenshot, transfer confirmation, landlord letter), bank statement (rent lines only), medical receipt, dentist's Med 2 |
| Reliefs | Rent Tax Credit (2022–2028); health expenses at the 20% standard rate |
| Years | The current year (in-year route) plus the previous four (Income Tax Return route) |
| Model | Gemma 4 E4B through local Ollama, behind an `Extractor` interface, with a fake for tests |
| Output | Markdown claim sheet plus `extractions.json` audit trail |
| Claimant | Single person; joint assessment via a profile flag (doubles the rent cap only) |

### Out of v1 (later)

- HEIC photos (convert on import)
- Statements that print dates without a year ("01 APR"): S1 can't match them yet
- Scans longer than 3 pages (asked to split into one file per document)
- Nursing home relief (40% rate), tuition fees, flat-rate expenses, Home Carer and other credits
- Self-assessed / Form 11 route in ROS
- Rent shared between flatmates who aren't jointly assessed (each claims their own share, so the tool would need to know which payments are yours)
- Parent claiming for a child's student accommodation (extra conditions: approved course, child under 23 when they started; see [property used by your child](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/land-and-property/rent-credit/used-by-child.aspx))
- Digs or rent-a-room payments that include meals (must be split between rent and food, per [qualifying conditions](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/land-and-property/rent-credit/qualifying-conditions.aspx))
- Desktop app with drag and drop; Irish-language sheet

## 6. The rules (verified 2026-10-22)

### Rent Tax Credit

Source: [Rent Tax Credit](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/land-and-property/rent-credit/index.aspx), [how much can you claim](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/land-and-property/rent-credit/how-much-claim.aspx), [qualifying conditions](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/land-and-property/rent-credit/qualifying-conditions.aspx), [how to claim](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/land-and-property/rent-credit/how-to-claim.aspx).

| Tax year | Single / all other cases | Jointly assessed couple |
| --- | --- | --- |
| 2022, 2023 | €500 | €1,000 |
| 2024 to 2028 | €1,000 | €2,000 |

- The credit is the **lowest** of: 20% of rent paid in the year; the cap above; your income tax liability after other credits. It doesn't reduce USC or PRSI.
- The cap applies however many properties you rent in the year.
- Rent must be due and paid in that tax year, under a tenancy with the landlord's consent, for residential property in the State.
- Tenancies that must be registered with the RTB must actually be registered. The RTB number is optional when you claim, but Revenue may ask later and withdraw the credit if you can't give it.
- Rent-a-room and digs qualify, unless you and the landlord are related.
- **Not eligible:** you get HAP, Rent Supplement or RAS (even with a top-up); your landlord is a housing association or Approved Housing Body.
- **myAccount route, past years (2022–2025):** PAYE Services → Review your tax for the previous 4 years → request a Statement of Liability → Complete Income Tax Return → Tax Credits & Reliefs → You and your family → Rent Tax Credit.
- **myAccount route, 2026 (in year):** PAYE Services → Manage your tax for the current year → Add new credits → You and your family → Rent Tax Credit.

### Health expenses

Source: [health expenses](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/health-and-age/health-expenses/index.aspx), [qualifying expenses](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/health-and-age/health-expenses/what-are-qualifying-expenses.aspx), [how to claim](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/health-and-age/health-expenses/how-do-you-claim-health-expenses.aspx), [dental expenses](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/health-and-age/health-expenses/dental-expenses.aspx).

- Relief at the **standard rate, 20%** (nursing homes at up to 40%, out of scope). It can be for yourself or anyone whose bills you paid.
- Anything paid back by an insurer, the HSE or a compensation payment is taken off.
- **Qualifies:** doctor and consultant fees; maternity care; diagnostics; hospital; IVF; non-routine dental (crowns, root canal, braces, surgical wisdom-tooth extraction, implants and others); drugs, physio, podiatry and appliances **if prescribed, referred or advised by a practitioner**.
- **Doesn't qualify:** routine dental (e.g. check-ups, scale and polish; Revenue lists only the non-routine treatments, so anything not on that list is treated as routine), routine eye care (eye tests), cosmetic procedures.
- Non-routine dental needs a **Med 2** completed by the dentist, one per year. You keep it; you don't send it.
- Keep receipts for **six years**. They aren't uploaded but can be asked for.
- You can claim in the year of care or the year of payment. Each year is a separate claim, and you must have paid tax that year to benefit.
- **myAccount route:** the same two routes as rent, under Health → Health expenses.

### Four-year rule

"Claims for 2022 must be made by 31 December 2026" ([four-year rule](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/four-year-rule/index.aspx)). In general, year Y closes on 31 December of Y + 4.

### Could not confirm

- **citizensinformation.ie** returned 403 to automated fetches, so every rule above comes from revenue.ie only. A human should spot-check the Citizens Information rent and health pages.
- **The exact fields on the myAccount rent form.** Revenue's how-to-claim page names only the RTB number and asks for "as much information as possible". Landlord name, address, Eircode and tenancy dates come from third-party guides. Landlord PPSN or tax reference and the LPT number appear in one newspaper article. Confirm by opening the form with a real account.
- **Whether the health expenses form asks per category or for one total.** The sheet shows both to be safe.
- **Budget 2027 (October 2026)** may change amounts or extend the scheme beyond 2028. Not checked.

## 7. Data model

Defined in [src/schema.ts](src/schema.ts) with zod. The same schema is sent to Ollama as the structured-output `format`.

```
Extraction = Lease | RentPayment | MedicalReceipt | Med2 | Other   (tagged by "kind")

Lease          landlordName, landlordAddress?, propertyAddress, eircode?, rtbNumber?,
               monthlyRent?, startDate, endDate?, tenants[], evidence
RentPayment    date, amount, payee, coversFrom?, coversTo?, reference?, evidence
MedicalReceipt date, provider, patient?, description, category, total, lineItems[],
               reimbursed, prescribedOrReferred, evidence
Med2           taxYear, dentist, patient?, treatment, amount, evidence
Other          why, evidence

evidence: { [field]: exact text from the document the value was read from }

Profile (profile.json, optional)
               jointlyAssessed, landlordIsRelative?, receivesHousingSupport?,
               landlordIsApprovedHousingBody?, isPrincipalResidence?   (null = not answered)
```

The validator produces `Validated`: one `RentYear` per year (lines, rent paid, cap, credit, deadline) and one `HealthYear` per year (lines, total, estimated relief), the blocking or unanswered eligibility questions, and a list of `Finding { doc, rule, level: dropped | review | note, message }`.

## 8. Guard rules (code, not the model)

The model **reads and proposes**. Code decides what counts, and all money is computed in cents by code ([src/validate.ts](src/validate.ts)).

| # | Rule | On failure |
| --- | --- | --- |
| G1 | The model's output must parse against the schema; documents that aren't rent or medical are ignored | review / dropped |
| G2 | Every key amount, date and name must have an `evidence` quote that appears verbatim in the document, and the quote must contain that number or year (text documents; images are flagged "check by eye") | review |
| G3 | The same payment (date and amount) or receipt (date, provider and total) counts once | dropped |
| G4 | Only the current year and the previous four; the rent credit only for 2022–2028 | dropped |
| G5 | Rent must be paid to the lease landlord (name match) and inside the lease term; no RTB number gives a note | review |
| G6 | A landlord statement must cover one tax year | review |
| S1 | A payment read off a bank statement must have its whole line copied, that line must be in the PDF, and it must show the same date and amount; when two documents show one payment, the one code checked wins | review (that line only) |
| IN | A file that couldn't be opened (unsupported type, broken or very long scan) is listed, never silently dropped | review |
| G7 | Rent credit = min(20% × rent, cap for that year and assessment) | (computed) |
| G8 | Relative landlord, HAP/RAS, AHB landlord or not your home blocks the rent credit; unanswered questions show as a checklist | blocked / confirm |
| H1 | Routine dental, routine eye care and cosmetic work are dropped whatever the receipt says | dropped |
| H2 | Medicines and physio-type care need `prescribedOrReferred` | review |
| H3 | Non-routine dental needs a Med 2 for the same year and amount; a Med 2 without a receipt counts on its own | review |
| H4 | Line items must add up to the total | review |
| H5 | The reimbursed amount is subtracted, and can't exceed the total | review |
| D1 | Any year within 90 days of its deadline gets a warning at the top of the sheet | (warning) |

Anything marked "review" is excluded from the totals and listed under "Check these by hand". The sheet never shows a number that a rule didn't produce.

## 9. Privacy

- **Local only.** The model runs through Ollama on `127.0.0.1`. The extractor refuses to start if `OLLAMA_HOST` points anywhere else.
- No telemetry, no accounts, no network calls besides localhost. (Unlike Return Route, no Sentry, because the documents themselves are the sensitive data.)
- Outputs (`out/claim-sheet.md`, `out/extractions.json`) are written next to the tool, and `out/` and `shoebox/` are git-ignored.
- The tool never logs in to Revenue, never stores myAccount credentials, never submits.
- This is why an open-weight model matters here: a cloud model would mean uploading bank statements and medical receipts.

## 10. Success metric

**Euro back per minute of the person's time**, measured on real shoeboxes with consent (the person reports the time and the Revenue outcome; the tool collects nothing):

- minutes from "folder ready" to "last year submitted" (target: under 30);
- euro the sheet predicted vs euro Revenue actually refunded (target: Revenue ≥ 90% of predicted, and never a claim withdrawn on review);
- share of documents the guard held for review (lower is better, but never at the cost of a wrong number).

A first-time renter with three open years should see roughly €1,000–€2,700 back for about half an hour's work.

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| A small local model misreads or misfiles documents. In the first real run, Gemma 4 E4B filed 6 of 15 sample documents as "other", including the Med 2 and the landlord statement | Fixed for the samples: classify, then extract with one schema per kind; code normalises Irish dates; G2 accepts values printed verbatim. `pnpm eval` now scores 17/17 kinds and 36/36 fields. G1/G2 still keep wrong readings out of the totals. The samples are clean and synthetic, so real shoeboxes need their own eval set |
| Photos of receipts have no text to check quotes against, so G2 can't verify them | Flag "check by eye"; later, run local OCR (e.g. Tesseract) and check the model's quotes against the OCR text |
| Rules change (Budget, scheme end) | All amounts in one file with sources and a `RULES_CHECKED_ON` date; the sheet prints it |
| Someone over-claims (the landlord is a relative, they get HAP) | G8 blocks or asks; the sheet says it's not advice; the person submits |
| The tax-liability cap means less back than predicted | The sheet states it; "expected" wording, never "you will get" |
| myAccount UI changes, so the click paths go stale | Paths live in one function in `sheet.ts`; re-check yearly |
| Running a 4B+ model is slow (about 3 s per document on this Mac, with thinking off) | Fine for a once-a-year task; a progress line per document; cache extractions by file hash |

## 12. Open questions

1. What exactly does the myAccount Rent Tax Credit form ask for? (Needs a real walkthrough; see §6.)
2. One health expenses total, or per category?
3. Should the tool split flatmates' shared rent (each tenant claims their own share), or leave that for v2?
4. Parent-for-student claims: in v1 or not? They're common and valuable, but need course and age checks.
5. CLI only, or wrap in the Deis-style Electron shell for drag and drop?
6. Is a two-digit year enough evidence for a date (`14/03/25`)? It's currently accepted.
7. Should we bundle Tesseract for images, or trust Gemma's vision with a "check by eye" flag?
8. Licence: MIT (as Return Route) or AGPL (as Deis)? Currently MIT.

## 13. What's built vs stubbed (2026-10-23, after PDF support)

| Piece | State |
| --- | --- |
| Folder reader, `profile.json` | Real |
| `Extractor` interface | Real |
| `FakeExtractor` (canned answers in `fixtures/fake-responses.json`, some deliberately wrong) | Stub, for tests and the demo |
| `OllamaExtractor` (Gemma 4 E4B, classify then extract, structured output, localhost only) | Real; 19/19 kinds and 40/40 fields on the samples (text, 2 images, 3 PDFs) |
| Irish date normaliser ([src/dates.ts](src/dates.ts)) | Real, unit-tested |
| Eval (`pnpm eval`, [eval/truth.json](eval/truth.json)) | Real, on synthetic samples |
| Private eval on your own documents (`pnpm eval:private`, [eval/README.md](eval/README.md)) | Real; git-ignored, guarded with `git check-ignore`; truth drafted by Gemma for you to correct. No real documents added yet |
| Guard rules G1–G8, H1–H5 | Real, unit-tested |
| Claim sheet | Real; the form field names are partly unconfirmed |
| PDF input ([src/inputs.ts](src/inputs.ts)): text layer via pdf.js, scans drawn to PNG locally | Real; 19/19 kinds and 40/40 fields with the 3 PDF samples |
| Bank statements (S1, read a page at a time) | Real, unit-tested |
| HEIC, OCR for images, desktop UI, eval on real documents | Not started |
