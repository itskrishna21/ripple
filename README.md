# Ripple

Competitive intelligence, automated. Track competitor websites weekly, diff the changes, score threats with an LLM.

**UI:** [frontend-lyart-eta-smuth8nxnu.vercel.app](https://frontend-lyart-eta-smuth8nxnu.vercel.app)  
**API:** [ripple-api-ewgu.onrender.com](https://ripple-api-ewgu.onrender.com)

---

## How it works

1. Add a competitor with URLs for their pricing, changelog, careers, and blog pages
2. Every Monday the scheduler fetches each URL, normalizes the HTML, and stores a snapshot
3. The worker diffs the new snapshot against the previous week, sends changes to an LLM, and computes a 0–100 threat score
4. Results appear in the dashboard immediately

## Stack

| Layer | Tech |
|---|---|
| API | Express + TypeScript |
| Auth | Firebase Auth |
| Database + queue | PostgreSQL + pg-boss |
| AI | Vercel AI SDK + OpenAI |
| Frontend | Next.js 16, Tailwind, TanStack Query |
| Deploy | Render (API) + Vercel (UI) |

## Local setup

```bash
# Prerequisites: Node 20+, PostgreSQL running locally

cp .env.example .env          # fill in Firebase + DB creds
npm install
npm run migrate               # run migrations
PROCESS_TYPE=web npm run dev  # API on :3000
```

Run the worker and scheduler in separate terminals:

```bash
PROCESS_TYPE=worker npm run dev
PROCESS_TYPE=scheduler npm run dev
```

## Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_PRIVATE_KEY` | Service account private key |
| `FIREBASE_API_KEY` | Web API key (for signup flow) |
| `LLM_API_KEY` | OpenAI key (optional — stub runs without it) |
| `LLM_MODEL` | Model name, default `gpt-4o-mini` |
| `CORS_ORIGIN` | Allowed frontend origin |

## API

```
POST   /auth/signup
POST   /auth/signin
GET    /competitors
POST   /competitors
PATCH  /competitors/:id
DELETE /competitors/:id
GET    /analysis
GET    /competitors/:id/analysis
GET    /health
GET    /ready
GET    /metrics
```

All competitor and analysis routes require `Authorization: Bearer <firebase-id-token>`.

## Tests

```bash
npm test          # 124 tests across pipeline, diff, scoring, reaper, HTTP
```
