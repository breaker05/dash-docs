CREATE TABLE "integration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"url" text,
	"secret_enc" text NOT NULL,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "integration_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "tool_calls" jsonb;--> statement-breakpoint
ALTER TABLE "integration" ADD CONSTRAINT "integration_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;