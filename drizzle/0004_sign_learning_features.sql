CREATE TABLE "pose_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"signed_language" text NOT NULL,
	"spoken_language" text NOT NULL,
	"pose" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sign_dictionary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word" text NOT NULL,
	"signed_language" text NOT NULL,
	"pose" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sign_practice_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"word" text NOT NULL,
	"score" integer NOT NULL,
	"passed" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_vocabulary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"word" text NOT NULL,
	"signed_language" text DEFAULT 'ase' NOT NULL,
	"source" text NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"ease" integer DEFAULT 250 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"due_date" date NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sign_practice_sessions" ADD COLUMN "points_earned" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "sign_language" text DEFAULT 'ase' NOT NULL;--> statement-breakpoint
ALTER TABLE "sign_dictionary" ADD CONSTRAINT "sign_dictionary_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_practice_attempts" ADD CONSTRAINT "sign_practice_attempts_session_id_sign_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sign_practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_vocabulary" ADD CONSTRAINT "user_vocabulary_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pose_cache_key_unique" ON "pose_cache" USING btree ("text","signed_language","spoken_language");--> statement-breakpoint
CREATE UNIQUE INDEX "sign_dictionary_word_lang_unique" ON "sign_dictionary" USING btree ("word","signed_language");--> statement-breakpoint
CREATE INDEX "sign_practice_attempts_session_idx" ON "sign_practice_attempts" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_vocabulary_unique" ON "user_vocabulary" USING btree ("user_id","word","signed_language");--> statement-breakpoint
CREATE INDEX "user_vocabulary_due_idx" ON "user_vocabulary" USING btree ("user_id","due_date");