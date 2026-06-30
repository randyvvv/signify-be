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
    { name: "AI" },
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
          coins: { type: "integer" },
          streakCount: { type: "integer" },
          lastActiveDate: { type: "string", format: "date", nullable: true },
          totalLearningSeconds: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
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
          type: { type: "string", enum: ["text", "image"] },
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
          "409": { description: "Email already registered" },
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
          "401": { description: "Wrong email or password" },
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
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["currentPassword", "newPassword"],
                properties: {
                  currentPassword: { type: "string" },
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
                required: ["category", "completedCount", "totalCount", "accuracy"],
                properties: {
                  category: { type: "string" },
                  goalWord: { type: "string" },
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
  },
  security: [{ bearerAuth: [] }],
} as const;
