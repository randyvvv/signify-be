/**
 * Hand-written OpenAPI 3.0 document describing the signify-api endpoints.
 * Served as JSON at /openapi.json and rendered by Swagger UI at /docs.
 *
 * Keep this in sync with the route handlers in src/routes/*.
 */
export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "signify-api",
    version: "0.1.0",
    description:
      "Backend for Signify, a sign language learning platform. Hono + Drizzle + Supabase, custom JWT auth.",
  },
  servers: [{ url: "/", description: "Current host" }],
  tags: [
    { name: "Auth" },
    { name: "Profile" },
    { name: "Dashboard" },
    { name: "Materials" },
    { name: "Quizzes" },
    { name: "Shop" },
    { name: "Sign Practice" },
    { name: "Leaderboard" },
    { name: "Sign Dictionary" },
    { name: "Vocabulary" },
    { name: "AI" },
    { name: "Signify Coach" },
    { name: "News" },
    {
      name: "Live Class",
      description:
        "Teacher speaks, students get live captions and a signing avatar. Broadcasting runs over the WebSocket /api/live/ws (see README).",
    },
    { name: "System" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT obtained from /api/auth/login or /api/auth/register.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
      },
      AuthResponse: {
        type: "object",
        properties: {
          token: { type: "string" },
          user: { $ref: "#/components/schemas/User" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          fullName: { type: "string", nullable: true },
          gender: { type: "string", enum: ["male", "female"], nullable: true },
          bio: { type: "string", nullable: true },
          avatarUrl: { type: "string", nullable: true },
          hasPassword: {
            type: "boolean",
            description: "false = Google-only account (can set a first password via /api/me/password)",
          },
          googleLinked: { type: "boolean", description: "Account is linked to a Google account" },
          role: {
            type: "string",
            enum: ["learner", "teacher"],
            description: "teacher can create Live Classes",
          },
          coins: { type: "integer" },
          streakCount: { type: "integer" },
          lastActiveDate: { type: "string", format: "date", nullable: true },
          totalLearningSeconds: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      LiveClass: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          code: { type: "string", example: "K7P2QX", description: "6-character join code" },
          title: { type: "string" },
          spokenLanguage: { type: "string", enum: ["en", "id"] },
          signedLanguage: { type: "string", enum: ["ase", "ins"] },
          status: { type: "string", enum: ["waiting", "live", "ended"] },
          teacherId: { type: "string", format: "uuid" },
          teacherName: { type: "string", nullable: true },
          startedAt: { type: "string", format: "date-time", nullable: true },
          endedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      LiveSegment: {
        type: "object",
        properties: {
          seq: { type: "integer" },
          text: { type: "string" },
          offsetMs: { type: "integer", description: "Milliseconds since the class started" },
        },
      },
      MeResponse: {
        allOf: [
          { $ref: "#/components/schemas/User" },
          {
            type: "object",
            properties: {
              rank: { type: "integer" },
              totalLearningHours: { type: "number" },
            },
          },
        ],
      },
      Preferences: {
        type: "object",
        properties: {
          userId: { type: "string", format: "uuid" },
          goals: {
            type: "array",
            items: { type: "string" },
            description: "Up to 3 onboarding goals",
          },
          masterFocus: { type: "string", nullable: true },
          frequency: {
            type: "string",
            enum: ["casual", "regular", "intensive"],
            nullable: true,
          },
          onboardingCompleted: { type: "boolean" },
          notifications: { type: "boolean" },
          soundEffects: { type: "boolean" },
          autoplay: { type: "boolean" },
          language: { type: "string" },
          signLanguage: {
            type: "string",
            enum: ["ase", "ins"],
            description: "Sign language for the avatar (ase = ASL, ins = BISINDO)",
          },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Material: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          thumbnailUrl: { type: "string", nullable: true },
          type: { type: "string", enum: ["video", "document", "article"] },
          category: {
            type: "string",
            enum: ["K-12", "Vocational", "University", "Career", "Sign Language"],
          },
          language: { type: "string", example: "en" },
          durationMinutes: { type: "integer", nullable: true },
          pages: { type: "integer", nullable: true },
          content: { type: "array", items: { type: "string" }, nullable: true },
          articleUrl: { type: "string", nullable: true },
          videoUrl: { type: "string", nullable: true },
          transcript: { type: "array", items: { type: "string" }, nullable: true },
          progress: { type: "integer", description: "0-100 for the current user" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      MaterialProgress: {
        type: "object",
        properties: {
          userId: { type: "string", format: "uuid" },
          materialId: { type: "string", format: "uuid" },
          progress: { type: "integer" },
          completed: { type: "boolean" },
          lastAccessedAt: { type: "string", format: "date-time" },
        },
      },
      Quiz: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          thumbnailUrl: { type: "string", nullable: true },
          category: { type: "string" },
          level: {
            type: "string",
            enum: ["BEGINNER", "INTERMEDIATE", "EXPERT"],
          },
          likesCount: { type: "integer" },
          rewardCoins: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      QuizQuestion: {
        type: "object",
        description: "Answer key (correctIndex) is omitted from responses.",
        properties: {
          id: { type: "string", format: "uuid" },
          quizId: { type: "string", format: "uuid" },
          ordering: { type: "integer" },
          type: {
            type: "string",
            enum: ["text", "image", "sign"],
            description: "'sign': the avatar performs `term`, options are text labels",
          },
          question: { type: "string" },
          promptImageUrl: {
            type: "string",
            nullable: true,
            description: "For type 'text': image of the sign",
          },
          term: {
            type: "string",
            nullable: true,
            description: "For type 'image': the term being asked",
          },
          options: {
            type: "array",
            items: { type: "string" },
            description: "Text labels or image URLs",
          },
        },
      },
      QuizDetail: {
        allOf: [
          { $ref: "#/components/schemas/Quiz" },
          {
            type: "object",
            properties: {
              totalQuestions: { type: "integer" },
              questions: {
                type: "array",
                items: { $ref: "#/components/schemas/QuizQuestion" },
              },
            },
          },
        ],
      },
      QuizAttempt: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          quizId: { type: "string", format: "uuid" },
          correctCount: { type: "integer" },
          totalCount: { type: "integer" },
          accuracy: { type: "integer", description: "percent" },
          pointsEarned: { type: "integer" },
          timeTakenSeconds: { type: "integer" },
          completedAt: { type: "string", format: "date-time" },
        },
      },
      QuizAttemptResult: {
        allOf: [
          { $ref: "#/components/schemas/QuizAttempt" },
          {
            type: "object",
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    questionId: { type: "string", format: "uuid" },
                    question: { type: "string" },
                    type: { type: "string", enum: ["text", "image"] },
                    term: { type: "string", nullable: true },
                    selectedIndex: { type: "integer" },
                    correctIndex: { type: "integer" },
                    isCorrect: { type: "boolean" },
                  },
                },
              },
            },
          },
        ],
      },
      ShopItem: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          price: { type: "integer" },
          category: {
            type: "string",
            enum: ["Hair", "Eye Color", "Accessories", "Background"],
          },
          imageUrl: { type: "string", nullable: true },
          color: { type: "string", nullable: true },
          isDefault: { type: "boolean" },
          isOwned: { type: "boolean" },
          equipped: { type: "boolean" },
        },
      },
      SignPracticeSession: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          category: { type: "string" },
          goalWord: { type: "string", nullable: true },
          completedCount: { type: "integer" },
          totalCount: { type: "integer" },
          accuracy: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Activity: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          type: { type: "string", enum: ["material", "quiz", "practice"] },
          referenceId: { type: "string", format: "uuid", nullable: true },
          title: { type: "string" },
          durationSeconds: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      SignDictionaryEntry: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          word: { type: "string" },
          signedLanguage: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      VocabularyItem: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          word: { type: "string" },
          signedLanguage: { type: "string" },
          source: { type: "string", enum: ["practice", "quiz", "translator", "manual"] },
          repetitions: { type: "integer" },
          intervalDays: { type: "integer" },
          ease: { type: "integer", description: "Ease factor x100" },
          lapses: { type: "integer" },
          dueDate: { type: "string", format: "date" },
          lastReviewedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      TranslatorSession: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          sourceUrl: { type: "string", format: "uri" },
          status: {
            type: "string",
            enum: ["pending", "processing", "done", "error"],
          },
          transcript: {
            type: "array",
            items: { type: "string" },
            nullable: true,
          },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      LeaderboardEntry: {
        type: "object",
        properties: {
          rank: { type: "integer" },
          id: { type: "string", format: "uuid" },
          fullName: { type: "string", nullable: true },
          avatarUrl: { type: "string", nullable: true },
          coins: { type: "integer" },
          streakCount: { type: "integer" },
        },
      },
      NewsFact: {
        type: "object",
        required: ["label", "value"],
        properties: {
          label: { type: "string", example: "Venue" },
          value: { type: "string", example: "Vrije Universiteit Amsterdam, the Netherlands" },
          href: { type: "string", format: "uri" },
        },
      },
      NewsSummary: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          slug: { type: "string" },
          title: { type: "string" },
          excerpt: { type: "string" },
          coverImageUrl: {
            type: "string",
            nullable: true,
            description: "Absolute URL or a path to a frontend asset (e.g. /news/<slug>/cover.jpg)",
          },
          category: { type: "string" },
          authorName: { type: "string" },
          publishedAt: { type: "string", format: "date-time" },
          readingMinutes: { type: "integer" },
        },
      },
      NewsDetail: {
        allOf: [
          { $ref: "#/components/schemas/NewsSummary" },
          {
            type: "object",
            properties: {
              content: { type: "string", description: "Markdown" },
              facts: { type: "array", items: { $ref: "#/components/schemas/NewsFact" } },
              published: { type: "boolean" },
              updatedAt: { type: "string", format: "date-time" },
            },
          },
        ],
      },
      NewsInput: {
        type: "object",
        required: ["title", "excerpt", "content"],
        properties: {
          title: { type: "string" },
          slug: { type: "string", description: "Defaults to a slug of the title" },
          excerpt: { type: "string" },
          content: { type: "string", description: "Markdown" },
          coverImageUrl: { type: "string", nullable: true },
          category: { type: "string", default: "News" },
          authorName: { type: "string", default: "Signify Team" },
          facts: { type: "array", items: { $ref: "#/components/schemas/NewsFact" } },
          published: { type: "boolean", default: true },
          publishedAt: { type: "string", format: "date-time" },
        },
      },
    },
    responses: {
      BadRequest: {
        description: "Invalid request",
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/Error" } },
        },
      },
      Unauthorized: {
        description: "Missing or invalid token",
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/Error" } },
        },
      },
      NotFound: {
        description: "Resource not found",
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/Error" } },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        security: [],
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 6 },
                  fullName: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthResponse" },
              },
            },
          },
          "409": {
            description: "Email already registered (code email_taken), or registered via Google (code google_account)",
          },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthResponse" },
              },
            },
          },
          "401": {
            description: "Wrong email or password (code invalid_credentials), or a Google-only account (code google_account)",
          },
        },
      },
    },
    "/api/auth/google": {
      post: {
        tags: ["Auth"],
        summary: "Sign in with Google",
        description:
          "Exchanges a Google Identity Services ID token for a Signify JWT. Finds the user by Google account, links an existing account with the same (verified) email, or creates a new user. Requires GOOGLE_CLIENT_ID.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["credential"],
                properties: {
                  credential: { type: "string", description: "ID token from Google Identity Services" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Existing user signed in",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/AuthResponse" },
                    { type: "object", properties: { isNewUser: { type: "boolean" } } },
                  ],
                },
              },
            },
          },
          "201": { description: "New user created (isNewUser = true)" },
          "401": {
            description: "Invalid or expired Google token (code invalid_google_token)",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
          "409": { description: "Email is linked to a different Google account (code google_account_mismatch)" },
          "503": { description: "Google sign-in is not configured (code google_disabled)" },
        },
      },
    },
    "/api/auth/session": {
      get: {
        tags: ["Auth"],
        summary: "Verify token",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    userId: { type: "string", format: "uuid" },
                    email: { type: "string" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/me": {
      get: {
        tags: ["Profile"],
        summary: "Get own profile + stats",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MeResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      patch: {
        tags: ["Profile"],
        summary: "Update profile",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  fullName: { type: "string" },
                  gender: { type: "string", enum: ["male", "female"] },
                  bio: { type: "string" },
                  avatarUrl: { type: "string", format: "uri" },
                  role: {
                    type: "string",
                    enum: ["learner", "teacher"],
                    description: "Teacher Mode (create Live Classes)",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/me/preferences": {
      get: {
        tags: ["Profile"],
        summary: "Get onboarding + settings",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Preferences" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      put: {
        tags: ["Profile"],
        summary: "Save onboarding + settings",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  goals: { type: "array", items: { type: "string" }, maxItems: 3 },
                  masterFocus: { type: "string" },
                  frequency: {
                    type: "string",
                    enum: ["casual", "regular", "intensive"],
                  },
                  onboardingCompleted: { type: "boolean" },
                  notifications: { type: "boolean" },
                  soundEffects: { type: "boolean" },
                  autoplay: { type: "boolean" },
                  language: { type: "string" },
                  signLanguage: { type: "string", enum: ["ase", "ins"] },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Preferences" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/me/password": {
      post: {
        tags: ["Profile"],
        summary: "Change password",
        description:
          "Google-only accounts (hasPassword = false) can set a first password without currentPassword.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["newPassword"],
                properties: {
                  currentPassword: {
                    type: "string",
                    description: "Required when the account already has a password",
                  },
                  newPassword: { type: "string", minLength: 6 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { ok: { type: "boolean" } },
                },
              },
            },
          },
          "400": { description: "New password must differ" },
          "401": {
            description: "Wrong current password / unauthorized",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/api/me/items": {
      get: {
        tags: ["Profile"],
        summary: "Items the user owns (incl. defaults) + equipped map",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ShopItem" },
                    },
                    equipped: {
                      type: "object",
                      additionalProperties: { type: "string", format: "uuid" },
                      description: "category -> equipped itemId",
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/dashboard": {
      get: {
        tags: ["Dashboard"],
        summary: "Aggregated dashboard data",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    user: { type: "object" },
                    stats: {
                      type: "object",
                      properties: {
                        streak: { type: "integer" },
                        rank: { type: "integer" },
                        totalLearningHours: { type: "number" },
                        dailyGoal: {
                          type: "object",
                          properties: {
                            target: { type: "integer" },
                            current: { type: "integer" },
                            percent: { type: "integer" },
                          },
                        },
                      },
                    },
                    recommended: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Material" },
                    },
                    recentActivity: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Activity" },
                    },
                    dailyQuiz: {
                      $ref: "#/components/schemas/Quiz",
                      nullable: true,
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/materials/mine": {
      get: {
        tags: ["Materials"],
        summary: "Materials created by the signed-in teacher (newest first)",
        responses: {
          "200": { description: "OK" },
          "403": { description: "Not a teacher account (code teacher_only)" },
        },
      },
    },
    "/api/materials": {
      get: {
        tags: ["Materials"],
        summary: "List materials",
        parameters: [
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "language", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 12 } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Material" },
                    },
                    page: { type: "integer" },
                    limit: { type: "integer" },
                    total: { type: "integer" },
                    totalPages: { type: "integer" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Materials"],
        summary: "Create a material (teacher only)",
        description:
          "Video: a YouTube link; the embed URL, thumbnail, transcript (when captions exist) and duration are filled in automatically. Article: Markdown content. The material is listed in Learning Materials for everyone.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  {
                    type: "object",
                    required: ["type", "title", "category", "videoUrl"],
                    properties: {
                      type: { type: "string", enum: ["video"] },
                      title: { type: "string", maxLength: 160 },
                      description: { type: "string", maxLength: 500 },
                      category: { type: "string", enum: ["K-12", "Vocational", "University", "Career", "Sign Language"] },
                      language: { type: "string", enum: ["en", "id"], default: "en" },
                      videoUrl: { type: "string", description: "YouTube link (watch, youtu.be or embed)" },
                    },
                  },
                  {
                    type: "object",
                    required: ["type", "title", "category", "content"],
                    properties: {
                      type: { type: "string", enum: ["article"] },
                      title: { type: "string", maxLength: 160 },
                      description: { type: "string", maxLength: 500 },
                      category: { type: "string", enum: ["K-12", "Vocational", "University", "Career", "Sign Language"] },
                      language: { type: "string", enum: ["en", "id"], default: "en" },
                      content: { type: "string", description: "Markdown, 20-50,000 characters" },
                      articleUrl: { type: "string", format: "uri" },
                    },
                  },
                ],
              },
            },
          },
        },
        responses: {
          "201": { description: "Created" },
          "400": { description: "Invalid YouTube link (code invalid_youtube_url)" },
          "403": { description: "Not a teacher account (code teacher_only)" },
        },
      },
    },
    "/api/materials/categories": {
      get: {
        tags: ["Materials"],
        summary: "Distinct material categories with counts",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      count: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/materials/languages": {
      get: {
        tags: ["Materials"],
        summary: "Distinct material languages with counts",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      count: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/materials/{id}": {
      get: {
        tags: ["Materials"],
        summary: "Material detail + user progress",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Material" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      delete: {
        tags: ["Materials"],
        summary: "Delete a material (its creator only)",
        description: "Also deletes the quiz generated together with it from a Live Class.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Deleted" },
          "403": { description: "Not the creator" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/materials/{id}/recommended": {
      get: {
        tags: ["Materials"],
        summary: "Recommended materials in the same category",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Material" },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/materials/{id}/progress": {
      put: {
        tags: ["Materials"],
        summary: "Update material progress",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["progress"],
                properties: {
                  progress: { type: "integer", minimum: 0, maximum: 100 },
                  durationSeconds: { type: "integer", minimum: 0 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MaterialProgress" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/quizzes": {
      get: {
        tags: ["Quizzes"],
        summary: "List quizzes",
        parameters: [
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "category", in: "query", schema: { type: "string" } },
          {
            name: "level",
            in: "query",
            schema: {
              type: "string",
              enum: ["BEGINNER", "INTERMEDIATE", "EXPERT"],
            },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Quiz" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/quizzes/popular": {
      get: {
        tags: ["Quizzes"],
        summary: "Top 3 quizzes by likes",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Quiz" },
                },
              },
            },
          },
        },
      },
    },
    "/api/quizzes/{id}": {
      get: {
        tags: ["Quizzes"],
        summary: "Quiz detail with questions",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/QuizDetail" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/quizzes/{id}/attempts": {
      post: {
        tags: ["Quizzes"],
        summary: "Submit quiz answers",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["answers"],
                properties: {
                  answers: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["questionId", "selectedIndex"],
                      properties: {
                        questionId: { type: "string", format: "uuid" },
                        selectedIndex: { type: "integer", minimum: 0 },
                      },
                    },
                  },
                  timeTakenSeconds: { type: "integer", minimum: 0, default: 0 },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/QuizAttemptResult" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      get: {
        tags: ["Quizzes"],
        summary: "User's attempt history for a quiz",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/QuizAttempt" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/quizzes/{id}/like": {
      post: {
        tags: ["Quizzes"],
        summary: "Like a quiz",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { liked: { type: "boolean" } },
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Quizzes"],
        summary: "Unlike a quiz",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { liked: { type: "boolean" } },
                },
              },
            },
          },
        },
      },
    },
    "/api/shop/items": {
      get: {
        tags: ["Shop"],
        summary: "List shop items with owned/equipped status",
        parameters: [
          { name: "category", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ShopItem" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/shop/items/{id}/purchase": {
      post: {
        tags: ["Shop"],
        summary: "Buy an item (deducts coins)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "201": {
            description: "Purchased",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    purchased: { type: "boolean" },
                    item: { $ref: "#/components/schemas/ShopItem" },
                    balance: { type: "integer" },
                  },
                },
              },
            },
          },
          "400": { description: "Not enough coins" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { description: "Item already owned" },
        },
      },
    },
    "/api/shop/avatar": {
      put: {
        tags: ["Shop"],
        summary: "Set equipped items per category",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["equipped"],
                properties: {
                  equipped: {
                    type: "object",
                    additionalProperties: {
                      type: "string",
                      format: "uuid",
                      nullable: true,
                    },
                    example: { Hair: "uuid-here", "Eye Color": null },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    equipped: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/sign-practice/categories": {
      get: {
        tags: ["Sign Practice"],
        summary: "List practice scenario categories",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    },
    "/api/sign-practice/sessions": {
      post: {
        tags: ["Sign Practice"],
        summary: "Save a practice session result",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["category"],
                description:
                  "When `attempts` is sent, completedCount/accuracy are derived from it; each attempt with score >= 60 passes and earns 5 coins, and the words are added to the user's vocabulary.",
                properties: {
                  category: { type: "string" },
                  goalWord: { type: "string" },
                  attempts: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["word", "score"],
                      properties: {
                        word: { type: "string" },
                        score: { type: "integer", minimum: 0, maximum: 100 },
                      },
                    },
                  },
                  completedCount: { type: "integer", minimum: 0 },
                  totalCount: { type: "integer", minimum: 0 },
                  accuracy: { type: "integer", minimum: 0, maximum: 100 },
                  durationSeconds: { type: "integer", minimum: 0, default: 0 },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SignPracticeSession" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/sign-practice": {
      get: {
        tags: ["Sign Practice"],
        summary: "Aggregated practice progress",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sessions: { type: "integer" },
                    avgAccuracy: { type: "integer" },
                    totalCompleted: { type: "integer" },
                    recent: {
                      type: "array",
                      items: { $ref: "#/components/schemas/SignPracticeSession" },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/chat": {
      get: {
        tags: ["AI"],
        summary: "Get saved Signify chat history for a material",
        parameters: [
          {
            name: "materialId",
            in: "query",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sessionId: { type: "string", format: "uuid", nullable: true },
                    messages: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", format: "uuid" },
                          role: { type: "string", enum: ["user", "assistant"] },
                          content: { type: "string" },
                          createdAt: { type: "string", format: "date-time" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["AI"],
        summary: "Signify material-grounded chatbot",
        description:
          "Returns 503 ai_unavailable when AI_ENABLED is false. When enabled, answers from the selected material context using Gemini.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["materialId", "message"],
                properties: {
                  materialId: { type: "string", format: "uuid" },
                  message: { type: "string", minLength: 1 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reply: { type: "string" },
                    model: { type: "string" },
                    sessionId: { type: "string", format: "uuid" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": {
            description: "AI not available yet",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/translator/sessions": {
      post: {
        tags: ["AI"],
        summary: "Register a livestream URL for translation (stub)",
        description:
          "Creates a session with status 'pending'. Transcript is filled by the AI worker when the model is ready.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["sourceUrl"],
                properties: { sourceUrl: { type: "string", format: "uri" } },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TranslatorSession" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      get: {
        tags: ["AI"],
        summary: "List the user's translator sessions",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/TranslatorSession" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/translator/sessions/{id}": {
      get: {
        tags: ["AI"],
        summary: "Translator session detail",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TranslatorSession" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/translator/pose": {
      post: {
        tags: ["AI"],
        summary: "Text -> sign language pose clips",
        description:
          "Looks up words/phrases in the local sign dictionary first, then falls back to the external provider set by POSE_PROVIDER (default sign.mt, cached) for languages listed in POSE_API_LANGUAGES. Segments the provider has no sign for are returned in `missing`. signedLanguage defaults to the user's preference.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["text"],
                properties: {
                  text: { type: "string", maxLength: 500 },
                  signedLanguage: { type: "string", enum: ["ase", "ins"] },
                  spokenLanguage: { type: "string", default: "en" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    signedLanguage: { type: "string" },
                    clips: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          text: { type: "string" },
                          source: { type: "string", enum: ["dictionary", "signmt", "signgpt"] },
                          pose: { type: "string", description: "Base64 .pose file" },
                        },
                      },
                    },
                    missing: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          "404": { description: "No sign available for this text (code no_sign_available)" },
          "503": { description: "External pose provider failed (code pose_provider_failed)" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/translator/recognize": {
      post: {
        tags: ["AI"],
        summary: "Sign -> text (signify-model)",
        description:
          "Forwards MediaPipe keypoints (frames x 59 x 3: 17 pose + 21 left hand + 21 right hand) to the signify-model inference server at SIGN_MODEL_URL, which must answer { text, confidence? }.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["frames"],
                properties: {
                  frames: {
                    type: "array",
                    minItems: 8,
                    maxItems: 900,
                    items: { type: "array", items: { type: "array", items: { type: "number" } } },
                  },
                  fps: { type: "number" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    confidence: { type: "number", nullable: true },
                  },
                },
              },
            },
          },
          "503": {
            description: "Model not configured (model_unavailable) or failed (model_request_failed)",
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/translator/sentence": {
      post: {
        tags: ["AI"],
        summary: "Sign glosses -> natural sentence (Gemini)",
        description:
          "Rewrites what the user signed (glosses in signing order, e.g. \"I WANT COFFEE TWO\") or typed as one natural first-person sentence in the chosen language, ready to be spoken.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["text"],
                properties: {
                  text: { type: "string", maxLength: 500 },
                  lang: { type: "string", enum: ["id", "en"], default: "en" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "object", properties: { text: { type: "string" } } },
              },
            },
          },
          "503": { description: "AI disabled (ai_unavailable) or Gemini failed (ai_request_failed)" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/translator/speak": {
      post: {
        tags: ["AI"],
        summary: "Text -> speech (Gemini TTS)",
        description:
          "Speaks the signer's sentence with a natural Gemini TTS voice (TTS_MODEL). Audio is cached in memory per text and voice. On 503 the frontend falls back to the browser's speechSynthesis.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["text"],
                properties: {
                  text: { type: "string", maxLength: 500 },
                  voice: { type: "string", enum: ["female", "male"], default: "female" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "WAV audio (16-bit mono PCM)",
            content: { "audio/wav": { schema: { type: "string", format: "binary" } } },
          },
          "503": { description: "AI disabled (ai_unavailable) or TTS failed (tts_failed)" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/roleplay/scenarios": {
      get: {
        tags: ["AI"],
        summary: "Role-play scenarios with Signa",
        description: "Everyday situations the learner can practice in sign language. Titles and descriptions come in en and id.",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", example: "cafe" },
                      icon: { type: "string", enum: ["coffee", "briefcase", "users", "stethoscope"] },
                      title: { type: "object", properties: { en: { type: "string" }, id: { type: "string" } } },
                      description: { type: "object", properties: { en: { type: "string" }, id: { type: "string" } } },
                      turns: { type: "integer", description: "Learner replies before Signa wraps up" },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/roleplay/turn": {
      post: {
        tags: ["AI"],
        summary: "Signa's next role-play turn",
        description:
          "Stateless: the client sends the conversation so far. An empty history returns the scenario's opening line. Signa answers in character and suggests replies, each with the 1-3 key signs (gloss) to perform; after the scenario's last learner turn it closes the conversation with a summary. Uses Gemini when available and the scenario's built-in script otherwise (source).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["scenarioId"],
                properties: {
                  scenarioId: { type: "string", example: "cafe" },
                  lang: { type: "string", enum: ["en", "id"], default: "en" },
                  history: {
                    type: "array",
                    maxItems: 20,
                    items: {
                      type: "object",
                      required: ["from", "text"],
                      properties: {
                        from: { type: "string", enum: ["signa", "learner"] },
                        text: { type: "string", maxLength: 300 },
                        score: { type: "integer", minimum: 0, maximum: 100, nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    line: { type: "string" },
                    replies: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { text: { type: "string" }, gloss: { type: "string", example: "COFFEE PLEASE" } },
                      },
                    },
                    done: { type: "boolean" },
                    summary: { type: "string", nullable: true },
                    source: { type: "string", enum: ["gemini", "script"] },
                  },
                },
              },
            },
          },
          "404": { description: "Unknown scenario (scenario_not_found)" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/signs/languages": {
      get: {
        tags: ["Sign Dictionary"],
        summary: "Available sign languages and whether the user can edit the dictionary",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    languages: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          code: { type: "string" },
                          name: { type: "string" },
                          external: { type: "boolean", description: "Words outside the dictionary are translated by the external provider" },
                        },
                      },
                    },
                    provider: { type: "string", example: "sign.mt", description: "Name of the active external pose provider" },
                    canEdit: { type: "boolean" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/signs": {
      get: {
        tags: ["Sign Dictionary"],
        summary: "List dictionary entries (without pose data)",
        parameters: [
          { name: "lang", in: "query", schema: { type: "string" } },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/SignDictionaryEntry" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Sign Dictionary"],
        summary: "Add or replace the pose for a word (admin, see ADMIN_EMAILS)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["word", "signedLanguage", "pose"],
                properties: {
                  word: { type: "string" },
                  signedLanguage: { type: "string", enum: ["ase", "ins"] },
                  pose: { type: "string", description: "Base64 .pose file (v0.1/v0.2)" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SignDictionaryEntry" },
              },
            },
          },
          "400": { description: "Invalid word or pose file" },
          "403": { description: "Not an admin" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/signs/{id}": {
      delete: {
        tags: ["Sign Dictionary"],
        summary: "Delete a dictionary entry (admin)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "OK" },
          "403": { description: "Not an admin" },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/vocabulary": {
      get: {
        tags: ["Vocabulary"],
        summary: "Personal vocabulary + stats for the user's sign language",
        parameters: [{ name: "lang", in: "query", schema: { type: "string" } }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    signedLanguage: { type: "string" },
                    stats: {
                      type: "object",
                      properties: {
                        total: { type: "integer" },
                        due: { type: "integer" },
                        mastered: { type: "integer" },
                        learning: { type: "integer" },
                      },
                    },
                    items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/VocabularyItem" },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Vocabulary"],
        summary: "Save a word to the personal vocabulary (no-op if it already exists)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["word"],
                properties: {
                  word: { type: "string" },
                  source: {
                    type: "string",
                    enum: ["practice", "quiz", "translator", "manual"],
                    default: "manual",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/VocabularyItem" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/vocabulary/due": {
      get: {
        tags: ["Vocabulary"],
        summary: "Cards due for review today",
        parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 20 } }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/VocabularyItem" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/vocabulary/{id}": {
      delete: {
        tags: ["Vocabulary"],
        summary: "Remove a word from the personal vocabulary",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "OK" },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/vocabulary/reviews": {
      post: {
        tags: ["Vocabulary"],
        summary: "Submit a review session",
        description:
          "Applies SM-2 scheduling per card, awards 1 coin per reviewed card (max 20) and records a 'review' activity (counts toward the streak).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["reviews"],
                properties: {
                  reviews: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["id", "rating"],
                      properties: {
                        id: { type: "string", format: "uuid" },
                        rating: { type: "string", enum: ["again", "hard", "good", "easy"] },
                      },
                    },
                  },
                  durationSeconds: { type: "integer", minimum: 0 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reviewed: { type: "integer" },
                    coinsEarned: { type: "integer" },
                    items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/VocabularyItem" },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/agent/chat": {
      post: {
        tags: ["Signify Coach"],
        summary: "Run the Signify Coach AI agent (Server-Sent Events)",
        description:
          "Gemini function-calling agent with tools over the learner's data: get_learner_profile, search_materials, get_material_content, get_video_transcript, create_sign_quiz (private quiz owned by the user), add_signs_to_vocabulary, demonstrate_signs, recommend_materials, show_study_plan. Streams events: `session` {sessionId,title} → `step` {step} / `card` {card} (repeated) → `message` {text} → `done`; `error` {message} on failure. Requires AI_ENABLED and GEMINI_API_KEY (503 ai_unavailable otherwise).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["message"],
                properties: {
                  sessionId: { type: "string", format: "uuid", description: "Continue a conversation" },
                  message: { type: "string", maxLength: 2000 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "text/event-stream of coach events" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { description: "AI disabled (ai_unavailable)" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/agent/sessions": {
      get: {
        tags: ["Signify Coach"],
        summary: "List the user's coach conversations",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", format: "uuid" },
                      title: { type: "string" },
                      updatedAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/agent/sessions/{id}": {
      get: {
        tags: ["Signify Coach"],
        summary: "Conversation with messages, tool steps and result cards",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "OK" },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      delete: {
        tags: ["Signify Coach"],
        summary: "Delete a conversation",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "OK" },
          "404": { $ref: "#/components/responses/NotFound" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/leaderboard": {
      get: {
        tags: ["Leaderboard"],
        summary: "Ranking by coins",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    entries: {
                      type: "array",
                      items: { $ref: "#/components/schemas/LeaderboardEntry" },
                    },
                    me: {
                      allOf: [{ $ref: "#/components/schemas/LeaderboardEntry" }],
                      nullable: true,
                      description: "Current user's position (even if outside the limit)",
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/live/classes": {
      get: {
        tags: ["Live Class"],
        summary: "Classes created by the signed-in teacher (newest first)",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    allOf: [
                      { $ref: "#/components/schemas/LiveClass" },
                      {
                        type: "object",
                        properties: {
                          segmentCount: { type: "integer" },
                          materialId: { type: "string", format: "uuid", nullable: true },
                          quizId: { type: "string", format: "uuid", nullable: true },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
          "403": { description: "Teacher Mode is off (code teacher_only)" },
        },
      },
      post: {
        tags: ["Live Class"],
        summary: "Create a Live Class (teacher only)",
        description:
          "Generates a join code. signedLanguage defaults to ase for English and ins (BISINDO) for Indonesian.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title"],
                properties: {
                  title: { type: "string", maxLength: 120 },
                  spokenLanguage: { type: "string", enum: ["en", "id"], default: "en" },
                  signedLanguage: { type: "string", enum: ["ase", "ins"] },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/LiveClass" } } },
          },
          "403": { description: "Teacher Mode is off (code teacher_only)" },
        },
      },
    },
    "/api/live/classes/{code}": {
      get: {
        tags: ["Live Class"],
        summary: "Class info by join code (case-insensitive)",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/LiveClass" },
                    {
                      type: "object",
                      properties: {
                        broadcasting: { type: "boolean" },
                        viewers: { type: "integer" },
                        isTeacher: { type: "boolean" },
                        videoEnabled: { type: "boolean", description: "LiveKit video is configured" },
                      },
                    },
                  ],
                },
              },
            },
          },
          "404": { description: "Class not found (code class_not_found)" },
        },
      },
    },
    "/api/live/classes/{code}/segments": {
      get: {
        tags: ["Live Class"],
        summary: "Full transcript of a class",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/LiveSegment" } },
              },
            },
          },
          "404": { description: "Class not found" },
        },
      },
    },
    "/api/live/classes/{code}/video-token": {
      post: {
        tags: ["Live Class"],
        summary: "LiveKit token for the class video",
        description:
          "Everyone in the class may publish camera and microphone (gallery like Zoom). LiveKit identities are user ids; teacherId tells clients which participant is the teacher. Requires LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    url: { type: "string", description: "LiveKit WebSocket URL" },
                    token: { type: "string" },
                    canPublish: { type: "boolean" },
                    teacherId: { type: "string", format: "uuid" },
                  },
                },
              },
            },
          },
          "409": { description: "Class has ended (code class_ended)" },
          "503": { description: "Video not configured (code video_unavailable)" },
        },
      },
    },
    "/api/live/classes/{code}/mute": {
      post: {
        tags: ["Live Class"],
        summary: "Mute students' microphones (the class teacher only)",
        description:
          "Mutes the microphone of one student (identity = their user id) or of every student when identity is omitted. Students can unmute themselves again.",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { identity: { type: "string", format: "uuid" } } },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "object", properties: { muted: { type: "integer", description: "Microphone tracks muted" } } },
              },
            },
          },
          "403": { description: "Not the class teacher" },
          "503": { description: "Video not configured (video_unavailable) or LiveKit failed (mute_failed)" },
        },
      },
    },
    "/api/live/classes/{code}/material": {
      post: {
        tags: ["Live Class"],
        summary: "Turn a class transcript into a learning article + quiz (its teacher only)",
        description:
          "Gemini rewrites the transcript as an accessible Markdown article (2-6 sections) and a 5-question multiple-choice quiz. The article appears in Learning Materials and the quiz in Quizzes. Once per class.",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: ["K-12", "Vocational", "University", "Career", "Sign Language"],
                    default: "K-12",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    materialId: { type: "string", format: "uuid" },
                    quizId: { type: "string", format: "uuid" },
                    title: { type: "string" },
                    questions: { type: "integer" },
                  },
                },
              },
            },
          },
          "400": { description: "Transcript too short (code transcript_too_short)" },
          "403": { description: "Not the teacher of this class" },
          "409": { description: "Already turned into a material (code material_exists)" },
          "503": { description: "AI not configured or generation failed" },
        },
      },
    },
    "/api/live/classes/{code}/end": {
      post: {
        tags: ["Live Class"],
        summary: "End a class (its teacher only)",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Ended",
            content: { "application/json": { schema: { $ref: "#/components/schemas/LiveClass" } } },
          },
          "403": { description: "Not the teacher of this class" },
        },
      },
    },
    "/api/news": {
      get: {
        tags: ["News"],
        summary: "Published news, newest first (public)",
        security: [],
        parameters: [
          { name: "category", in: "query", schema: { type: "string" } },
          {
            name: "exclude",
            in: "query",
            schema: { type: "string" },
            description: "Slug to leave out (e.g. the article being read)",
          },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 9, maximum: 30 } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/NewsSummary" } },
                    page: { type: "integer" },
                    limit: { type: "integer" },
                    total: { type: "integer" },
                    totalPages: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["News"],
        summary: "Create a news article (admin, see ADMIN_EMAILS)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/NewsInput" } } },
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/NewsDetail" } } },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { description: "Not an admin" },
          "409": { description: "Slug already used" },
        },
      },
    },
    "/api/news/{key}": {
      get: {
        tags: ["News"],
        summary: "Published article by slug (public)",
        security: [],
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" }, description: "Article slug" },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/NewsDetail" } } },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["News"],
        summary: "Update fields of an article (admin)",
        parameters: [
          {
            name: "key",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Article id",
          },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/NewsInput" } } },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/NewsDetail" } } },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { description: "Not an admin" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { description: "Slug already used" },
        },
      },
      delete: {
        tags: ["News"],
        summary: "Delete an article (admin)",
        parameters: [
          {
            name: "key",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Article id",
          },
        ],
        responses: {
          "200": { description: "OK" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { description: "Not an admin" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
} as const;
