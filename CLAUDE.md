# Jersey Collision tools

Browser tools built by Reliable Office Services for its client **Jersey Collision** (auto body shop).
The Reliable rep on the account uses them for claims, CCC ONE estimate work and QuickBooks bookkeeping.
Everything runs in the browser. No invoice, estimate or customer data is ever uploaded to a server.

## What's here

| Folder | What it is | Where it lives |
|---|---|---|
| `vendor-reconciliation/` | Vendor invoice reconciliation, public version | Vercel: https://vendor-invoice-reconciliation.vercel.app |
| `claude-artifacts/vendor-reconciliation.html` | Same tool, claude.ai version (reads PDFs with Claude) | claude.ai artifact `U5k9Xajp6drY87snpqL3hh` |
| `claude-artifacts/estimate-compare.html` | Compares the Jersey Collision estimate/supplement to the insurer's, line by line | claude.ai artifact `TtpTBNbNEttyqMZB9TbtaW` |
| `claude-artifacts/job-tracker.html` | Job tracker: follow-ups, stages, payment, missing-parts list per RO | claude.ai artifact `5TnHVFSYELBFprBgZUpFBv` |
| `tests/` | Automated checks for the Vercel reconciliation | run `npm test` |

The `claude-artifacts/` files use `window.claude.use("sample")` (Claude reads PDFs) and `window.claude.use("db")`
(shared saved data). Those only work when opened on claude.ai. Outside claude.ai they fall back gracefully
(no PDF reading, data saved in the browser only). Keep that fallback working when editing them.

## Vendor reconciliation: business rules (do not change without asking Yitzi)

- **Purpose:** compare vendor invoices entered in CCC against vendor statements (QuickBooks reports or the vendor's own
  statement). Statement invoices missing from CCC go to the parts manager to find and enter.
- **Default period is last month.** Only statement invoices dated in the period are checked for "missing".
  CCC invoices from any date can still satisfy a match.
- **Match on the invoice total only, never line items.** Rows that repeat an invoice # in a file are its items;
  collapse them to one total.
- **Match order:** invoice # (with vendor) first; then, for leftovers, same amount + (same vendor or similar invoice #),
  within 45 days. Those show as "Matched by amount, invoice # entered differently", not as missing.
- **Credits:** Abington Auto Parts Honda invoices starting with `CM` are credits from earlier months. List them
  separately; never count them as missing. Rules are editable on the page (stored in the browser) with this one built in.
- **Report sections:** Missing from CCC · Matched by amount · Credits · Wrong vendor in CCC ·
  CCC invoices from other vendors (vendor not on any loaded statement) · Other things to check · Matched.
- Vendor names match loosely ("LKQ Corp" = "LKQ Corporation").

## Vercel version architecture (`vendor-reconciliation/`)

- `index.html`: page and styles. Libraries from cdnjs: PapaParse (CSV), SheetJS (Excel), pdf.js 3.11.174.
- `app.js`: file loading, column guessing, matching, report, copy-to-clipboard, sample data.
- `pdf-reader.js`: text PDFs → rows/columns by x-position under the report's own header row.
- `ocr-reader.js`: scanned PDFs → Tesseract.js 5.1.1 (loaded on demand from jsdelivr) → statement lines.
  Amounts are verified against the statement's running balance column; unconfirmed lines are flagged.
  Tested on a 2-page scanned Bergey's statement: 49/49 lines and amounts read correctly.
- Static site, no build step. Plain ES5-style JS, no framework. Keep it that way unless asked.

## Deploying

Vercel team `team_M8Fxw5ExVFWf9EdoeB6tomRR` (Reliable OS), project `vendor-invoice-reconciliation`
(`prj_A0Q0K2jxpbpSQ1LBHiAURLRS7FWf`). From `vendor-reconciliation/`: `vercel --prod`.
The live site and the claude.ai version are separate copies: a change to one does not reach the other.
After changing shared logic (matching, credits, report), apply it to both, or ask which one to update.

## Before shipping a change

1. `npm install && npm test` (must pass).
2. Open `vendor-reconciliation/index.html` locally, click "Try it with sample data", check the report reads sensibly.
3. Never commit real client files (statements, CCC exports, estimates). Use `tests/fixtures/` with made-up data only.

## Style

Reliable OS brand: navy `#2C3A93`, lime `#ADD41A`, cyan `#63CCED`. Atkinson Hyperlegible font,
generous spacing, light and dark mode, works on a phone. Plain, friendly wording for non-technical staff.
