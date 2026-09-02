CREATE TABLE "page_chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"ord" integer NOT NULL,
	"content" text NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED
);
--> statement-breakpoint
ALTER TABLE "page_chunk" ADD CONSTRAINT "page_chunk_page_id_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_chunk_search_idx" ON "page_chunk" USING gin ("search");--> statement-breakpoint
CREATE INDEX "page_chunk_page_idx" ON "page_chunk" USING btree ("page_id");