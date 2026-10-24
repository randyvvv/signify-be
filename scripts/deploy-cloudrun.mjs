#!/usr/bin/env node
// Deploy signify-api ke Google Cloud Run memakai nilai dari .env.
//
//   node scripts/deploy-cloudrun.mjs --project <PROJECT_ID> [--dry-run]
//
// Opsi: --region asia-southeast1 · --service signify-api · --env .env · --min-instances 1
//       --skip-secrets (pakai secret yang sudah ada) · --dry-run (tampilkan rencana, tanpa mengubah apa pun)
//
// Rahasia dikirim ke Secret Manager lewat stdin, jadi tidak pernah muncul di argumen perintah,
// log, atau file. Variabel lain ditulis ke cloudrun.env.yaml (di-gitignore).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

const PROJECT = opt("project");
const REGION = opt("region", "asia-southeast1");
const SERVICE = opt("service", "signify-api");
const ENV_FILE = join(ROOT, opt("env", ".env"));
const MIN_INSTANCES = opt("min-instances", "1");
const DRY = flag("dry-run");
const SKIP_SECRETS = flag("skip-secrets");

// Rahasia -> Secret Manager. Sisanya -> variabel biasa.
const SECRET_KEYS = ["DATABASE_URL", "JWT_SECRET", "GEMINI_API_KEY", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "YT_TRANSCRIPT_IO_TOKEN"];
// PORT diatur Cloud Run sendiri; SEED_RESET hanya untuk seeding lokal.
const SKIP_KEYS = new Set(["PORT", "SEED_RESET"]);
const secretName = (key) => `signify-${key.toLowerCase().replace(/_/g, "-")}`;

function die(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}
const step = (msg) => console.log(`\n▸ ${msg}`);

