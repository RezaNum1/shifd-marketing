ALTER TABLE "content_canva_design_links"
  DROP CONSTRAINT IF EXISTS "content_canva_design_links_canva_https_check";

ALTER TABLE "content_canva_design_links"
  ADD CONSTRAINT "content_canva_design_links_canva_https_check"
  CHECK (
    "url" IS NULL
    OR "url" ~* '^https://([a-z0-9-]+\.)*(canva\.com|canva\.site|canva\.link)(/|[?#]|$)'
  );
