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
    // Data yang ditambahkan belakangan tetap diisi tanpa menghapus data lama.
    await seedSignQuiz();
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
      content: [
        `# ASL Is a Complete Language

American Sign Language is a full visual language, not a word-for-word version of English. It uses **handshape**, movement, palm orientation, facial expression, and body position to express meaning.

## What learners should notice

- ASL has its own grammar and sentence structure.
- Facial expression and body posture can change meaning.
- Fingerspelling is used for names, technical terms, and words without a common sign.
- Fluent communication depends on visual attention, turn-taking, and cultural norms.

> A good goal is not to copy isolated hand motions. The goal is to communicate clearly in a visual language.

## Practice prompt

Watch a short ASL conversation and write down three things that are not hand movement: eyebrow position, eye gaze, body shift, or timing. Then practice one short sentence while keeping those visual signals intentional.`,
      ],
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
      content: [
        `# Page 1: When to Fingerspell

Fingerspelling is useful for **names, locations, brands, acronyms, and new vocabulary**. It is especially helpful when a group has not agreed on a shared sign yet.

## Common situations

- Introducing a student's name or preferred name.
- Naming a city, campus building, company, or software tool.
- Explaining technical terms such as DNA, API, or VPN.
- Clarifying an abbreviation before discussion begins.

Use fingerspelling as a bridge. After the word is introduced, the group can decide whether to keep fingerspelling it, write it, or use an agreed sign.`,
        `# Page 2: Make It Readable

Readable fingerspelling depends on placement and rhythm. Keep the hand near shoulder height and inside the listener's visual field.

## Good form checklist

- Keep the wrist relaxed and stable.
- Do not bounce each letter.
- Avoid spelling too low, too high, or too far from your body.
- Pause briefly before and after the word.

> Clear pacing is more important than speed.

If the listener is watching your face, move the spelling hand where it can be seen without forcing them to look away completely.`,
        `# Page 3: Pacing and Grouping

Learners often try to spell every letter quickly. In real communication, the better skill is **controlled rhythm**.

## Try this method

1. Pause before the word.
2. Spell the word at a steady pace.
3. Hold the final letter for a short moment.
4. Pause again before continuing the sentence.

For longer words, think in chunks. A word like "Amsterdam" can be practiced as small visual groups instead of nine disconnected letters.`,
        `# Page 4: Receptive Practice

Understanding fingerspelling is not only about recognizing individual letters. Fluent signers often read the **whole word shape**.

## Practice routine

- Watch the full spelling once without stopping.
- Guess the word from the overall shape.
- Watch again and check the first and last letters.
- Write down the word and compare it with the source.

This builds pattern recognition. Over time, common names and terms become easier to recognize at natural speed.`,
        `# Page 5: Classroom Use

In class, fingerspelling helps introduce terms before they appear in notes, slides, or captions.

## Example flow

The instructor says a new term. The interpreter fingerspells it once, points to the written term on the slide, and then uses the chosen sign or abbreviation for the rest of the lesson.

This flow supports:

- Deaf students following the lecture.
- Interpreters handling technical vocabulary.
- Hearing classmates seeing the written term.
- Note-takers recording the same word consistently.`,
        `# Page 6: Repair Strategies

Misreading fingerspelling is normal. Good communication includes a repair strategy.

## If someone misses the word

1. Repeat the spelling once at a slower pace.
2. Write the word in chat, on a slide, or on paper.
3. Use the word in a short sentence for context.
4. Confirm understanding before moving on.

Combining fingerspelling with text keeps communication clear and reduces frustration for everyone in the conversation.`,
      ],
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
      content: [
        `# What Good Captions Include

Captions should give learners access to spoken words and important sound information. A useful caption is **accurate**, synchronized with the speaker, and easy to read without covering important visuals.

## Quality checklist

- Match the spoken words as closely as possible.
- Keep timing aligned with the speaker.
- Identify speakers during group discussion when possible.
- Include meaningful sounds such as alarm ringing, applause, or door closing.
- Avoid blocking diagrams, equations, faces, or sign language interpretation.

Automatic captions are useful for drafts, but they should be reviewed before becoming a learning resource. One wrong word in a science or math lesson can change the meaning of the entire explanation.`,
      ],
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
      content: [
        `# Transcripts for Review and Search

A transcript is a text version of spoken or audio information. For deaf students, transcripts make podcasts, interviews, and recorded lectures accessible when captions are missing or when the learner wants to study at their own pace.

## A useful transcript includes

- Speaker names.
- Important sound cues.
- Clear paragraph breaks.
- Searchable terms and names.
- Enough structure to scan quickly.

Transcripts should not replace captions for video, because captions show timing while the video plays. The best learning experience uses both: captions for watching and transcripts for review, quoting, translation, and AI-assisted study.`,
      ],
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
      content: [
        `# Page 1: Confirm Access Before Class

Before class, confirm that the meeting link, captions, interpreter access, and shared slides are ready. Check early enough that the instructor or support office can fix problems.

## Before-class checklist

- Meeting link works.
- Captions are enabled or scheduled.
- Interpreter has the correct class link.
- Slides or notes are shared in advance.
- The student knows where to ask for help if access fails.

Small checks before class prevent large barriers during class.`,
        `# Page 2: Share Vocabulary Early

Technical vocabulary is one of the biggest access challenges in online classes. Ask the instructor to share vocabulary lists early when the course uses specialized terms.

## What to request

- Key terms for the week.
- Names, formulas, acronyms, and readings.
- Slide decks or lab instructions.
- Pronunciation notes if names or terms are unusual.

This helps interpreters, captioners, and students prepare before the live session begins.`,
        `# Page 3: Arrange the Screen

During class, pin the interpreter or caption window. Keep chat open for clarification and make sure the main lesson content remains visible.

## Useful layout

- Main lecture or slides in the largest area.
- Interpreter video pinned where eye movement is comfortable.
- Captions placed where they do not cover diagrams.
- Chat panel open for quick clarification.

The best layout is the one the student can follow for a full class without visual fatigue.`,
        `# Page 4: Manage Turn-Taking

Overlapping speech makes captions, interpreting, and note-taking much harder to follow. Remind speakers to use one microphone at a time.

## Class norms

1. Raise a hand or use chat before speaking.
2. Say your name before commenting in a large group.
3. Pause after questions.
4. Repeat important instructions in text.

These norms help deaf students and also make the session clearer for everyone.`,
        `# Page 5: Breakout Room Access

If breakout rooms are used, confirm that captions or interpreting support follows the student into the room. Access should continue in small-group work.

## Questions to ask

- Will captions work inside breakout rooms?
- Can the interpreter join the same room?
- Is there a written task prompt?
- Who should be contacted if access fails?

Breakout rooms are still class activities, so they need the same access planning as the main room.`,
        `# Page 6: Review After Class

After class, review the recording, transcript, and notes while the material is still fresh. Mark unclear sections for follow-up.

## Review workflow

- Rewatch confusing parts with captions.
- Compare transcript and notes.
- Highlight vocabulary that needs clarification.
- Send follow-up questions within 24 hours.

Review is most effective when it happens before the next class introduces new material.`,
        `# Page 7: Document Access Failures

If access fails, document what happened with the date, class, and specific barrier. A clear record makes it easier to request a fix.

## Record these details

- Course and session date.
- What tool failed.
- How long the barrier lasted.
- What learning activity was affected.
- Screenshots or messages if available.

Keep the tone factual. The goal is to make the next class accessible.`,
        `# Page 8: Send a Specific Request

Contact the disability services office or instructor with a specific request instead of a general complaint. Name the tool or process that needs to change.

## Example message structure

1. State what happened.
2. Explain the learning impact.
3. Request the specific fix.
4. Ask for confirmation before the next session.

Specific requests are easier to act on than broad statements like "access was bad."`,
        `# Page 9: Equal Access

The goal is not special treatment; it is equal access to the same learning activity. Good access planning lets students focus on learning.

## Final reminder

- Access should be prepared before class.
- Communication should remain visual and structured.
- Problems should be documented quickly.
- Students should not have to choose between participation and accessibility.

Online learning works best when access is part of the class design, not an emergency fix.`,
      ],
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
      content: [
        `# Requesting Accommodations Early

Accommodation planning works best before the semester begins. Start by reviewing each course format: lecture, lab, discussion, practicum, exam, or online module.

## Match the access need to the activity

- A lecture may need real-time captions or an interpreter.
- A lab may need visual safety instructions.
- A group project may need communication norms and accessible meeting tools.
- An exam may need written instructions, captioned media, or a separate room.

Students should contact the disability services office early, share course schedules, and explain past accommodations that worked. After services are approved, confirm logistics with instructors in a short, professional message.`,
      ],
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
      content: [
        `# Effective Communication in Services

Effective communication means the deaf or hard-of-hearing person can receive information, ask questions, and respond with the same clarity as everyone else.

## Choosing the right support

In simple situations, writing notes or pointing to visual information may be enough. In complex situations such as medical appointments, legal discussions, job onboarding, or emergency instructions, a qualified interpreter, real-time captions, or another appropriate aid may be needed.

## Respectful process

- Ask what communication method works.
- Do not assume every deaf person signs.
- Do not rely on family members for complex interpreting.
- Confirm understanding before moving on.
- Give enough time for questions.

The best choice depends on length, complexity, context, and the person's usual communication method.`,
      ],
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
      content: [
        `# Assistive Devices in Daily Life

Assistive devices support different communication needs. Some tools amplify or send sound more directly to a hearing aid or cochlear implant. Other tools turn sound into visual or tactile information.

## Examples

- Flashing alerts for doorbells or alarms.
- Vibrating alarms for wake-up or emergency signals.
- Captions for meetings, videos, and phone calls.
- Relay services for phone communication.
- Assistive listening systems in classrooms or public rooms.

No single device works for every situation. The practical skill is matching the tool to the environment and the person's communication preference.`,
      ],
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
      content: [
        `# Page 1: Identify the Interview Format

Before the interview, decide what access you need. The right support depends on whether the interview is a phone screen, video call, technical task, portfolio review, or on-site meeting.

## Access options

- Interpreter.
- Live captions.
- Video relay.
- Written questions.
- Extra time for a technical task.

Write down the format first, then match the access request to that format.`,
        `# Page 2: Message the Recruiter

Send a concise message to the recruiter. Thank them, confirm the interview format, and request the access method that lets you participate fully.

## Message template

Hello, thank you for scheduling the interview. To participate fully, I will need **live captions** for the video call. Please confirm that captions will be enabled before the interview begins.

Keep the request specific, professional, and easy to confirm.`,
        `# Page 3: Test the Video Setup

For video interviews, test camera framing, lighting, caption settings, and interpreter placement before the interview time.

## Setup checklist

- Face is visible and well lit.
- Background is not distracting.
- Captions are turned on and readable.
- Interpreter window can stay visible.
- Internet connection is stable.

Do a short test call if possible. Five minutes of setup can prevent a bad interview experience.`,
        `# Page 4: Manage Turn-Taking

During the interview, ask for one speaker at a time. This keeps questions readable for captions, interpreters, and visual attention.

## Useful phrases

- Could we have one speaker at a time?
- Could you repeat the last question?
- I want to make sure I received the full question before answering.
- Could you put the technical prompt in chat?

These requests are professional communication, not interruptions.`,
        `# Page 5: Repair Missed Questions

Request repetition when a question is missed. A short clarification request is better than answering a question you did not fully receive.

## Repair strategy

1. Pause before answering.
2. Name the issue briefly.
3. Ask for the missing information.
4. Confirm the question in your own words.

This protects the quality of your answer and shows careful communication.`,
        `# Page 6: Prepare Evidence

Prepare examples that show problem solving, teamwork, and communication strategy. These examples help interviewers evaluate your actual skills.

## Strong examples include

- A project where you solved a technical problem.
- A time you clarified a confusing requirement.
- A team situation where written communication improved the result.
- A moment when access planning prevented delay.

Use short, concrete stories with a result.`,
        `# Page 7: Follow Up

After the interview, send a follow-up note summarizing interest in the role and any next-step access needs.

## Follow-up structure

- Thank the interviewer.
- Mention one specific topic from the conversation.
- Restate your interest.
- Ask about next steps.
- Request access for the next step if needed.

This keeps the process organized and professional.`,
        `# Page 8: Keep the Goal Clear

The goal is to reduce friction so your skills are evaluated fairly. Access planning supports a professional, focused interview.

## Final checklist

- Know the interview format.
- Ask for the needed access early.
- Test tools before the call.
- Use repair phrases when needed.
- Follow up with next-step access needs.

Good preparation lets the interview focus on your qualifications.`,
      ],
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
      content: [
        `# Certification Exam Accommodation Planner

Certification exams often affect graduation, licensing, or employment, so access planning should begin early.

## Planning steps

1. Identify the testing organization.
2. Check the registration deadline.
3. Review documentation rules.
4. List the exam format and access barriers.
5. Match each barrier with a specific accommodation.
6. Keep copies of approval letters.

Possible accommodations include captions, interpreter support for instructions, assistive listening technology, written directions, or a separate room. Good planning helps the exam measure knowledge and skill instead of measuring access barriers.`,
      ],
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
      content: [
        `# Page 1: Set Communication Norms

At the start of a team project, agree on communication norms before work becomes urgent. Clear expectations reduce confusion later.

## Norms to agree on

- Where decisions are recorded.
- How meetings are captioned or interpreted.
- How people request clarification.
- What happens when someone misses a message.

Inclusive teamwork starts with shared rules, not last-minute fixes.`,
        `# Page 2: Use Written Channels

Use shared written channels for decisions, deadlines, links, and action items. Written records help everyone track what changed.

## Good written channels include

- Project boards.
- Shared documents.
- Team chat.
- Meeting notes.
- Issue trackers.

The goal is to make important information searchable and visible after the meeting ends.`,
        `# Page 3: Run Accessible Meetings

In meetings, use captions when available, avoid talking over each other, and pause after questions so interpreters or captions can catch up.

## Meeting habits

1. Share the agenda before the meeting.
2. Use one speaker at a time.
3. Put decisions in chat.
4. Leave time after questions.
5. Confirm action items before closing.

These habits improve clarity for the whole team.`,
        `# Page 4: Capture Decisions

Assign one person to write decisions in the chat or project board. This creates a reliable source of truth after discussion.

## Decision note format

- Decision: what was chosen.
- Owner: who will act.
- Due date: when it should happen.
- Context: why the choice was made.

A short decision note prevents repeated discussion and missed responsibilities.`,
        `# Page 5: Demo Access

For demos, make sure the presenter is visible, slides have readable text, and any spoken explanation also appears in notes or captions.

## Demo checklist

- Presenter camera is framed clearly.
- Captions are enabled.
- Slides use readable font sizes.
- Code or diagrams are not hidden by captions.
- Questions are repeated or written before answers.

Accessible demos help the team show the work clearly and confidently.`,
      ],
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
      content: [
        `# Page 1: Design Access Early

An accessible presentation starts before the speaker walks on stage. Access is strongest when it is designed into the session early.

## Plan before presenting

- Confirm whether captions or interpreters are needed.
- Share materials before the event.
- Leave visual space for captions.
- Test media and microphones.

Accessibility works best as part of the presentation plan, not as a rushed add-on.`,
        `# Page 2: Share Materials

Send slides, speaker notes, names, acronyms, and technical terms to interpreters or captioners ahead of time.

## Helpful materials

- Slide deck.
- Speaker notes.
- Names and titles.
- Acronyms and technical terms.
- Links to videos or demos.

Preparation improves accuracy, especially when the presentation includes specialized vocabulary.`,
        `# Page 3: Speaker Pacing

During the talk, face the audience, speak at a steady pace, and avoid reading dense slides word for word.

## Pacing tips

1. Pause after each major point.
2. Do not speak while turning away.
3. Explain diagrams before moving on.
4. Avoid rushing through examples.

Steady pacing gives captions and interpreters enough time to carry the message clearly.`,
        `# Page 4: Interpreter Visibility

Keep the interpreter visible and well lit. The audience should not have to choose between seeing the speaker and seeing access support.

## Placement checklist

- Interpreter is near the speaker or screen.
- Lighting is strong enough to see facial expression.
- The interpreter is not blocked by furniture or people.
- The audience can see slides and interpreting at the same time.

Visibility is part of the content, not a decoration.`,
        `# Page 5: Caption Placement

Do not place captions over important diagrams or code. Leave space in the slide layout for captions and visual content.

## Slide design tips

- Keep the lower portion of slides clean when captions appear there.
- Use large text and high contrast.
- Avoid crowded diagrams.
- Explain visuals verbally and in notes.

Readable slides reduce the amount of information learners must reconstruct later.`,
        `# Page 6: Accessible Q&A

For Q&A, repeat or display the question before answering so everyone has the same context.

## Q&A flow

1. Audience member asks a question.
2. Speaker repeats or writes the question.
3. Captioner or interpreter has time to capture it.
4. Speaker answers at a steady pace.

This prevents deaf audience members from receiving only the answer without the question.`,
        `# Page 7: Captioned Media

If a video is shown, use captions and provide a transcript. Media should follow the same access standard as the live talk.

## Media checklist

- Captions are accurate.
- Audio-only content has a transcript.
- Video player controls are visible.
- Important visual information is described.
- The presenter checks that captions work before the session.

Accessible media keeps the presentation consistent from start to finish.`,
      ],
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
      content: [
        `# Page 1: Purpose of the Card

An emergency information card helps a deaf student communicate quickly when stress, noise, or low visibility makes conversation difficult.

## When it helps

- Fire drills.
- Health incidents.
- Lost access during an event.
- Urgent help requests.
- Situations where writing or signing is difficult.

The card gives staff and responders a fast path to effective communication.`,
        `# Page 2: What to Include

The card should include the student's name, preferred communication method, emergency contacts, interpreter or captioning needs, and medical notes if relevant.

## Core fields

- Name.
- Preferred communication method.
- Emergency contact.
- Interpreter or captioning need.
- Medical notes if relevant.
- School or campus contact.

Keep the layout simple so the most important details are visible first.`,
        `# Page 3: Useful Phrases

Use simple phrases that can be pointed to quickly. Large readable text and icons make the card easier to use under stress.

## Example phrases

- I am deaf.
- Please write.
- I need an interpreter.
- I use captions.
- Where is the exit?
- Please face me when speaking.

Short phrases work better than long explanations during urgent situations.`,
        `# Page 4: Storage and Practice

Store the card on a phone and as a printed copy in a backpack or wallet. Practice using it during drills, not only real emergencies.

## Practice checklist

1. Show the card to a trusted staff member.
2. Confirm the information is easy to read.
3. Update contacts when they change.
4. Practice finding the card quickly.

The card is not a replacement for trained staff, but it improves the first moments of communication.`,
      ],
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

  await seedSignQuiz();

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

