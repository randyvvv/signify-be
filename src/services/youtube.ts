// ---- YouTube transcript via youtube-transcript.io API --------------------
// Pakai layanan pihak ketiga (mereka yang urus blokir/anti-bot YouTube).
// Token disimpan di env YT_TRANSCRIPT_IO_TOKEN. offset/duration dalam ms.

export function extractVideoId(input: string): string | null {
  const raw = input.trim();
  const m = raw.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([\w-]{11})/,
  );
  if (m) return m[1]!;
  return /^[\w-]{11}$/.test(raw) ? raw : null;
}

interface IoTrack {
  language: string;
  transcript: { start: string; dur: string; text: string }[];
}
interface IoItem {
  id: string;
  tracks?: IoTrack[];
}

export async function fetchTranscriptViaApi(videoId: string, lang?: string) {
  const token = process.env.YT_TRANSCRIPT_IO_TOKEN?.trim();
  if (!token) throw new Error("YT_TRANSCRIPT_IO_TOKEN belum diset di .env");

  const res = await fetch("https://www.youtube-transcript.io/api/transcripts", {
    method: "POST",
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [videoId] }),
  });
  if (!res.ok) throw new Error(`youtube-transcript.io ${res.status}`);

  const data = (await res.json()) as IoItem[];
  const item = data.find((d) => d.id === videoId) ?? data[0];
  const tracks = item?.tracks ?? [];
  if (tracks.length === 0) return [];
  const track =
    (lang ? tracks.find((t) => t.language?.startsWith(lang)) : undefined) ??
    tracks[0]!;
  return (track.transcript ?? [])
    .map((s) => ({
      text: s.text.replace(/\n/g, " ").trim(),
      offset: Math.round(parseFloat(s.start) * 1000),
      duration: Math.round(parseFloat(s.dur) * 1000),
    }))
    .filter((cue) => cue.text);
}
