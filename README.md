# Ripple

TypeScript API server for competitor tracking and analysis. Built with Express, Firebase Auth, and PostgreSQL.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm
- [Docker](https://www.docker.com/) (for local PostgreSQL)
- A [Firebase](https://console.firebase.google.com/) project with Email/Password auth enabled

## Getting started

Install dependencies:

```bash
npm install
```

Copy the environment file and fill in your Firebase credentials:

```bash
cp .env.example .env
```

Start PostgreSQL:

```bash
docker compose up -d
```

Run in development mode (auto-reload on file changes):

```bash
npm run dev
```

The server starts at [http://localhost:3000](http://localhost:3000). Database migrations run automatically on startup.

## Environment variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key |
| `FIREBASE_API_KEY` | Firebase Web API key |

See `.env.example` for the default local `DATABASE_URL`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run the server with hot reload via `tsx` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
| `npm run typecheck` | Type-check without emitting files |
| `npm run migrate` | Run database migrations manually |

## API

### Auth

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/signup` | No | Create a new user |
| `POST` | `/auth/signin` | No | Sign in and receive a Firebase ID token |

**Sign up**

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password123"}'
```

**Sign in**

```bash
curl -X POST http://localhost:3000/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password123"}'
```

### Competitors

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/competitors` | No | List all competitors |
| `POST` | `/competitors` | No | Create a competitor |
| `PATCH` | `/competitors/:id` | No | Update a competitor |
| `DELETE` | `/competitors/:id` | No | Delete a competitor |

**Create**

```bash
curl -X POST http://localhost:3000/competitors \
  -H "Content-Type: application/json" \
  -d '{"name":"LanceDB","website":"https://lancedb.ai"}'
```

### Analysis

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/analysis` | Yes | Analysis for all competitors |
| `GET` | `/competitors/:id/analysis` | Yes | Analysis for a single competitor |

Protected routes require a Firebase ID token:

```bash
curl http://localhost:3000/competitors/<id>/analysis \
  -H "Authorization: Bearer <firebase-id-token>"
```

## Project structure

```
src/
├── index.ts                 # Express app entry point
├── controller/
│   ├── analysis.ts
│   ├── competitor.ts
│   └── auth/
│       ├── signin.ts
│       └── signup.ts
├── service/
│   ├── analysisService.ts
│   └── competitorService.ts
├── schema/                  # Zod validation schemas
├── lib/
│   ├── auth.ts              # Firebase auth helpers
│   ├── db.ts                # PostgreSQL connection pool
│   ├── firebase.ts          # Firebase Admin SDK
│   └── migrate.ts           # Database migrations
├── middleware/
│   └── auth.ts              # Firebase token verification
└── types/
    └── express.d.ts
migrations/                  # SQL migration files
```

## Tech stack

- **TypeScript** — strict type checking
- **Express** — HTTP server
- **PostgreSQL** — competitor persistence
- **Firebase Auth** — user authentication
- **Zod** — request validation
- **Mastra** — AI agent framework

## License

ISC
