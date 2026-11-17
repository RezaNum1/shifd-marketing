ALTER TABLE "contents"
  ADD COLUMN "creation_mode" TEXT NOT NULL DEFAULT 'ai';

ALTER TABLE "contents"
  ADD CONSTRAINT "contents_creation_mode_check" CHECK ("creation_mode" IN ('ai', 'manual'));
