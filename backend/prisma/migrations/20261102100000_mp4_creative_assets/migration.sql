ALTER TABLE "creative_assets" DROP CONSTRAINT "creative_assets_mime_type_check";
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_mime_type_check"
  CHECK ("mime_type" IN ('image/png', 'image/jpeg', 'video/mp4'));

ALTER TABLE "creative_assets" DROP CONSTRAINT "creative_assets_width_check";
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_width_check"
  CHECK ("width" >= 0 AND ("mime_type" = 'video/mp4' OR "width" > 0));

ALTER TABLE "creative_assets" DROP CONSTRAINT "creative_assets_height_check";
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_height_check"
  CHECK ("height" >= 0 AND ("mime_type" = 'video/mp4' OR "height" > 0));
