ALTER TABLE "materials"
ALTER COLUMN "content" TYPE jsonb
USING CASE
  WHEN "content" IS NULL THEN NULL
  ELSE jsonb_build_array("content")
END;--> statement-breakpoint
