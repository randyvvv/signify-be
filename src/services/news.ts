import type { News } from "../db/schema.js";

const WORDS_PER_MINUTE = 200;

/** "Signify Lolos ke Grand Final!" -> "signify-lolos-ke-grand-final" */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}

/** Perkiraan waktu baca (menit, minimal 1) dari isi markdown. */
export function readingMinutes(markdown: string): number {
  const words = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // gambar tidak dihitung
    .replace(/[#>*_`[\]()-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Bentuk ringkas untuk daftar berita (tanpa isi artikel). */
export function toNewsSummary(row: News) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    coverImageUrl: row.coverImageUrl,
    category: row.category,
    authorName: row.authorName,
    publishedAt: row.publishedAt,
    readingMinutes: readingMinutes(row.content),
  };
}

/** Detail artikel lengkap untuk halaman /news/:slug. */
export function toNewsDetail(row: News) {
  return {
    ...toNewsSummary(row),
    content: row.content,
    facts: row.facts,
    published: row.published,
    updatedAt: row.updatedAt,
  };
}
