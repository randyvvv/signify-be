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
pnpm db:generate   # generate SQL migration files from schema.ts
pnpm db:push       # apply the schema directly to the DB (fastest for dev)
pnpm db:seed       # insert sample data (materials, quiz, shop items)
pnpm db:studio     # open Drizzle Studio
```

## Run

```bash
pnpm dev     # http://localhost:8787
```

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
| POST | `/api/sign-practice/sessions` | save practice results |
| GET | `/api/sign-practice` | aggregated progress |

### Leaderboard
| Method | Path | Description |
|---|---|---|
| GET | `/api/leaderboard?limit=` | ranking by coins |

## Notes
- Hand detection (MediaPipe) still runs on the **client** (the FE). The backend only stores results/progress.
- Live Translator and the AI chatbot are not implemented yet (mostly external/AI) — they can be added later.
