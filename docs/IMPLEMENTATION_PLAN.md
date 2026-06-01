# signify-api — Implementation Plan

Rollout of the endpoint logic, split into small, independently reviewable PRs.
The scaffold (schema + routes with basic logic + Swagger docs) already exists; this
plan hardens it and fills the gaps.

## Known gaps in the current scaffold
- **Streak / last-active is never updated** — `streakCount` / `lastActiveDate` are read but never written.
- **No DB transactions** — coin mutations (quiz reward, shop purchase, like counters) are race-prone.
- **No AI endpoints yet** — the "Signify" chatbot and live translator have no routes.
- Missing: change password, equip validation (must own + category match), pagination totals,
  daily-goal target derived from preferences.

## PR sequence

### PR#1 — Core service layer ✅ (this PR)
Foundation everything else depends on.
- `src/lib/errors.ts` — `AppError` + consistent error responses, wired into `app.onError`.
- `src/lib/pagination.ts` — parse `page`/`limit`, build `{ items, page, limit, total, totalPages }`.
- `src/services/activity.ts` — `recordActivity(exec, userId, input)`: in one transaction, insert the
  activity row, add to `totalLearningSeconds`, and update the streak (`nextStreak` pure helper).
- `src/services/coins.ts` — `addCoins` / `spendCoins` (atomic conditional update, throws on insufficient).
- Tests for the pure `nextStreak` logic (`node:test`).

> Helpers land unused here on purpose; PR#3–#6 wire routes onto them.

### PR#2 — Auth hardening
- `POST /api/me/password` (change password).
- Normalize email (lowercase + trim) on register/login.
- Single `publicUser` shape everywhere.
- Update `openapi.ts`.

### PR#3 — Materials
- Use `recordActivity` on progress update/complete.
- Add `total` to the list response; validate query filters.
- `GET /api/materials/categories` & `/languages` for the FE filter sidebar.

### PR#4 — Quizzes
- `POST /:id/attempts` wrapped in a transaction: grade → save attempt+answers → `addCoins` →
  `recordActivity`. Reject question IDs not belonging to the quiz.
- Review payload shaped for the FE results page.
- Transactional, idempotent like/unlike counters.

### PR#5 — Shop & avatar
- `POST /items/:id/purchase` via atomic `spendCoins`.
- `PUT /shop/avatar`: validate each item is owned and its category matches; auto-own `isDefault` items.
- `GET /api/me/items` (owned + equipped).

### PR#6 — Sign practice, Dashboard, Leaderboard
- Sign-practice session → `recordActivity` (`practice`).
- Dashboard `dailyGoal.target` derived from `preferences.frequency`.
- Leaderboard includes the current user's position even when outside the limit.

### PR#7 — AI endpoints (stubs; model not ready)
Finalize the contracts + persistence; AI logic stubbed behind an `AI_ENABLED` flag.
- Chatbot: optional `chat_messages` table + `POST /api/chat` → `503 { code: "ai_unavailable" }`
  (or echo stub) with the final request/response contract.
- Live translator: `translator_sessions` table + `POST /api/translator/sessions`,
  `GET /api/translator/sessions`, `GET /:id`. Transcript/translation `null`, `status: "pending"`.
- New migration + `openapi.ts` updates.

### PR#8 — Seed, smoke test, deploy
- Idempotent seed with demo-ready data.
- `scripts/smoke.ts`: register → login → dashboard → quiz attempt → purchase.
- Railway deploy config + production env docs + final `openapi.ts`.

## Dependencies
PR#1 first. PR#2–#6 are sequential (all lean on PR#1's services). PR#7 & #8 last.
Any PR adding endpoints (**#2, #5, #7**) must also update `src/openapi.ts`.

> FE wiring (`signify-fe` → this API) is tracked separately, after the backend is solid.
