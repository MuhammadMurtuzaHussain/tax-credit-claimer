# Tax Credit Claimer

**Your shoebox of rent and medical receipts, turned into a ready-to-fill Revenue myAccount claim.** Built for renters and students in Ireland who've never claimed the Rent Tax Credit or health expenses relief.

Gemma 4 runs on your laptop through [Ollama](https://ollama.com) and reads each document. Plain code checks every amount, date and landlord detail before anything reaches the claim sheet. Nothing leaves your machine, and the tool never logs in to Revenue or submits anything: you copy the sheet into myAccount yourself.

> [!NOTE]
> Early skeleton. Not tax advice. Rules were checked against revenue.ie on 2026-10-22 (see [src/rules.ts](src/rules.ts) for sources).

## Gemma judges, code guarantees

| Gemma reads | Code decides |
| --- | --- |
| What kind of document it is, plus the landlord, amounts, dates and medical category | Every value must be quoted from the document, or the document is held for review |
| | Duplicates are counted once, and only the last four tax years are claimable |
| | Rent must go to the lease landlord, inside the lease term |
| | The rent credit is 20% of rent paid, capped per year (€500 for 2022–23, €1,000 for 2024–28) |
| | Routine dental, routine eye care and cosmetic work never count. Non-routine dental needs a Med 2 |

The rules are in [src/validate.ts](src/validate.ts).

## Run it

```bash
pnpm install
```

Try it on the sample shoebox with the fake model (no Ollama needed):

```bash
pnpm demo
```

Then open `out/claim-sheet.md`.

On your own documents with local Gemma (`.txt`, `.png` and `.jpg` for now):

```bash
ollama pull gemma4:e4b
```

```bash
pnpm claim ./shoebox
```

Add an optional `shoebox/profile.json` to answer what a document can't, such as whether your landlord is a relative or whether you get HAP. See [fixtures/shoebox/profile.json](fixtures/shoebox/profile.json).

```bash
pnpm test
```

## Licence

[MIT](LICENSE)
