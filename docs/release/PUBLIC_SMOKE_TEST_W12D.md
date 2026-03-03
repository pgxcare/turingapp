# PUBLIC_SMOKE_TEST_W12D

- Sprint: W12d Live Demo Stabilization
- Date (UTC): 2026-03-03
- Public domains:
  - https://turing.care
  - https://app.turing.care
- Goal: validate external guided demo readiness on public domains.

## Method

1. HTTP smoke with curl for required routes.
2. Browser smoke with Playwright for redirect/runtime behavior.
3. API probe for known blocking endpoints.
4. Evidence captured in `outputs/screens/w12d_smoke_*`.

## Marketing (`turing.care`)

### HTTP checks

From `outputs/screens/w12d_smoke_marketing_http.log`:

- `/` -> 200
- `/platform` -> 200
- `/use-cases` -> 200
- `/trust` -> 200
- `/pilot` -> 200
- `/demo` -> 200

### Browser checks

From `outputs/screens/w12d_smoke_browser_findings.log`:

- `/` -> OK
- `/platform` -> OK (intermittent)
- `/use-cases` -> `ERR_TOO_MANY_REDIRECTS`
- `/trust` -> `ERR_TOO_MANY_REDIRECTS`
- `/pilot` -> `ERR_TOO_MANY_REDIRECTS`
- `/demo` -> `ERR_TOO_MANY_REDIRECTS`

Conclusion: marketing redirect-loop blocker remains in browser navigation despite curl 200 responses.

## App (`app.turing.care`)

### HTTP route checks

From `outputs/screens/w12d_smoke_app_http.log`:

- `/launch` -> 200
- `/launch/pilot-pack` -> 200
- `/launch/demo-kit` -> 200
- `/demo-mode` -> 200
- `HOLD`: `/control-tower?demo_mode=1&preset=unit-hold` -> 200
- `ABSTAIN`: `/control-tower?demo_mode=1&preset=peds-abstain` -> 200
- `CAUTION`: `/control-tower?demo_mode=1&preset=drift-caution` -> 200
- `Drift`: `/drift/model-risk-v1?event_id=evt-caution-001` -> 200
- `Change`: `/changes` -> 200
- `Audit`: `/audit` -> 200
- `/smart/launch` -> 200

### API checks

From `outputs/screens/w12d_smoke_app_api.log`:

- `/api/v1/integrations/epic-checklist` -> 500
- `/api/v1/metrics/control-tower` -> 500
- `/api/v1/metrics/models/model-risk-v1/drift` -> 500
- `/api/v1/changes` -> 500
- `/api/v1/models` -> 500
- `/api/v1/audit/cases` -> 500
- `/api/v1/policies` -> 500

Conclusion: core guided-demo APIs are still failing in live public deploy.

## Artifacts

- `outputs/screens/w12d_smoke_marketing_http.log`
- `outputs/screens/w12d_smoke_app_http.log`
- `outputs/screens/w12d_smoke_app_api.log`
- `outputs/screens/w12d_smoke_browser_findings.log`
- `outputs/screens/w12d_smoke_marketing_home.png`
- `outputs/screens/w12d_smoke_marketing_platform.png`
- `outputs/screens/w12d_smoke_marketing_use_cases_slash.png`
- `outputs/screens/w12d_smoke_marketing_trust_slash.png`
- `outputs/screens/w12d_smoke_marketing_pilot_slash.png`
- `outputs/screens/w12d_smoke_marketing_demo_slash.png`
- `outputs/screens/w12d_smoke_app_launch.png`
- `outputs/screens/w12d_smoke_app_demo_mode.png`
- `outputs/screens/w12d_smoke_app_hold.png`
- `outputs/screens/w12d_smoke_app_abstain.png`
- `outputs/screens/w12d_smoke_app_caution.png`
- `outputs/screens/w12d_smoke_app_drift.png`
- `outputs/screens/w12d_smoke_app_change.png`
- `outputs/screens/w12d_smoke_app_audit.png`
- `outputs/screens/w12d_smoke_app_smart_launch.png`

## Verdict

Still not ready for external guided live demo.

Blocking reasons:

1. Marketing browser redirect loops on key routes (`/use-cases`, `/trust`, `/pilot`, `/demo`).
2. Live app core APIs still return 500, breaking evidence-backed walkthrough reliability.
