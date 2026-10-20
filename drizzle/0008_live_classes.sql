CREATE TABLE "live_class_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"text" text NOT NULL,
	"offset_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"teacher_id" uuid NOT NULL,
	"title" text NOT NULL,
	"spoken_language" text DEFAULT 'en' NOT NULL,
	"signed_language" text DEFAULT 'ase' NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'learner' NOT NULL;--> statement-breakpoint
ALTER TABLE "live_class_segments" ADD CONSTRAINT "live_class_segments_class_id_live_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."live_classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "live_class_segments_class_seq_unique" ON "live_class_segments" USING btree ("class_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "live_classes_code_unique" ON "live_classes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "live_classes_teacher_idx" ON "live_classes" USING btree ("teacher_id","created_at");