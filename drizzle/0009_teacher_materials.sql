ALTER TABLE "live_classes" ADD COLUMN "material_id" uuid;--> statement-breakpoint
ALTER TABLE "live_classes" ADD COLUMN "quiz_id" uuid;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "materials_owner_idx" ON "materials" USING btree ("owner_id","created_at");