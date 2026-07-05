# Synthetic Israeli Fixture Corpus

Every file here is FULLY SYNTHETIC — invented institutions, numbers, and account
references. No real household data may ever be added to this directory (public repo).

- `hishtalmut-statement.csv` — keren hishtalmut / gemel provider export style
- `bank-accounts-summary.csv` — bank account-summary export style
- `mislaka-style-export.csv` — simplified multi-product pension clearing export
  (the real Mislaka is XML; a real-XML adapter lands when real documents arrive)
- `pension-annual-report.pdf` — GENERATED Hebrew annual pension report. Rendered in
  visual order (Hebrew reversed per line) to reproduce the classic RTL extraction
  problem of real Israeli institution PDFs. Regenerate: `node fixtures/generate-pension-pdf.mjs`
