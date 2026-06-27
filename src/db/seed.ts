import { sql, eq } from "drizzle-orm";
import { db } from "./index.js";
import {
  users,
  userPreferences,
  shopItems,
  materials,
  quizzes,
  quizQuestions,
} from "./schema.js";
import { hashPassword } from "../lib/auth.js";

const DEMO_EMAIL = "demo@signify.app";
const DEMO_PASSWORD = "password123";

/**
 * Seed data contoh. Idempoten: kalau sudah ada data, dilewati.
 * Jalankan ulang dari nol dengan: SEED_RESET=true pnpm db:seed
 */
async function seed() {
  const reset = process.env.SEED_RESET === "true";

  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(shopItems);
  const count = Number(rows[0]?.count ?? 0);

  if (count > 0 && !reset) {
    console.log(
      "Sudah ada data — seed dilewati. Pakai SEED_RESET=true untuk reset & seed ulang.",
    );
    process.exit(0);
  }

  if (reset) {
    console.log("SEED_RESET=true — menghapus data demo lama...");
    await db.delete(quizQuestions);
    await db.delete(quizzes);
    await db.delete(materials);
    await db.delete(shopItems);
  }

  console.log("Seeding...");

  // ---- Shop items (sesuai signify-fe/src/components/shop/data.ts) ----
  // Avatar: imageUrl menyimpan path file .vrm di public/ frontend.
  await db.insert(shopItems).values([
    { name: "Classic", price: 0, category: "Avatar", imageUrl: "/avatar.vrm", isDefault: true },
    { name: "Casual", price: 200, category: "Avatar", imageUrl: "/avatar-b.vrm" },
    { name: "Sporty", price: 200, category: "Avatar", imageUrl: "/avatar-c.vrm" },
    // Hair = recolor material rambut VRM (bukan ganti gaya).
    { name: "Black", price: 0, category: "Hair", color: "#1a1a1a", isDefault: true },
    { name: "Brown", price: 200, category: "Hair", color: "#6b4423" },
    { name: "Blonde", price: 200, category: "Hair", color: "#d8b06a" },
    { name: "Pink", price: 200, category: "Hair", color: "#d46a9f" },
    { name: "Brown", price: 0, category: "Eye Color", color: "#634e34", isDefault: true },
    { name: "Blue", price: 100, category: "Eye Color", color: "#2E5090" },
    { name: "Green", price: 100, category: "Eye Color", color: "#00BA6F" },
    { name: "Glasses", price: 150, category: "Accessories" },
    { name: "Hat", price: 150, category: "Accessories" },
    { name: "Studio", price: 0, category: "Background", color: "#f0f0f0", isDefault: true },
    { name: "Park", price: 300, category: "Background", color: "#c1e1c1" },
  ]);

  // ---- Materials ----
  await db.insert(materials).values([
    {
      title: "Deaf 101: Classroom Access in Practice",
      description:
        "A realistic classroom scenario showing how deaf students combine captions, interpreters, notes, and self-advocacy.",
      type: "video",
      category: "Sign Language",
      language: "en",
      durationMinutes: 9,
      thumbnailUrl: "/learning-materials/classroom.png",
      videoUrl:
        "https://www.youtube.com/embed/videoseries?list=PLCXvz50QBXj7FmhNaUOpy7PAg70_2LPa-",
      transcript: [
        "A deaf student enters a lecture and checks whether captions, interpreter seating, and slides are ready before class starts.",
        "The student explains that access is not one single tool. A lecture may need captions, a discussion may need an interpreter, and a lab may need visual instructions.",
        "When the instructor turns away while speaking, the student asks them to face the room and repeat the key instruction.",
        "The session ends with a checklist: confirm accommodations early, keep communication visual, and ask for clarification before confusion builds.",
      ],
    },
    {
      title: "ASL Basics: A Complete Language, Not Just Gestures",
      description:
        "Understand ASL as a natural language with its own grammar, regional variation, facial expression, and fingerspelling.",
      type: "article",
      category: "Sign Language",
      language: "en",
      durationMinutes: 7,
      thumbnailUrl: "/learning-materials/asl.png",
      articleUrl: "https://www.nidcd.nih.gov/health/american-sign-language",
      content:
        "American Sign Language is a full visual language, not a word-for-word version of English. It uses handshape, movement, palm orientation, facial expression, and body position to express meaning. A learner should not treat ASL as only memorizing isolated signs. Real conversations depend on grammar, visual attention, and cultural norms. For example, questions can be marked with eyebrows and body posture, and names or technical terms may be fingerspelled when there is no common sign. In daily learning, practice short sentences, watch fluent signers, and pay attention to non-manual signals such as facial expression and eye gaze. The goal is to communicate clearly, not simply to copy hand motions.",
    },
    {
      title: "Fingerspelling Names, Places, and New Terms",
      description:
        "Practice when to fingerspell and how to make fingerspelling easier to read in school or workplace conversations.",
      type: "document",
      category: "Sign Language",
      language: "en",
      pages: 6,
      thumbnailUrl: "/learning-materials/fingerspelling.png",
      content:
        "Fingerspelling is useful for names, locations, brands, acronyms, and new vocabulary. In real conversations, the signer should keep the hand near shoulder height, spell at a steady rhythm, and pause briefly before and after the word. Learners often try to spell too fast; clear pacing is more important than speed. Receptive practice is just as important as expressive practice: watch the whole word shape, not only each letter. In class, fingerspelling can help introduce terms like DNA, API, or Amsterdam before the group agrees on a sign or written label. If someone misses the word, repeat it once, then write it down or show it on a slide.",
    },
    {
      title: "Captioned Videos: What Good Captions Include",
      description:
        "A practical guide to captions that support deaf learners in recorded lessons, livestream classes, and training videos.",
      type: "article",
      category: "K-12",
      language: "en",
      durationMinutes: 8,
      thumbnailUrl: "/learning-materials/video-captioning.png",
      articleUrl: "https://www.w3.org/WAI/media/av/captions/",
      content:
        "Captions should give learners access to spoken words and important sound information. A useful caption is accurate, synchronized with the speaker, and easy to read without covering important visuals. In a science video, captions should include terms such as photosynthesis or coefficient exactly as spoken because one wrong word can change the lesson. For group discussions, captions should identify speakers when possible. For sound cues, captions can describe meaningful audio such as alarm ringing, applause, or door closing. Automatic captions are helpful for drafts, but they should be reviewed before being used as a learning resource. Good captions help deaf students, language learners, students in noisy rooms, and anyone reviewing material silently.",
    },
    {
      title: "Transcripts for Podcasts and Recorded Lessons",
      description:
        "Learn how transcripts support review, search, translation, and AI tutoring for audio-heavy learning materials.",
      type: "article",
      category: "University",
      language: "en",
      durationMinutes: 6,
      thumbnailUrl: "/learning-materials/podcast.png",
      articleUrl: "https://www.w3.org/WAI/media/av/transcripts/",
      content:
        "A transcript is a text version of spoken or audio information. For deaf students, transcripts make podcasts, interviews, and recorded lectures accessible when captions are missing or when the learner wants to study at their own pace. A good transcript includes speaker names, key sound cues, and enough structure to scan quickly. In a university course, transcripts help students quote a lecture, search for a concept, translate difficult sections, and ask an AI assistant grounded questions about the lesson. Transcripts should not replace captions for video, because captions show timing while the video plays. The best learning experience uses both: captions for watching and transcripts for review.",
    },
    {
      title: "Online Class Access Checklist for Deaf Students",
      description:
        "A realistic checklist for making remote classes accessible before, during, and after each session.",
      type: "document",
      category: "University",
      language: "en",
      pages: 9,
      thumbnailUrl: "/learning-materials/online-class.png",
      content:
        "Before class, confirm that the meeting link, captions, interpreter access, and shared slides are ready. Ask the instructor to share vocabulary lists early when the class uses technical terms. During class, pin the interpreter or caption window, keep chat open for clarification, and remind speakers to use one microphone at a time. If breakout rooms are used, confirm that captions or interpreting support follows the student into the room. After class, review the recording, transcript, and notes while the material is still fresh. If access fails, document what happened and contact the disability services office or instructor with a specific request. The goal is not special treatment; it is equal access to the same learning activity.",
    },
    {
      title: "Requesting Accommodations Before a Semester Starts",
      description:
        "A step-by-step scenario for students preparing interpreter, captioning, note-taking, and testing accommodations.",
      type: "article",
      category: "University",
      language: "en",
      durationMinutes: 9,
      thumbnailUrl: "/learning-materials/accomodation.png",
      articleUrl: "https://nationaldeafcenter.org/resources/access-accommodations/",
      content:
        "Accommodation planning works best before the semester begins. Start by reviewing each course format: lecture, lab, discussion, practicum, exam, or online module. Then match the access need to the activity. A lecture might need real-time captions or an interpreter. A lab may need visual safety instructions. A group project may need communication norms and accessible meeting tools. Students should contact the disability services office early, share course schedules, and explain past accommodations that worked. After services are approved, confirm logistics with instructors in a short, professional message. If something changes, such as a guest speaker or field trip, ask about access as soon as possible.",
    },
    {
      title: "Effective Communication in Clinics and Public Services",
      description:
        "A real-life guide for communicating during appointments, office visits, and urgent public-service situations.",
      type: "article",
      category: "Career",
      language: "en",
      durationMinutes: 10,
      thumbnailUrl: "/learning-materials/communication.png",
      articleUrl: "https://www.ada.gov/resources/effective-communication/",
      content:
        "Effective communication means the deaf or hard-of-hearing person can receive information, ask questions, and respond with the same clarity as everyone else. In simple situations, writing notes or pointing to visual information may be enough. In complex situations such as medical appointments, legal discussions, job onboarding, or emergency instructions, a qualified interpreter, real-time captions, or another appropriate aid may be needed. The best choice depends on the length, complexity, context, and the person's usual communication method. Staff should not assume every deaf person uses sign language or that a family member should interpret. A respectful process asks what communication method works, confirms understanding, and gives enough time for questions.",
    },
    {
      title: "Assistive Devices in Daily Life",
      description:
        "Explore how assistive listening systems, alerting tools, captioned phones, and relay services support communication.",
      type: "article",
      category: "Vocational",
      language: "en",
      durationMinutes: 8,
      thumbnailUrl: "/learning-materials/iot.png",
      articleUrl:
        "https://www.nidcd.nih.gov/health/assistive-devices-people-hearing-voice-speech-or-language-disorders",
      content:
        "Assistive devices support different communication needs. Some tools amplify or send sound more directly to a hearing aid or cochlear implant. Other tools turn sound into visual or tactile information, such as flashing alerts, vibrating alarms, captions, or text messages. In a workplace, a deaf employee might use captions for meetings, a visual alert for emergency announcements, and a relay service for phone calls. In a classroom, an assistive listening system may improve the signal from the teacher's microphone, while captions support students who prefer text. No single device works for every situation. The practical skill is matching the tool to the environment and the person's communication preference.",
    },
    {
      title: "Job Interview Access Plan for Deaf Applicants",
      description:
        "Prepare a professional plan for interviews, recruiter calls, portfolio reviews, and follow-up messages.",
      type: "document",
      category: "Career",
      language: "en",
      pages: 8,
      thumbnailUrl: "/learning-materials/interview.png",
      content:
        "Before the interview, decide what access you need: interpreter, captions, video relay, written questions, or extra time for a technical task. Send a concise message to the recruiter: thank them, confirm the interview format, and request the access method that lets you participate fully. For video interviews, test camera framing, lighting, caption settings, and interpreter placement. During the interview, ask for one speaker at a time and request repetition when a question is missed. Prepare examples that show problem solving, teamwork, and communication strategy. After the interview, send a follow-up note summarizing interest in the role and any next-step access needs. The goal is to reduce friction so your skills are evaluated fairly.",
    },
    {
      title: "Certification Exam Accommodation Planner",
      description:
        "A career-focused planning guide for tests, licensure exams, and timed assessments.",
      type: "article",
      category: "Career",
      language: "en",
      durationMinutes: 7,
      thumbnailUrl: "/learning-materials/plan.png",
      articleUrl:
        "https://nationaldeafcenter.org/resource-items/planning-guidecertification-and-licensure-exams/",
      content:
        "Certification exams often affect graduation, licensing, or employment, so access planning should begin early. First, identify the testing organization, registration deadline, documentation rules, and appeal process. Then list the exam format: written questions, spoken instructions, proctor announcements, listening sections, practical demonstrations, or video prompts. Match each barrier with a specific accommodation such as captions, interpreter support for instructions, assistive listening technology, written directions, or a separate room. Keep copies of approvals and bring them on test day. Practice with the same timing and tools you expect to use. Good planning helps the exam measure knowledge and skill instead of measuring access barriers.",
    },
    {
      title: "Team Project Communication Norms",
      description:
        "Set up inclusive team rules for mixed deaf and hearing groups in school, hackathons, and internships.",
      type: "document",
      category: "Vocational",
      language: "en",
      pages: 5,
      thumbnailUrl: "/learning-materials/team.png",
      content:
        "At the start of a team project, agree on communication norms before work becomes urgent. Use shared written channels for decisions, deadlines, links, and action items. In meetings, use captions when available, avoid talking over each other, and pause after questions so interpreters or captions can catch up. Assign one person to write decisions in the chat or project board. Share diagrams, agendas, and vocabulary before the meeting when possible. For demos, make sure the presenter is visible, slides have readable text, and any spoken explanation also appears in notes or captions. Inclusive teamwork is not only about access; it improves memory, accountability, and clarity for the whole team.",
    },
    {
      title: "Accessible Presentations With Interpreters and Captions",
      description:
        "Learn how to prepare slides, speaker pacing, interpreter placement, and audience Q&A for accessible presentations.",
      type: "document",
      category: "Career",
      language: "en",
      pages: 7,
      thumbnailUrl: "/learning-materials/presentation.png",
      content:
        "An accessible presentation starts before the speaker walks on stage. Send slides, speaker notes, names, acronyms, and technical terms to interpreters or captioners ahead of time. During the talk, face the audience, speak at a steady pace, and avoid reading dense slides word for word. Keep the interpreter visible and well lit. Do not place captions over important diagrams or code. For Q&A, repeat or display the question before answering so everyone has the same context. If a video is shown, use captions and provide a transcript. Accessibility is strongest when it is designed into the presentation rather than added in a rush.",
    },
    {
      title: "Emergency Information Card for Campus Safety",
      description:
        "Build a visual emergency card for fire drills, health incidents, lost access, and urgent help requests.",
      type: "document",
      category: "K-12",
      language: "en",
      pages: 4,
      thumbnailUrl: "/learning-materials/emergency.png",
      content:
        "An emergency information card helps a deaf student communicate quickly when stress, noise, or low visibility makes conversation difficult. The card should include the student's name, preferred communication method, emergency contacts, interpreter or captioning needs, medical notes if relevant, and simple phrases such as I am deaf, please write, I need an interpreter, and where is the exit. Use large readable text and icons. Store the card on a phone and as a printed copy in a backpack or wallet. Practice using it during drills, not only real emergencies. The card is not a replacement for trained staff, but it gives first responders and school staff a fast path to effective communication.",
    },
  ]);

  // ---- Quiz + questions ----
  const createdQuizzes = await db
    .insert(quizzes)
    .values([
      {
        title: "Scientific & Technical Terms",
        description: "Practice less-common academic & technical vocabulary through quick quizzes.",
        category: "Vocational",
        level: "BEGINNER",
        likesCount: 743,
        rewardCoins: 50,
        thumbnailUrl: "/quizzes-thumb/quiz-science.jpg",
      },
      {
        title: "Job Interview Phrases",
        description: "Practice less-common academic & technical vocabulary through quick quizzes.",
        category: "Vocational",
        level: "BEGINNER",
        likesCount: 743,
        rewardCoins: 50,
        thumbnailUrl: "/quizzes-thumb/quiz-interview.jpg",
      },
      {
        title: "K-12 Basic Signs",
        description: "Essential sign language vocabulary for young learners and beginners.",
        category: "K-12",
        level: "BEGINNER",
        likesCount: 1200,
        rewardCoins: 30,
        thumbnailUrl: "/quizzes-thumb/quiz-k12.jpg",
      },
      {
        title: "University Level Phrases",
        description: "Advanced phrases for university students and academic discussions.",
        category: "University",
        level: "INTERMEDIATE",
        likesCount: 500,
        rewardCoins: 70,
        thumbnailUrl: "/quizzes-thumb/quiz-university.jpg",
      },
      {
        title: "Expert Sign Language",
        description: "Master the art of sign language with these expert-level phrases.",
        category: "Sign Language",
        level: "EXPERT",
        likesCount: 200,
        rewardCoins: 100,
        thumbnailUrl: "/quizzes-thumb/quiz-sign-language.jpg",
      },
      {
        title: "Career Advancement",
        description: "Vocabulary for professional growth and career advancement.",
        category: "Career",
        level: "INTERMEDIATE",
        likesCount: 890,
        rewardCoins: 60,
        thumbnailUrl: "/quizzes-thumb/quiz-career.jpg",
      }
    ])
    .returning();

  const CUSTOM_DICTIONARY = [
    { term: "A", imageUrl: "/quizzes/A.jpg" },
    { term: "B", imageUrl: "/quizzes/B.jpg" },
    { term: "Chair", imageUrl: "/quizzes/Chair.jpg" },
    { term: "Cold", imageUrl: "/quizzes/Cold.jpg" },
    { term: "D", imageUrl: "/quizzes/D.jpg" },
    { term: "E", imageUrl: "/quizzes/E.jpg" },
    { term: "F", imageUrl: "/quizzes/F.jpg" },
    { term: "K", imageUrl: "/quizzes/K.jpg" },
    { term: "Kiss", imageUrl: "/quizzes/Kiss.jpg" },
    { term: "M", imageUrl: "/quizzes/M.jpg" },
    { term: "Mad", imageUrl: "/quizzes/Mad.jpg" },
    { term: "O", imageUrl: "/quizzes/O.jpg" },
    { term: "P", imageUrl: "/quizzes/P.jpg" },
    { term: "Sleep", imageUrl: "/quizzes/Sleep.jpg" },
    { term: "Thank You", imageUrl: "/quizzes/Thank You.jpg" },
    { term: "Want", imageUrl: "/quizzes/Want.jpg" }
  ];

  function shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }

  for (const quiz of createdQuizzes) {
    const numQuestions = Math.floor(Math.random() * 6) + 5; // 5 to 10 questions
    const questionsToInsert = [];

    for (let i = 1; i <= numQuestions; i++) {
      const type = Math.random() > 0.5 ? "text" : "image";
      
      if (type === "text") {
        const correctPair = CUSTOM_DICTIONARY[Math.floor(Math.random() * CUSTOM_DICTIONARY.length)]!;
        
        let wrongPairs = CUSTOM_DICTIONARY.filter(p => p.term !== correctPair.term);
        wrongPairs = shuffle(wrongPairs).slice(0, 3);
        const options = shuffle([correctPair.term, ...wrongPairs.map(p => p.term)]);
        const correctIndex = options.indexOf(correctPair.term);

        questionsToInsert.push({
          quizId: quiz.id,
          ordering: i,
          type: "text",
          question: "What is the correct term for this sign?",
          promptImageUrl: correctPair.imageUrl,
          options: options,
          correctIndex: correctIndex,
        });
      } else {
        const correctPair = CUSTOM_DICTIONARY[Math.floor(Math.random() * CUSTOM_DICTIONARY.length)]!;
        
        let wrongPairs = CUSTOM_DICTIONARY.filter(p => p.imageUrl !== correctPair.imageUrl);
        wrongPairs = shuffle(wrongPairs).slice(0, 3);
        const options = shuffle([correctPair.imageUrl, ...wrongPairs.map(p => p.imageUrl)]);
        const correctIndex = options.indexOf(correctPair.imageUrl);

        questionsToInsert.push({
          quizId: quiz.id,
          ordering: i,
          type: "image",
          question: `What is the correct sign for "${correctPair.term}"?`,
          term: correctPair.term,
          options: options,
          correctIndex: correctIndex,
        });
      }
    }
    
    await db.insert(quizQuestions).values(questionsToInsert as any[]);
  }

  // ---- Demo user (idempoten by email) ----
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, DEMO_EMAIL),
  });
  if (!existingUser) {
    const [u] = await db
      .insert(users)
      .values({
        email: DEMO_EMAIL,
        passwordHash: await hashPassword(DEMO_PASSWORD),
        fullName: "Demo User",
        coins: 1000,
      })
      .returning();
    await db.insert(userPreferences).values({
      userId: u!.id,
      onboardingCompleted: true,
      frequency: "regular",
      goals: ["sign-lang"],
    });
    console.log(`Demo user dibuat: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }

  console.log("Seed selesai ✅");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
