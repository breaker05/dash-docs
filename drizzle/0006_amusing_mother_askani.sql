CREATE TABLE "context_chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" uuid NOT NULL,
	"ord" integer NOT NULL,
	"content" text NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED
);
--> statement-breakpoint
CREATE TABLE "context_doc" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"audience" text DEFAULT 'internal' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"content" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "context_doc_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "context_chunk" ADD CONSTRAINT "context_chunk_doc_id_context_doc_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."context_doc"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_doc" ADD CONSTRAINT "context_doc_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "context_chunk_search_idx" ON "context_chunk" USING gin ("search");