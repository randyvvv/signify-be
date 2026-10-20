import { AccessToken, TrackSource } from "livekit-server-sdk";
import { env } from "../lib/env.js";

// Video Kelas Live lewat LiveKit: guru menyiarkan kamera + suara, murid hanya menonton.
export interface VideoCredentials {
  apiKey: string;
  apiSecret: string;
}

const TOKEN_TTL = "6h";

export function videoRoomName(classId: string): string {
  return `signify-class-${classId}`;
}

/** Kredensial LiveKit dari env; null = fitur video nonaktif. */
export function videoCredentials(): (VideoCredentials & { url: string }) | null {
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return null;
  return { url: env.LIVEKIT_URL, apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET };
}

/** Token akses room video satu kelas. Hanya guru yang boleh menyiarkan (kamera & mikrofon). */
export async function createVideoToken(
  credentials: VideoCredentials,
  opts: { classId: string; userId: string; name: string | null; canPublish: boolean },
): Promise<string> {
  const token = new AccessToken(credentials.apiKey, credentials.apiSecret, {
    identity: opts.userId,
    name: opts.name ?? undefined,
    ttl: TOKEN_TTL,
  });
  token.addGrant({
    roomJoin: true,
    room: videoRoomName(opts.classId),
    canSubscribe: true,
    canPublish: opts.canPublish,
    canPublishSources: opts.canPublish ? [TrackSource.CAMERA, TrackSource.MICROPHONE] : [],
    canPublishData: false,
  });
  return token.toJwt();
}