// gcloud.cmd di Windows hanya bisa dipanggil lewat shell; argumen di sini tidak pernah berisi rahasia.
function gcloud(argv, { input, allowFail = false, quiet = false } = {}) {
  const shown = `gcloud ${argv.join(" ")}`;
  if (DRY && !quiet) {
    console.log(`  [dry-run] ${shown}${input !== undefined ? "  (nilai lewat stdin)" : ""}`);
    return { ok: true, out: "" };
  }
  const win = process.platform === "win32";
  const quoted = win ? argv.map((a) => (/[\s,;&|<>^"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)) : argv;
  const r = spawnSync("gcloud", quoted, { input, encoding: "utf8", shell: win, stdio: [input !== undefined ? "pipe" : "inherit", "pipe", "pipe"] });
  const ok = r.status === 0;
  if (!ok && !allowFail) die(`${shown}\n${(r.stderr || r.error?.message || "").trim()}`);
  return { ok, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v.trim();
  }
  return out;
}
const isUrl = (v) => { try { return /^(https?|wss?):$/.test(new URL(v).protocol); } catch { return false; } };
const isLocal = (v) => { try { return /^(localhost|127\.|0\.0\.0\.0)/.test(new URL(v).hostname); } catch { return false; } };

// ---------- 0. Pemeriksaan awal ----------
if (!PROJECT) die("Tentukan project: node scripts/deploy-cloudrun.mjs --project <PROJECT_ID>");
if (!existsSync(ENV_FILE)) die(`File env tidak ada: ${ENV_FILE}\nTaruh file .env (dari Randy) di folder signify-be.`);
if (!existsSync(join(ROOT, "Dockerfile"))) die("Dockerfile tidak ada. Pastikan menjalankan skrip dari repo signify-be terbaru.");
const env = parseEnv(readFileSync(ENV_FILE, "utf8"));

const account = gcloud(["config", "get-value", "account"], { quiet: true, allowFail: true }).out;
console.log(`Akun gcloud : ${account || "(belum login: jalankan gcloud auth login)"}`);
console.log(`Project     : ${PROJECT}   Region: ${REGION}   Service: ${SERVICE}`);
console.log(`File env    : ${ENV_FILE}${DRY ? "   [DRY RUN: tidak ada yang diubah]" : ""}`);
if (!account && !DRY) die("Belum login gcloud. Jalankan: gcloud auth login");

for (const k of ["DATABASE_URL", "JWT_SECRET"]) if (!env[k]) die(`${k} kosong di ${ENV_FILE}`);

// ---------- 1. Pisahkan rahasia dan variabel biasa ----------
const secrets = SECRET_KEYS.filter((k) => env[k]);
const plain = {};
const skipped = [];
for (const [k, v] of Object.entries(env)) {
  if (SECRET_KEYS.includes(k) || SKIP_KEYS.has(k)) continue;
  if (!v) { skipped.push(`${k} (kosong)`); continue; }
  if (k.endsWith("_URL") && (!isUrl(v) || isLocal(v))) { skipped.push(`${k} (bukan URL publik)`); continue; }
  plain[k] = v;
}
// Default produksi yang dipakai Railway, kecuali .env mengisinya sendiri.
plain.GEMINI_VERTEX ??= "true";
plain.VERTEX_LOCATION ??= "global";
plain.AI_ENABLED ??= "true";
if (!/ai-signify\.com/.test(plain.CORS_ORIGIN ?? "")) {
  plain.CORS_ORIGIN = ["https://www.ai-signify.com", "https://ai-signify.com", plain.CORS_ORIGIN].filter(Boolean).join(",");
  console.log("  CORS_ORIGIN belum memuat ai-signify.com: domain produksi ditambahkan.");
}

step("Rencana variabel");
console.log(`  Secret Manager (${secrets.length}): ${secrets.join(", ")}`);
console.log(`  Variabel biasa (${Object.keys(plain).length}): ${Object.keys(plain).join(", ")}`);
if (skipped.length) console.log(`  Dilewati: ${skipped.join(", ")}`);

// ---------- 2. Aktifkan API ----------
step("Mengaktifkan API (Cloud Run, Cloud Build, Artifact Registry, Secret Manager)");
gcloud(["services", "enable", "run.googleapis.com", "cloudbuild.googleapis.com", "artifactregistry.googleapis.com", "secretmanager.googleapis.com", "--project", PROJECT]);

// ---------- 3. Rahasia ----------
const projectNumber = DRY ? "<PROJECT_NUMBER>" : gcloud(["projects", "describe", PROJECT, "--format=value(projectNumber)"], { quiet: true }).out;
const runtimeSa = `${projectNumber}-compute@developer.gserviceaccount.com`;
if (SKIP_SECRETS) {
  step("Melewati pembuatan secret (--skip-secrets)");
} else {
  step(`Menyimpan ${secrets.length} rahasia ke Secret Manager`);
  for (const key of secrets) {
    const name = secretName(key);
    const exists = DRY ? false : gcloud(["secrets", "describe", name, "--project", PROJECT], { allowFail: true, quiet: true }).ok;
    if (!exists) {
      gcloud(["secrets", "create", name, "--replication-policy=automatic", "--data-file=-", "--project", PROJECT], { input: env[key] });
      console.log(`  + ${name} dibuat`);
    } else {
      const current = gcloud(["secrets", "versions", "access", "latest", "--secret", name, "--project", PROJECT], { allowFail: true, quiet: true });
      if (current.ok && current.out === env[key]) {
        console.log(`  = ${name} sudah sama`);
      } else {
        gcloud(["secrets", "versions", "add", name, "--data-file=-", "--project", PROJECT], { input: env[key] });
        console.log(`  ↑ ${name} versi baru`);
      }
    }
    gcloud(["secrets", "add-iam-policy-binding", name, `--member=serviceAccount:${runtimeSa}`, "--role=roles/secretmanager.secretAccessor", "--project", PROJECT, "--quiet"], { quiet: !DRY });
  }
}

// ---------- 4. File variabel biasa ----------
const yamlPath = join(ROOT, "cloudrun.env.yaml");
const yaml = "# Dibuat oleh scripts/deploy-cloudrun.mjs dari .env. Jangan di-commit.\n" +
  Object.entries(plain).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n") + "\n";
step(`Menulis ${yamlPath}`);
if (!DRY) writeFileSync(yamlPath, yaml);

// ---------- 5. Deploy ----------
step("Build + deploy ke Cloud Run (Cloud Build, ±3–6 menit)");
const setSecrets = secrets.map((k) => `${k}=${secretName(k)}:latest`).join(",");
gcloud([
  "run", "deploy", SERVICE, "--source", ".", "--region", REGION, "--project", PROJECT,
  "--allow-unauthenticated",
  // Ruang Kelas Live ada di memori: semua kelas harus di satu instance.
  "--max-instances", "1", "--min-instances", MIN_INSTANCES,
  // Tiap WebSocket murid dihitung satu request; batas waktu maksimum Cloud Run untuk WebSocket.
  "--concurrency", "1000", "--timeout", "3600",
  "--no-cpu-throttling", "--cpu", "1", "--memory", "1Gi",
  "--env-vars-file", "cloudrun.env.yaml",
  ...(setSecrets ? ["--set-secrets", setSecrets] : []),
  "--quiet",
]);

// ---------- 6. Cek ----------
if (DRY) {
  console.log("\n✓ Dry run selesai. Jalankan lagi tanpa --dry-run untuk deploy sungguhan.");
  process.exit(0);
}
const url = gcloud(["run", "services", "describe", SERVICE, "--region", REGION, "--project", PROJECT, "--format=value(status.url)"], { quiet: true }).out;
step(`Cek ${url}/health`);
try {
  const res = await fetch(`${url}/health`);
  console.log(`  HTTP ${res.status} ${await res.text()}`);
} catch (err) {
  console.log(`  Gagal menghubungi service: ${err.message}`);
}
console.log(`\n✓ Selesai. URL backend: ${url}`);
console.log(`  Berikutnya: set NEXT_PUBLIC_API_URL=${url} di Vercel (signify-fe), lalu redeploy frontend.`);
