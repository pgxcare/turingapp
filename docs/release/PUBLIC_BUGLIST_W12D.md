# PUBLIC_BUGLIST_W12D

- Sprint: W12d Live Demo Stabilization
- Date (UTC): 2026-03-03
- Scope: public domains (`turing.care`, `app.turing.care`)

## Blocking issues

| ID | Severity | Area | Symptom on public domain | Evidence | Root cause | Fix status |
|---|---|---|---|---|---|---|
| W12D-BLK-01 | Critical | Marketing routing | Browser `ERR_TOO_MANY_REDIRECTS` on `/use-cases`, `/trust`, `/pilot`, `/demo` (intermittent on `/platform`) | `outputs/screens/w12d_smoke_browser_findings.log`, `outputs/screens/w12d_smoke_marketing_*.png` | Next.js + Netlify trailing-slash/RSC redirect ping-pong in live deploy | Code hardening committed (`7f55620`) but not reflected on live domain yet |
| W12D-BLK-02 | Critical | App runtime/API | Core demo/evidence APIs return 500 (`/integrations/epic-checklist`, `/metrics/control-tower`, `/metrics/models/model-risk-v1/drift`, `/changes`, `/models`, `/audit/cases`, `/policies`) | `outputs/screens/w12d_smoke_app_api.log` | Live deploy routes API calls to unreachable upstream (`http://api:8000/...`) / missing backend wiring in public environment | Runtime stabilization committed in app repo (`192f0df`), not deployed yet |

## Non-blocking observations

| ID | Severity | Area | Observation | Evidence |
|---|---|---|---|---|
| W12D-NB-01 | Medium | App routes | Required app pages return HTTP 200 (`/launch`, `/demo-mode`, HOLD/ABSTAIN/CAUTION presets, Drift, Change, Audit, `/smart/launch`) but are not reliably data-backed due API 500 | `outputs/screens/w12d_smoke_app_http.log`, `outputs/screens/w12d_smoke_app_*.png` |

## Deployment delta

Pending code that addresses identified root causes:

- Marketing repo commit: `7f55620` (`W12d: fix marketing redirect loops`)
- App repo commit: `192f0df` (`W12d: stabilize public app runtime and demo APIs`)

Until these commits are deployed to public domains, the live blockers remain active.
