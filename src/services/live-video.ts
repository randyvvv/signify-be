import { AccessToken, RoomServiceClient, TrackSource, TrackType } from "livekit-server-sdk";
import { env } from "../lib/env.js";

// Video Kelas Live lewat LiveKit: guru dan murid boleh menyalakan kamera & mikrofon
// (galeri seperti Zoom); guru bisa mematikan mikrofon murid.
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

/** Token akses room video satu kelas: kamera & mikrofon untuk semua peserta, tanpa data channel. */
export async function createVideoToken(
  credentials: VideoCredentials,
  opts: { classId: string; userId: string; name: string | null },
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
    canPublish: true,
    canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
    canPublishData: false,
  });
  return token.toJwt();
}

/** URL API server LiveKit (https) dari URL WebSocket klien (wss). */
export function liveKitApiUrl(url: string): string {
  return url.replace(/^ws(s?):\/\//, "http$1://");
}

/**
 * Matikan mikrofon murid di room kelas (remote mute; murid masih bisa menyalakannya
 * lagi). `identity` kosong = semua peserta selain guru. Mengembalikan jumlah track.
 */
export async function muteStudents(
  credentials: VideoCredentials & { url: string },
  opts: { classId: string; teacherId: string; identity?: string },
): Promise<number> {
  const rooms = new RoomServiceClient(liveKitApiUrl(credentials.url), credentials.apiKey, credentials.apiSecret);
  const room = videoRoomName(opts.classId);
  let participants;
  try {
    participants = await rooms.listParticipants(room);
  } catch {
    return 0; // room belum ada (belum ada yang bergabung ke video)
  }
  let muted = 0;
  for (const p of participants) {
    if (p.identity === opts.teacherId || (opts.identity && p.identity !== opts.identity)) continue;
    for (const track of p.tracks) {
      if (track.type !== TrackType.AUDIO || track.muted) continue;
      await rooms.mutePublishedTrack(room, p.identity, track.sid, true);
      muted++;
    }
  }
  return muted;
}
