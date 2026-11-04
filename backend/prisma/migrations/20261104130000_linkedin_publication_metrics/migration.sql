ALTER TABLE "publication_metrics"
  DROP CONSTRAINT "publication_metrics_platform_check";

ALTER TABLE "publication_metrics"
  ADD CONSTRAINT "publication_metrics_platform_check"
  CHECK ("platform" IN ('instagram', 'linkedin'));

ALTER TABLE "publication_metrics"
  DROP CONSTRAINT "publication_metrics_source_check";

ALTER TABLE "publication_metrics"
  ADD CONSTRAINT "publication_metrics_source_check"
  CHECK ("source" IN ('instagram_api', 'linkedin_manual'));
