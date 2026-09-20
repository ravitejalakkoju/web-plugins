CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"public_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_public_key_unique" UNIQUE("public_key")
);
--> statement-breakpoint
CREATE TABLE "widget" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"template_id" text,
	"schema" json DEFAULT '{}'::json NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_config" (
	"id" text PRIMARY KEY NOT NULL,
	"widget_id" text NOT NULL,
	"project_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_health" (
	"widget_id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_visible_at" timestamp with time zone,
	"last_health_status" text,
	"last_config_version" integer,
	"last_page_url" text,
	"last_error_code" text,
	"last_error_message" text,
	"seen_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_template" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"chrome" text DEFAULT 'fab' NOT NULL,
	"src" text,
	"schema" json DEFAULT '{}'::json NOT NULL,
	"defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "widget" ADD CONSTRAINT "widget_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget" ADD CONSTRAINT "widget_template_id_widget_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."widget_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_config" ADD CONSTRAINT "widget_config_widget_id_widget_id_fk" FOREIGN KEY ("widget_id") REFERENCES "public"."widget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_config" ADD CONSTRAINT "widget_config_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_health" ADD CONSTRAINT "widget_health_widget_id_widget_id_fk" FOREIGN KEY ("widget_id") REFERENCES "public"."widget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_health" ADD CONSTRAINT "widget_health_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "widget_project_idx" ON "widget" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "widget_config_version_uq" ON "widget_config" USING btree ("widget_id","version");--> statement-breakpoint
CREATE INDEX "widget_config_status_idx" ON "widget_config" USING btree ("widget_id","status");