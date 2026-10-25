CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text NOT NULL,
	"model" text,
	"fallback_reason" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 8) DEFAULT 0 NOT NULL,
	"latency_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"allows_training" boolean NOT NULL,
	"request_quota" integer NOT NULL,
	"requests_used" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tenants_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "requests_tenant_created" ON "requests" USING btree ("tenant_id","created_at" DESC NULLS LAST);