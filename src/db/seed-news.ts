import { db } from "./index.js";
import { news, type NewsFact } from "./schema.js";

// Aset gambar berita ada di frontend: signify-fe/public/news/<slug>/
const HACKASTONE_SLUG = "signify-hackastone-2026-grand-final";
const HACKASTONE_ASSETS = `/news/${HACKASTONE_SLUG}`;

const HACKASTONE_FACTS: NewsFact[] = [
  { label: "Event", value: "HackAstone 2026 Grand Final" },
  { label: "Theme", value: "Agentic AI for Education" },
  { label: "Organizer", value: "Association of Global AI Technomics Education & Exchange" },
  { label: "Venue", value: "Vrije Universiteit Amsterdam, the Netherlands" },
  { label: "Date", value: "29–30 October 2026" },
  { label: "Website", value: "hackastone.varteledu.com", href: "https://hackastone.varteledu.com/" },
];

const HACKASTONE_CONTENT = `Signify, an AI-powered platform for learning and using sign language, has been selected as a finalist of **HackAstone 2026**. The team will present Signify at the **Grand Final**, held at **Vrije Universiteit Amsterdam** in the Netherlands on **29–30 October 2026**.

## About HackAstone 2026

HackAstone (HACKATHON Through CAPstone) is organized by the Association of Global AI Technomics Education & Exchange. The 2026 edition carries the theme **Agentic AI for Education**.

## What Signify brings to Amsterdam

Signify makes sign language easier to learn and to use, both for Deaf learners and for hearing people who want to communicate with them. At its core is **Signa**, an agentic AI learning coach. Learners describe a goal, such as getting ready for a job interview, and Signa reads their real progress, plans the steps and acts inside the app: it builds a personal sign quiz, adds new words to My Signs and has the 3D avatar demonstrate the key signs.

Signa works alongside the rest of the platform:

- **Live Translator**: text and YouTube videos turned into sign language by a 3D avatar, and signs turned into text through the camera.
- **Sign Practice**: camera-based practice that scores hand movements from 0 to 100 in real time.
- **Learning Materials**: accessible videos, articles and documents with a signing avatar, transcripts and a material chatbot.
- **Quizzes and My Signs**: sign quizzes plus spaced-repetition review that keeps signs in long-term memory.

## Meet the team

![The Signify team during an online team meeting](${HACKASTONE_ASSETS}/team.jpg)

Signify is built by eight people:

- Randy Verdian
- Muhammad Al Thariq Fairuz
- Shafiq Irvansyah
- Sa'ad Abdul Hakim
- Yusuf Ardian Sandi
- Thea Josephine Halim
- Melati Anggraini
- Olivia Christy Lismanto

## Thank you to our sponsors

We thank **Indonesia AI Institute**, our main sponsor, together with **AI Center ITB** and **Telkom Indonesia** for supporting Signify.

## Try Signify

Signify is available at [ai-signify.com](https://www.ai-signify.com). Follow our road to the Grand Final here on Signify News.`;

/**
 * Berita awal. Idempoten by slug: berita yang sudah ada (termasuk yang sudah
 * diedit di database) tidak ditimpa.
 */
export async function seedNews() {
  const inserted = await db
    .insert(news)
    .values({
      slug: HACKASTONE_SLUG,
      title: "Signify Advances to the HackAstone 2026 Grand Final in Amsterdam",
      excerpt:
        "Signify has been selected as a finalist of HackAstone 2026 and will compete in the Grand Final at Vrije Universiteit Amsterdam on 29–30 October 2026.",
      content: HACKASTONE_CONTENT,
      coverImageUrl: `${HACKASTONE_ASSETS}/cover.jpg`,
      category: "Achievement",
      authorName: "Signify Team",
      facts: HACKASTONE_FACTS,
      publishedAt: new Date("2026-10-09T09:00:00+07:00"),
    })
    .onConflictDoNothing({ target: news.slug })
    .returning({ slug: news.slug });
  if (inserted.length) console.log(`Berita "${HACKASTONE_SLUG}" ditambahkan`);
}
