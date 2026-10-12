ALTER TABLE "weekly_metrics" ADD COLUMN "native_engagement_rate" DOUBLE PRECISION;

CREATE TABLE "marketing_evaluations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "definitions" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketing_evaluations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "evaluation_snapshots" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "captured_at" TIMESTAMPTZ(3) NOT NULL,
    "measurements" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "notes" TEXT,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evaluation_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "business_inquiries" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "prospect_id" UUID,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "company_name" TEXT,
    "summary" TEXT NOT NULL,
    "relevance" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_reference" TEXT,
    "follow_up_notes" TEXT,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "business_inquiries_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "production_time_logs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "minutes" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "production_time_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_evaluations_company_id_id_key" ON "marketing_evaluations"("company_id", "id");
CREATE UNIQUE INDEX "marketing_evaluations_company_id_revision_key" ON "marketing_evaluations"("company_id", "revision");
CREATE INDEX "marketing_evaluations_company_id_created_at_idx" ON "marketing_evaluations"("company_id", "created_at" DESC);
CREATE UNIQUE INDEX "evaluation_snapshots_evaluation_id_stage_key" ON "evaluation_snapshots"("evaluation_id", "stage");
CREATE INDEX "evaluation_snapshots_evaluation_id_captured_at_idx" ON "evaluation_snapshots"("evaluation_id", "captured_at");
CREATE UNIQUE INDEX "business_inquiries_company_id_id_key" ON "business_inquiries"("company_id", "id");
CREATE INDEX "business_inquiries_company_id_received_at_idx" ON "business_inquiries"("company_id", "received_at");
CREATE INDEX "business_inquiries_company_id_relevance_received_at_idx" ON "business_inquiries"("company_id", "relevance", "received_at");
CREATE UNIQUE INDEX "production_time_logs_company_id_id_key" ON "production_time_logs"("company_id", "id");
CREATE INDEX "production_time_logs_company_id_occurred_at_idx" ON "production_time_logs"("company_id", "occurred_at");
CREATE INDEX "production_time_logs_company_id_content_id_idx" ON "production_time_logs"("company_id", "content_id");

ALTER TABLE "marketing_evaluations" ADD CONSTRAINT "marketing_evaluations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "marketing_evaluations" ADD CONSTRAINT "marketing_evaluations_company_id_created_by_fkey" FOREIGN KEY ("company_id", "created_by") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_snapshots" ADD CONSTRAINT "evaluation_snapshots_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "marketing_evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_snapshots" ADD CONSTRAINT "evaluation_snapshots_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_inquiries" ADD CONSTRAINT "business_inquiries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_inquiries" ADD CONSTRAINT "business_inquiries_company_id_prospect_id_fkey" FOREIGN KEY ("company_id", "prospect_id") REFERENCES "prospects"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_inquiries" ADD CONSTRAINT "business_inquiries_company_id_recorded_by_fkey" FOREIGN KEY ("company_id", "recorded_by") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_time_logs" ADD CONSTRAINT "production_time_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_time_logs" ADD CONSTRAINT "production_time_logs_company_id_content_id_fkey" FOREIGN KEY ("company_id", "content_id") REFERENCES "contents"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_time_logs" ADD CONSTRAINT "production_time_logs_company_id_recorded_by_fkey" FOREIGN KEY ("company_id", "recorded_by") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