// Acak urutan (Fisher–Yates).
function shuffleWords<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Quiz "Guess the Sign": avatar memperagakan `term`, user memilih artinya.
 * Idempoten (by title) — aman dijalankan di database yang sudah berisi data.
 */
async function seedSignQuiz() {
  const existing = await db.query.quizzes.findFirst({
    where: eq(quizzes.title, "Guess the Sign"),
  });
  if (existing) return;

  const SIGN_WORDS = [
    "Hello", "Thank You", "Yes", "No", "Please", "Sorry",
    "Good", "Love", "Friend", "Family", "Help", "Eat",
  ];
  const [signQuiz] = await db
    .insert(quizzes)
    .values({
      title: "Guess the Sign",
      description: "Watch the avatar sign a word, then pick what it means.",
      category: "Sign Language",
      level: "BEGINNER",
      likesCount: 320,
      rewardCoins: 60,
      thumbnailUrl: "/quizzes-thumb/quiz-sign-language.jpg",
    })
    .returning();

  await db.insert(quizQuestions).values(
    shuffleWords(SIGN_WORDS)
      .slice(0, 8)
      .map((term, i) => {
        const options = shuffleWords([
          term,
          ...shuffleWords(SIGN_WORDS.filter((w) => w !== term)).slice(0, 3),
        ]);
        return {
          quizId: signQuiz!.id,
          ordering: i + 1,
          type: "sign",
          question: "What does the avatar sign?",
          term,
          options,
          correctIndex: options.indexOf(term),
        };
      }),
  );
  console.log('Quiz "Guess the Sign" ditambahkan');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
