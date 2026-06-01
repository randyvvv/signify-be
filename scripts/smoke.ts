/**
 * Smoke test: jalankan alur utama terhadap server yang sedang berjalan.
 *   register -> login -> me -> preferences -> dashboard -> quiz attempt -> purchase
 *
 * Prasyarat: server hidup + DB ter-migrate + sudah di-seed.
 *   pnpm dev          (terminal lain)
 *   pnpm db:seed
 *   pnpm smoke        (BASE_URL opsional, default http://localhost:8787)
 */
const BASE = process.env.BASE_URL ?? "http://localhost:8787";

let passed = 0;
let token = "";

function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`✔ ${label}`);
  } else {
    console.error(`x ${label}`, detail ?? "");
    throw new Error(`Smoke step failed: ${label}`);
  }
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
}

async function main() {
  console.log(`Smoke test -> ${BASE}\n`);

  const email = `smoke_${Date.now()}@test.app`;
  const password = "password123";

  // 1. register
  const reg = await api("POST", "/api/auth/register", {
    email,
    password,
    fullName: "Smoke Tester",
  });
  ok("register 201 + token", reg.status === 201 && !!reg.json?.token, reg);
  token = reg.json.token;

  // 2. login
  const login = await api("POST", "/api/auth/login", { email, password });
  ok("login 200 + token", login.status === 200 && !!login.json?.token, login);
  token = login.json.token;

  // 3. me
  const me = await api("GET", "/api/me");
  ok("GET /me 200 + rank", me.status === 200 && typeof me.json?.rank === "number", me);

  // 4. preferences (onboarding)
  const prefs = await api("PUT", "/api/me/preferences", {
    onboardingCompleted: true,
    frequency: "regular",
    goals: ["sign-lang"],
  });
  ok("PUT /me/preferences 200", prefs.status === 200 && prefs.json?.onboardingCompleted === true, prefs);

  // 5. dashboard
  const dash = await api("GET", "/api/dashboard");
  ok("GET /dashboard 200 + stats", dash.status === 200 && !!dash.json?.stats, dash);

  // 6. quiz attempt (kalau ada quiz hasil seed)
  let quizId: string | null = null;
  let answers: { questionId: string; selectedIndex: number }[] = [];
  const quizzes = await api("GET", "/api/quizzes");
  if (Array.isArray(quizzes.json) && quizzes.json.length > 0) {
    quizId = quizzes.json[0].id;
    const detail = await api("GET", `/api/quizzes/${quizId}`);
    ok("GET /quizzes/:id 200 + questions", detail.status === 200 && Array.isArray(detail.json?.questions), detail);

    answers = (detail.json.questions ?? []).map((q: any) => ({
      questionId: q.id,
      selectedIndex: 0,
    }));
    const attempt = await api("POST", `/api/quizzes/${quizId}/attempts`, {
      answers,
      timeTakenSeconds: 42,
    });
    ok(
      "POST /quizzes/:id/attempts 201 + accuracy",
      attempt.status === 201 && typeof attempt.json?.accuracy === "number",
      attempt,
    );
  } else {
    console.log("… tidak ada quiz (seed?), lewati langkah quiz");
  }

  // 7. purchase: item termurah berbayar yang belum dimiliki.
  // User baru mulai dari 0 coins, jadi kumpulkan dulu dengan mengulang quiz
  // sampai saldo cukup (deterministik untuk data seed).
  const items = await api("GET", "/api/shop/items");
  const buyable = Array.isArray(items.json)
    ? items.json
        .filter((i: any) => !i.isOwned && i.price > 0)
        .sort((a: any, b: any) => a.price - b.price)[0]
    : undefined;

  if (buyable) {
    const coins = async () => (await api("GET", "/api/me")).json?.coins ?? 0;
    let balance = await coins();
    let guard = 0;
    while (balance < buyable.price && quizId && answers.length && guard < 10) {
      await api("POST", `/api/quizzes/${quizId}/attempts`, { answers, timeTakenSeconds: 1 });
      balance = await coins();
      guard++;
    }

    if (balance >= buyable.price) {
      const buy = await api("POST", `/api/shop/items/${buyable.id}/purchase`);
      ok(
        "POST /shop/items/:id/purchase 201 + balance",
        buy.status === 201 && typeof buy.json?.balance === "number",
        buy,
      );
    } else {
      console.log(
        `… saldo ${balance} < harga termurah ${buyable.price} (${buyable.name}), lewati purchase`,
      );
    }
  } else {
    console.log("… tidak ada item berbayar untuk dibeli, lewati langkah purchase");
  }

  console.log(`\n✅ Smoke selesai — ${passed} langkah lolos.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n❌ Smoke gagal:`, err.message);
  process.exit(1);
});
