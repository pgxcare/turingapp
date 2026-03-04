# W14 Release Closure

- Date (UTC): 2026-03-04
- Public app URL: https://app.turing.care/changes
- Release merge commit (feature payload): `6b43882` (Merge branch `codex/w14-roi-case-packet` into `main`)
- Current `main` head after writing this note: `0ac6629`

## Deployment confirmation

- `main` pushed to `origin` at commit `6b43882`.
- Public endpoint transition observed:
  - Initial: `GET /api/v1/reports/roi-artifacts?format=csv` -> `404`
  - After deploy propagation (2026-03-04T21:15:24Z): `200` with non-zero CSV payload.

## Public verification (app.turing.care)

Verified from `/changes` UI with real browser download events:

1. ROI CSV export
- Download: `roi-artifacts-2026-03-04T21-16-25-246Z.csv`
- Size: `657` bytes
- Result: PASS

2. ROI PDF export
- Download: `roi-artifacts-2026-03-04T21-16-26-169Z.pdf`
- Size: `4751` bytes
- Result: PASS

3. Case Packet export
- Download: `case-packet-chg-caution-001-2026-03-04T21-17-11-727Z.json`
- Size: `4193` bytes
- Result: PASS

## Supporting HTTP evidence

- ROI CSV endpoint: `200`, `text/csv; charset=utf-8`
- ROI PDF endpoint: `200`, `application/pdf`
- Case Packet endpoint: `200`, `application/json`
- Logged in: `outputs/w14-release/public-http-summary.log`

## Final public verification result (current live state)

Initial verification on the deployed feature commit (`6b43882`) was successful: CSV export, PDF export, and Case Packet export all downloaded with non-zero files from `https://app.turing.care/changes`.

After pushing docs commit `0ac6629`, the public app entered a platform-level outage:
- `GET https://app.turing.care/` -> `HTTP 503`
- Body: `{"error":"usage_exceeded","message":"Usage exceeded",...}`
- Server: Netlify (`x-nf-request-id` logged)

As of this note, W14 live closure is **blocked by hosting quota/usage**, not by the W14 export implementation.
