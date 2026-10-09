import { decode, verifyWithJwks } from "hono/jwt";
import type { HonoJsonWebKey } from "hono/utils/jwt/jws";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUER = /^(https:\/\/)?accounts\.google\.com$/;
// Dipakai bila respons JWKS tidak membawa Cache-Control max-age.
const DEFAULT_KEYS_TTL_MS = 60 * 60 * 1000;

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

let cachedKeys: { keys: HonoJsonWebKey[]; expiresAt: number } | null = null;

/** Kunci publik Google, di-cache sesuai Cache-Control supaya tidak di-fetch tiap login. */
async function googleKeys(forceRefresh: boolean): Promise<HonoJsonWebKey[]> {
  if (!forceRefresh && cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys;

  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) throw new Error(`Gagal mengambil JWKS Google (${res.status})`);
  const { keys } = (await res.json()) as { keys?: HonoJsonWebKey[] };
  if (!Array.isArray(keys)) throw new Error("Respons JWKS Google tidak valid");

  const maxAge = Number(res.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1]);
  const ttl = Number.isFinite(maxAge) && maxAge > 0 ? maxAge * 1000 : DEFAULT_KEYS_TTL_MS;
  cachedKeys = { keys, expiresAt: Date.now() + ttl };
  return keys;
}

/**
 * Verifikasi ID token dari Google Identity Services: tanda tangan (JWKS Google),
 * issuer, audience (= Client ID kita), masa berlaku, dan email harus terverifikasi.
 * `keys` hanya untuk test; tanpa itu kunci diambil dari Google.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  opts: { audience: string[]; keys?: HonoJsonWebKey[] },
): Promise<GoogleProfile> {
  let keys = opts.keys;
  if (!keys) {
    const { kid } = decode(idToken).header;
    keys = await googleKeys(false);
    // Google merotasi kunci; kid yang belum dikenal -> ambil ulang sekali.
    if (!keys.some((k) => k.kid === kid)) keys = await googleKeys(true);
  }

  const payload = await verifyWithJwks(idToken, {
    keys,
    allowedAlgorithms: ["RS256"],
    // iat dimatikan: jam server yang sedikit tertinggal membuat token baru dianggap
    // "dari masa depan". Masa berlaku tetap dicek lewat exp.
    verification: { iss: GOOGLE_ISSUER, aud: opts.audience, iat: false },
  });

  const { sub, email, email_verified: emailVerified, name, picture, exp } = payload;
  if (typeof exp !== "number") throw new Error("ID token tanpa exp");
  if (typeof sub !== "string" || !sub) throw new Error("ID token tanpa sub");
  if (typeof email !== "string" || !email) throw new Error("ID token tanpa email");
  if (emailVerified !== true && emailVerified !== "true") throw new Error("Email Google belum terverifikasi");

  return {
    sub,
    email,
    name: typeof name === "string" && name.trim() ? name.trim() : undefined,
    picture: typeof picture === "string" && picture ? picture : undefined,
  };
}
