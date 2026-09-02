ALTER TABLE "message" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "cache_read_tokens" integer;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "cache_write_tokens" integer;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "cost_usd" double precision;