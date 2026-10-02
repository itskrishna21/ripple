# Ripple

Weekly competitive intel. You pick who to watch. We fetch their pages, diff week over week, and score how much it actually matters.

**UI:** [frontend-lyart-eta-smuth8nxnu.vercel.app](https://frontend-lyart-eta-smuth8nxnu.vercel.app)  
**API:** [ripple-api-ewgu.onrender.com](https://ripple-api-ewgu.onrender.com)

You can add a competitor by hand. Or use **Find competitors**: company name from signup, web search so we don't mix up homonyms, Mastra proposes substitutes in the same product category. You tick what you want. We take a starting photo immediately, then crawl those URLs every week.

---

## How it works

1. Sign up with your company name. That's the tenant.
2. **Find competitors** proposes a list (`POST /discover`), or you paste URLs yourself.
3. Subscribe / add writes rivals and enqueues a baseline snapshot (`POST /discover/subscribe` or `POST /competitors`).
4. Every week the scheduler fetches pricing / changelog / careers / blog again.
5. The worker diffs vs the previous snapshot, Mastra categorizes, we score 0–100.
6. Dashboard shows the latest. First crawl is a starting photo (no score). No LLM key? stubs.

## Stack

| Layer | Tech |
|---|---|
| API | Express + TypeScript |
| Auth | Firebase Auth |
| Database + queue | PostgreSQL + pg-boss |
| AI | Mastra agents (categorize, discover) + OpenAI |
| Search | DuckDuckGo HTML, or Serper if you set `SERPER_API_KEY` |
| Frontend | Next.js, Tailwind, TanStack Query |
| Deploy | Render (API) + Vercel (UI) |

## Local setup

```bash
# Node 20+, Postgres up (docker-compose is fine)

cp .env.example .env          # Firebase + DATABASE_URL. LLM_API_KEY if you want real discover/analyze
npm install
npm run migrate
PROCESS_TYPE=web npm run dev  # API :3000
```

Frontend: `cd frontend && npm run dev` — usually `:3001`.

Worker + scheduler in other terminals:

```bash
PROCESS_TYPE=worker npm run dev
PROCESS_TYPE=scheduler npm run dev
```

## Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `FIREBASE_PROJECT_ID` | Firebase project |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_PRIVATE_KEY` | Service account key |
| `FIREBASE_API_KEY` | Web API key (signup) |
| `LLM_API_KEY` | OpenAI. Empty = stubs |
| `LLM_MODEL` | Default `gpt-4o-mini` |
| `SERPER_API_KEY` | Optional Google search via serper.dev |
| `CORS_ORIGIN` | Frontend origin (comma-separated if more than one) |

Don't paste keys in chat. `.env` stays local.

## API

```
POST   /auth/signup
POST   /auth/signin
GET    /me
GET    /competitors
POST   /competitors
PATCH  /competitors/:id
DELETE /competitors/:id
GET    /analysis
GET    /competitors/:id/analysis
POST   /discover
POST   /discover/subscribe
GET    /health
GET    /ready
GET    /metrics
```

`/me`, competitors, analysis, and discover need `Authorization: Bearer <firebase-id-token>`.

`POST /discover` uses the logged-in company. You don't send a name. Optional `companyName` override exists if you ever need it.

## Tests

```bash
npm test
```

Pipeline, diff, scoring, reaper, HTTP, Mastra evals, discover search parsing. `dist/` is excluded so compiled tests don't double-run.
