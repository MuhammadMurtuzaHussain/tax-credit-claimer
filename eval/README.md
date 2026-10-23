# Eval

Two ways to measure how well the model reads a shoebox.

| Set | Documents | Truth file | Results | In git? |
| --- | --- | --- | --- | --- |
| Samples | `fixtures/shoebox/` (made up) | `eval/truth.json` | `eval/results/` | Yes |
| Private | `eval/private/shoebox/` (yours) | `eval/private/truth.json` | `eval/private/results/` | **Never** |

```bash
pnpm eval
```

## Your own documents

Everything under `eval/private/` is git-ignored. `pnpm eval:private` checks that with `git check-ignore` before it reads anything, and refuses to run if git could track the documents, the truth file or the results. The model runs through Ollama on this machine only.

**1. Make the folder.**

```bash
pnpm eval:private
```

**2. Add documents** to `eval/private/shoebox/`: PDFs, screenshots, photos, `.txt`. Aim for variety over volume. Ten to twenty is plenty:

- bank-app screenshots of rent transfers, a bank statement PDF, a landlord's letter
- your lease
- GP, pharmacy, dentist and physio receipts, crumpled ones too
- a Med 2, if you have one
- one or two things that should be ignored, like a shop receipt

**3. Redact what the tool doesn't need.** Black out or crop:

- IBANs, account and card numbers, sort codes
- your PPSN and any Revenue or tax reference
- diagnoses, prescription names and anything else clinical
- other people's names you'd rather keep out (flatmates, patients who aren't you)

**Leave readable** what the tool reads, or the eval can't score it: the date, the amount, the landlord's or provider's name, and words like "Rent", "Prescription", "Referred by" or "Med 2". On a bank statement, redacting the lines that aren't rent is fine, as long as each rent line stays whole.

Redact on a copy, and flatten it (export to PNG, or "print to PDF") so the hidden text is really gone, not just covered.

**4. Draft the answers.**

```bash
pnpm eval:private --init
```

Gemma reads every file and writes its answers to `eval/private/truth.draft.json`:

```json
{
  "_today": "2026-10-23",
  "IMG_4412.png": { "kind": "rent_payment", "date": "2025-04-01", "money": 1150 },
  "boots-receipt.jpg": { "kind": "medical_receipt", "date": "2025-03-14", "money": 23.4, "category": "prescribed_medicine" },
  "statement-q2.pdf": { "kind": "bank_statement", "payments": 3 }
}
```

Check each entry against the document and fix what's wrong. Delete a field to leave it unscored. Then rename the file to `truth.json`. Optionally add `"_totals": { "rent": 1000, "health": 54.6 }` with what the claim sheet should come to.

| Field | Meaning |
| --- | --- |
| `kind` | `lease`, `rent_payment`, `bank_statement`, `medical_receipt`, `med2` or `other` |
| `date` | Payment or receipt date, or the lease start, as `YYYY-MM-DD` |
| `money` | The amount paid or the receipt total, in euro |
| `category` | For medical receipts: `gp_or_consultant`, `prescribed_medicine`, `hospital_or_diagnostic`, `physio_or_similar_referred`, `non_routine_dental`, `routine_dental`, `routine_eye_care`, `cosmetic`, `other_health` |
| `payments` | For bank statements: how many rent payments are on it |

**5. Run it.** Run it after every prompt or rule change:

```bash
pnpm eval:private
```

Every reading is kept in `eval/private/results/` for comparing runs. The last line, for example `ollama gemma4:e4b · private · kind 14/15 · fields 31/34 · held 2 · 4.0s per doc`, holds no document contents, so you can paste it into an issue or the README.

To try a bigger model:

```bash
OLLAMA_MODEL=gemma4:26b pnpm eval:private
```
