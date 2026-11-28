CREATE TYPE "public"."analysis_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."mde_kind" AS ENUM('absolute', 'relative');--> statement-breakpoint
CREATE TYPE "public"."metric_direction" AS ENUM('increase', 'decrease');--> statement-breakpoint
CREATE TYPE "public"."metric_role" AS ENUM('primary', 'secondary', 'guardrail');--> statement-breakpoint
CREATE TYPE "public"."metric_type" AS ENUM('conversion', 'mean', 'ratio');--> statement-breakpoint
CREATE TYPE "public"."result_method" AS ENUM('z_test_proportions', 'welch_t_test', 'delta_method');--> statement-breakpoint
CREATE TYPE "public"."store_order_status" AS ENUM('pending_etl', 'loaded');--> statement-breakpoint
ALTER TYPE "public"."audit_resource_type" ADD VALUE 'metric';--> statement-breakpoint
CREATE TABLE "analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "analysis_run_status" NOT NULL,
	"data_through" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"experiment_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"metric_id" uuid NOT NULL,
	"variant_key" text NOT NULL,
	"users" integer NOT NULL,
	"value" double precision NOT NULL,
	"delta_abs" double precision,
	"delta_rel" double precision,
	"ci_low" double precision,
	"ci_high" double precision,
	"p_value" double precision,
	"p_value_adjusted" double precision,
	"cuped" boolean NOT NULL,
	"method" "result_method" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_results_run_experiment_metric_variant_cuped_unique" UNIQUE("analysis_run_id","experiment_id","metric_id","variant_key","cuped")
);
--> statement-breakpoint
CREATE TABLE "srm_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"experiment_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"observed" jsonb NOT NULL,
	"expected" jsonb NOT NULL,
	"p_value" double precision NOT NULL,
	"excluded_users" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "srm_checks_run_experiment_unique" UNIQUE("analysis_run_id","experiment_id")
);
--> statement-breakpoint
CREATE TABLE "experiment_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"metric_id" uuid NOT NULL,
	"role" "metric_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_metrics_experiment_id_metric_id_unique" UNIQUE("experiment_id","metric_id")
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"type" "metric_type" NOT NULL,
	"event_name" text NOT NULL,
	"value_property" text,
	"denominator_event_name" text,
	"direction" "metric_direction" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metrics_project_id_key_unique" UNIQUE("project_id","key"),
	CONSTRAINT "metrics_fields_by_type" CHECK (("metrics"."type" <> 'mean' OR "metrics"."value_property" IS NOT NULL) AND ("metrics"."type" <> 'ratio' OR "metrics"."denominator_event_name" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "store_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"user_id" text NOT NULL,
	"items" jsonb NOT NULL,
	"total_cents" integer NOT NULL,
	"customer_name" text NOT NULL,
	"address" jsonb NOT NULL,
	"status" "store_order_status" DEFAULT 'pending_etl' NOT NULL,
	"placed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_orders_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "store_orders_total_cents_non_negative" CHECK ("store_orders"."total_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "planned_sample_size" integer;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "mde_kind" "mde_kind";--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "mde" double precision;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "alpha" double precision DEFAULT 0.05 NOT NULL;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "power" double precision DEFAULT 0.8 NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srm_checks" ADD CONSTRAINT "srm_checks_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srm_checks" ADD CONSTRAINT "srm_checks_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srm_checks" ADD CONSTRAINT "srm_checks_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_metrics" ADD CONSTRAINT "experiment_metrics_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_metrics" ADD CONSTRAINT "experiment_metrics_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_runs_environment_id_started_at_idx" ON "analysis_runs" USING btree ("environment_id","started_at");--> statement-breakpoint
CREATE INDEX "experiment_results_experiment_id_environment_id_idx" ON "experiment_results" USING btree ("experiment_id","environment_id");--> statement-breakpoint
CREATE INDEX "experiment_results_metric_id_idx" ON "experiment_results" USING btree ("metric_id");--> statement-breakpoint
CREATE INDEX "srm_checks_experiment_id_environment_id_idx" ON "srm_checks" USING btree ("experiment_id","environment_id");--> statement-breakpoint
CREATE INDEX "experiment_metrics_metric_id_idx" ON "experiment_metrics" USING btree ("metric_id");--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_metrics_one_primary_idx" ON "experiment_metrics" USING btree ("experiment_id") WHERE "experiment_metrics"."role" = 'primary';--> statement-breakpoint
CREATE INDEX "store_orders_pending_etl_idx" ON "store_orders" USING btree ("placed_at") WHERE "store_orders"."status" = 'pending_etl';--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_planned_sample_size_min" CHECK ("experiments"."planned_sample_size" IS NULL OR "experiments"."planned_sample_size" >= 1);--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_alpha_range" CHECK ("experiments"."alpha" BETWEEN 0.001 AND 0.2);--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_power_range" CHECK ("experiments"."power" BETWEEN 0.5 AND 0.99);--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_mde_positive" CHECK ("experiments"."mde" > 0);--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_mde_with_kind" CHECK (("experiments"."mde" IS NULL) = ("experiments"."mde_kind" IS NULL));