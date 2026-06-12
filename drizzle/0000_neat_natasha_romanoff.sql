CREATE TYPE "public"."admin_role" AS ENUM('owner', 'editor');--> statement-breakpoint
CREATE TYPE "public"."block_type" AS ENUM('text', 'richtext', 'image', 'video', 'number', 'url', 'json');--> statement-breakpoint
CREATE TYPE "public"."intake_status" AS ENUM('new', 'contacted', 'scheduled', 'declined');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'hidden', 'scheduled', 'published');--> statement-breakpoint
CREATE TYPE "public"."practice_group" AS ENUM('litigation', 'defense', 'counsel');--> statement-breakpoint
CREATE TYPE "public"."result_category" AS ENUM('marquee', 'appellate', 'settlement', 'jury', 'other');--> statement-breakpoint
CREATE TABLE "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'owner' NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer,
	"admin_email" varchar(255),
	"action" varchar(64) NOT NULL,
	"entity" varchar(64) NOT NULL,
	"entity_id" varchar(128),
	"summary" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "banner_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" varchar(16) DEFAULT 'image' NOT NULL,
	"url" text,
	"poster_url" text,
	"alt" text,
	"duration_ms" integer DEFAULT 6000 NOT NULL,
	"ken_burns" jsonb,
	"sort" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(191) NOT NULL,
	"title" varchar(255) NOT NULL,
	"excerpt" text,
	"body" text,
	"banner_image" text,
	"category" varchar(128),
	"tags" jsonb,
	"author" varchar(191) DEFAULT 'T. Maxwell Smith' NOT NULL,
	"is_firm_news" boolean DEFAULT false NOT NULL,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"seo_title" varchar(191),
	"seo_description" text,
	"og_image" text,
	"related_posts" jsonb,
	"related_practices" jsonb,
	"views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "case_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" "result_category" NOT NULL,
	"title" varchar(255) NOT NULL,
	"stat" varchar(64),
	"stat_label" varchar(191),
	"year" varchar(16),
	"summary" text,
	"detail" text,
	"cite" text,
	"link" text,
	"practice_slug" varchar(128),
	"featured_home" boolean DEFAULT false NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_blocks" (
	"key" varchar(191) PRIMARY KEY NOT NULL,
	"page" varchar(64) NOT NULL,
	"section" varchar(64) NOT NULL,
	"label" varchar(191) NOT NULL,
	"type" "block_type" DEFAULT 'text' NOT NULL,
	"value" jsonb,
	"draft" jsonb,
	"has_draft" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "glossary_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(191) NOT NULL,
	"term" varchar(191) NOT NULL,
	"definition" text NOT NULL,
	"hypothetical" text,
	"related_practices" jsonb,
	"aliases" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "glossary_terms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "intake_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch" varchar(64) NOT NULL,
	"practice_slug" varchar(128),
	"answers" jsonb NOT NULL,
	"name" varchar(191),
	"email" varchar(255),
	"phone" varchar(64),
	"county" varchar(128),
	"preferred_contact" varchar(32),
	"opposing_party" text,
	"deadline" varchar(64),
	"is_urgent" boolean DEFAULT false NOT NULL,
	"message" text,
	"status" "intake_status" DEFAULT 'new' NOT NULL,
	"referrer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"pathname" text NOT NULL,
	"kind" varchar(16) DEFAULT 'image' NOT NULL,
	"alt" text,
	"caption" text,
	"width" integer,
	"height" integer,
	"size_bytes" integer,
	"folder" varchar(128),
	"tags" jsonb,
	"usage" jsonb,
	"original_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"path" varchar(255) NOT NULL,
	"referrer" text,
	"day" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"slug" varchar(128) PRIMARY KEY NOT NULL,
	"title" varchar(191) NOT NULL,
	"nav_label" varchar(64),
	"nav_order" integer DEFAULT 0 NOT NULL,
	"show_in_nav" boolean DEFAULT true NOT NULL,
	"seo_title" varchar(191),
	"seo_description" text,
	"og_image" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_areas" (
	"slug" varchar(128) PRIMARY KEY NOT NULL,
	"title" varchar(191) NOT NULL,
	"group" "practice_group" NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"tagline" text,
	"body" jsonb,
	"approach" text,
	"hero_image" text,
	"keywords" jsonb,
	"seo_title" varchar(191),
	"seo_description" text,
	"visible" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" varchar(64) NOT NULL,
	"entity_id" varchar(191) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"admin_email" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote" text NOT NULL,
	"attribution" varchar(191),
	"context" varchar(191),
	"visible" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blog_status_idx" ON "blog_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blog_category_idx" ON "blog_posts" USING btree ("category");--> statement-breakpoint
CREATE INDEX "content_blocks_page_idx" ON "content_blocks" USING btree ("page");--> statement-breakpoint
CREATE INDEX "intake_status_idx" ON "intake_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "intake_practice_idx" ON "intake_submissions" USING btree ("practice_slug");--> statement-breakpoint
CREATE INDEX "page_views_path_idx" ON "page_views" USING btree ("path");--> statement-breakpoint
CREATE INDEX "page_views_day_idx" ON "page_views" USING btree ("day");--> statement-breakpoint
CREATE INDEX "revisions_entity_idx" ON "revisions" USING btree ("entity","entity_id");