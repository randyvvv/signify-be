# signify-api

Backend for **Signify** (a sign language learning platform). Built with **Hono** + **Drizzle ORM** + **Supabase Postgres**, using custom auth (JWT + bcrypt).

## Stack
- [Hono](https://hono.dev) on Node (`@hono/node-server`)
- [Drizzle ORM](https://orm.drizzle.team) with the `postgres` driver (postgres-js)
- Supabase Postgres
- Auth: JWT (`hono/jwt`) + `bcryptjs`
- Validation: `zod` + `@hono/zod-validator`

## Setup

```bash
pnpm install
cp .env.example .env   # fill in DATABASE_URL & JWT_SECRET from Supabase
```

Get `DATABASE_URL` from Supabase: **Project Settings → Database → Connection string → URI**.
- For **migrations** (`db:push`/`db:migrate`) use the *Direct connection* string.
- For the **runtime** you can use the *Session/Transaction pooler* string (the driver already sets `prepare: false`).

## Migrations & seed

```bash
pnpm db:generate     # generate SQL migration files from schema.ts
pnpm db:migrate:run  # apply migration files (programmatic migrator — recommended)
pnpm db:seed         # insert sample data + demo user (idempotent)
pnpm db:studio       # open Drizzle Studio
```

- `db:migrate:run` uses the drizzle-orm migrator (`src/db/migrate.ts`); it just runs
  the SQL files in `drizzle/` and does **not** introspect the DB. Prefer it over
  `drizzle-kit push`, which can crash introspecting a Supabase database on
  drizzle-kit 0.30.x.
- `db:seed` is idempotent: on a database that already has data it only adds
  seed data introduced later (currently the "Guess the Sign" quiz). Re-seed from
  scratch with `SEED_RESET=true pnpm db:seed` (PowerShell:
  `$env:SEED_RESET="true"; pnpm db:seed`). This also deletes the users' quiz
  attempts, purchased items, material progress and chats through cascades. It creates a demo login: **demo@signify.app / password123**.

## Run

```bash
pnpm dev     # http://localhost:8787
```

## Smoke test

With the server running and the DB seeded, run the end-to-end happy path
(register → login → me → preferences → dashboard → quiz attempt → purchase):

```bash
pnpm smoke               # against http://localhost:8787
BASE_URL=https://… pnpm smoke   # against a deployed instance
```

## Deploy (Railway)

`railway.json` is included. Railway builds with Nixpacks (`pnpm build`) and starts with:

```
node dist/db/migrate.js && node dist/index.js
```

so pending migrations run on every deploy before the server boots. Set the
environment variables from `.env.example` in the Railway service
(`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `AI_ENABLED`, …). Use the Supabase
*Direct connection* string for `DATABASE_URL` in production.

## API docs (Swagger)

Once the server is running:
- **Swagger UI:** http://localhost:8787/docs
- **Raw OpenAPI spec:** http://localhost:8787/openapi.json

To call protected endpoints from Swagger UI, click **Authorize** and paste the JWT
returned by `/api/auth/login` (no need to type the `Bearer ` prefix). The spec is
hand-maintained in `src/openapi.ts` — keep it in sync when you change routes.

## Endpoints

Everything lives under `/api`. All routes except `/auth/*` require the header `Authorization: Bearer <token>`.

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | `{ email, password, fullName? }` → `{ token, user }` |
| POST | `/api/auth/login` | `{ email, password }` → `{ token, user }` |
| GET | `/api/auth/session` | verify token |

### Profile & preferences
| Method | Path | Description |
|---|---|---|
| GET | `/api/me` | profile + stats (coins, streak, rank, totalLearningHours) |
| PATCH | `/api/me` | update name/gender/bio/avatar |
| GET | `/api/me/preferences` | onboarding + settings |
| PUT | `/api/me/preferences` | save onboarding/settings |

### Dashboard
| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard` | aggregated data for the dashboard page |

### Materials
| Method | Path | Description |
|---|---|---|
| GET | `/api/materials?search=&category=&language=&page=` | list + filter |
| GET | `/api/materials/:id` | detail + the user's progress |
| GET | `/api/materials/:id/recommended` | recommendations in the same category |
| PUT | `/api/materials/:id/progress` | `{ progress, durationSeconds? }` |

### Quizzes
| Method | Path | Description |
|---|---|---|
| GET | `/api/quizzes?search=&category=&level=` | list + filter |
| GET | `/api/quizzes/popular` | top 3 by likes |
| GET | `/api/quizzes/:id` | detail + questions (answer key omitted) |
| POST | `/api/quizzes/:id/attempts` | submit answers → accuracy + coins |
| GET | `/api/quizzes/:id/attempts` | the user's attempt history |
| POST/DELETE | `/api/quizzes/:id/like` | like / unlike |

### Shop & avatar
| Method | Path | Description |
|---|---|---|
| GET | `/api/shop/items?category=` | items + owned/equipped status |
| POST | `/api/shop/items/:id/purchase` | buy (deducts coins) |
| PUT | `/api/shop/avatar` | `{ equipped: { Hair: itemId, ... } }` |

### Sign practice
| Method | Path | Description |
|---|---|---|
| GET | `/api/sign-practice/categories` | list of scenarios |
| POST | `/api/sign-practice/sessions` | save practice results; with `attempts: [{ word, score }]` each word scoring ≥ 60 earns 5 coins and all words go to the vocabulary |
| GET | `/api/sign-practice` | aggregated progress |

### Sign dictionary
Custom `.pose` clips per word and sign language (e.g. BISINDO). They take priority
over SignGPT in `/api/translator/pose`. Writing is limited to `ADMIN_EMAILS`.
| Method | Path | Description |
|---|---|---|
| GET | `/api/signs/languages` | available sign languages (`ase`, `ins`) + `canEdit` |
| GET | `/api/signs?lang=&search=` | list entries (without pose data) |
| POST | `/api/signs` | `{ word, signedLanguage, pose }` (base64 `.pose`) → add/replace (admin) |
| DELETE | `/api/signs/:id` | delete an entry (admin) |

### Vocabulary (spaced repetition)
Words from sign practice, sign quizzes and the translator are collected per user and
scheduled with SM-2. The user's sign language comes from `PUT /api/me/preferences { signLanguage }`.
| Method | Path | Description |
|---|---|---|
| GET | `/api/vocabulary?lang=` | all words + `{ total, due, mastered, learning }` |
| GET | `/api/vocabulary/due?limit=` | cards due today |
| POST | `/api/vocabulary` | `{ word, source? }` → save a word |
| DELETE | `/api/vocabulary/:id` | remove a word |
| POST | `/api/vocabulary/reviews` | `{ reviews: [{ id, rating: again\|hard\|good\|easy }], durationSeconds }` → reschedule, +1 coin/card (max 20), counts toward the streak |

### Leaderboard
| Method | Path | Description |
|---|---|---|
| GET | `/api/leaderboard?limit=` | ranking by coins (`{ entries, me }`) |

### AI
Gated by `AI_ENABLED` (default `false`). The chatbot also requires
`GEMINI_API_KEY` and uses `GEMINI_MODEL` (default `gemini-2.5-flash`).
| Method | Path | Description |
|---|---|---|
| GET | `/api/chat?materialId=` | saved material chat history for the authenticated user |
| POST | `/api/chat` | material-grounded Signify chatbot using Gemini; `503 ai_unavailable` when disabled |
| POST | `/api/translator/transcript` | `{ url, lang? }` → fetch YouTube captions (`{ cues, source }`) that power the Live Translator |
| POST | `/api/translator/pose` | `{ text, signedLanguage?, spokenLanguage? }` → `{ clips: [{ text, source, pose }], missing }`; sign dictionary first, then SignGPT (cached, only for `SIGNGPT_LANGUAGES`) |
| POST | `/api/translator/recognize` | `{ frames: T×59×3, fps? }` → `{ text, confidence }` via the signify-model server at `SIGN_MODEL_URL`; `503 model_unavailable` when unset |
| POST | `/api/translator/sessions` | register a livestream URL and persist it for the user |
| GET | `/api/translator/sessions` | list the user's sessions |
| GET | `/api/translator/sessions/:id` | session detail |

## Sign language model
The sign language recognition model this backend integrates with lives in a
separate repo: **[AlthariqFairuz/signify-model](https://github.com/AlthariqFairuz/signify-model)**.

`POST /api/translator/recognize` forwards keypoints to an inference server that
wraps that model. The server is not part of this repo; it must accept

```json
POST <SIGN_MODEL_URL>
{ "keypoints": [[[x, y, z], ... 59 points], ... frames], "fps": 25 }
```

where each frame holds 17 MediaPipe pose landmarks (indices 0–16), then 21 left-hand
and 21 right-hand landmarks (zeros when a hand is not visible), and answer
`{ "text": "...", "confidence": 0.87 }`.
