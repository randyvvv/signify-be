CREATE TABLE "news" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text NOT NULL,
	"content" text NOT NULL,
	"cover_image_url" text,
	"category" text DEFAULT 'News' NOT NULL,
	"author_name" text DEFAULT 'Signify Team' NOT NULL,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "news_slug_unique" ON "news" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "news_published_idx" ON "news" USING btree ("published","published_at");