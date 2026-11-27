-- Additive Drizzle Migration 0003: Teacher Join Codes, Parent-Teacher Connections & Notifications
-- Strictly additive: creates 4 new normalized tables and indexes with IF NOT EXISTS.
-- Zero destructive statements on any existing table.

CREATE TABLE IF NOT EXISTS "teacher_join_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"code_encrypted" text NOT NULL,
	"code_last4" text NOT NULL,
	"status" text NOT NULL,
	"created_at" text NOT NULL,
	"expires_at" text NOT NULL,
	"revoked_at" text,
	"updated_at" text NOT NULL,
	CONSTRAINT "teacher_join_codes_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "teacher_join_codes_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teacher_student_connection_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"parent_id" text NOT NULL,
	"child_id" text NOT NULL,
	"join_code_id" text NOT NULL,
	"status" text NOT NULL,
	"requested_at" text NOT NULL,
	"reviewed_at" text,
	"reviewed_by" text,
	"rejection_reason" text,
	"cancelled_at" text,
	"expires_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "teacher_student_connection_requests_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "teacher_student_connection_requests_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "teacher_student_connection_requests_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "teacher_student_connection_requests_join_code_id_teacher_join_codes_id_fk" FOREIGN KEY ("join_code_id") REFERENCES "public"."teacher_join_codes"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "teacher_student_connection_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teacher_student_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"parent_id" text NOT NULL,
	"child_id" text NOT NULL,
	"request_id" text,
	"status" text NOT NULL,
	"approved_at" text NOT NULL,
	"disconnected_at" text,
	"disconnected_by" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "teacher_student_connections_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "teacher_student_connections_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "teacher_student_connections_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "teacher_student_connections_request_id_teacher_student_connection_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."teacher_student_connection_requests"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" jsonb NOT NULL,
	"message" jsonb NOT NULL,
	"related_type" text,
	"related_id" text,
	"read_at" text,
	"created_at" text NOT NULL,
	CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_join_codes_teacher_idx" ON "teacher_join_codes" USING btree ("teacher_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_join_codes_status_idx" ON "teacher_join_codes" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teacher_join_codes_one_active_uidx" ON "teacher_join_codes" USING btree ("teacher_id") WHERE "teacher_join_codes"."status" = 'active';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tscr_teacher_status_idx" ON "teacher_student_connection_requests" USING btree ("teacher_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tscr_parent_status_idx" ON "teacher_student_connection_requests" USING btree ("parent_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tscr_child_idx" ON "teacher_student_connection_requests" USING btree ("child_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tscr_one_pending_uidx" ON "teacher_student_connection_requests" USING btree ("teacher_id","child_id") WHERE "teacher_student_connection_requests"."status" = 'pending';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tsc_teacher_status_idx" ON "teacher_student_connections" USING btree ("teacher_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tsc_parent_status_idx" ON "teacher_student_connections" USING btree ("parent_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tsc_child_idx" ON "teacher_student_connections" USING btree ("child_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tsc_one_active_uidx" ON "teacher_student_connections" USING btree ("teacher_id","child_id") WHERE "teacher_student_connections"."status" = 'active';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");