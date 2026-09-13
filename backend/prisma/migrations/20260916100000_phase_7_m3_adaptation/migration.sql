-- Phase 7: M3 Cross-Platform Adaptation.
-- Content Events remain an append-only audit trail; ai_adapted is the only
-- additional event type introduced by this phase.
ALTER TABLE "content_events" DROP CONSTRAINT "content_events_event_type_check";
ALTER TABLE "content_events" ADD CONSTRAINT "content_events_event_type_check" CHECK
  ("event_type" IN (
    'brief_created', 'content_updated', 'variant_updated', 'progress_changed',
    'content_duplicated', 'content_archived', 'ai_generated', 'ai_adapted'
  ));
