-- Avatar VRoid (anime) diganti 10 avatar Microsoft Rocketbox yang semuanya gratis.
-- Koin yang pernah dipakai membeli avatar lama dikembalikan ke pemiliknya.
UPDATE "users" SET "coins" = "users"."coins" + "refund"."total"
FROM (
  SELECT "ui"."user_id", SUM("s"."price")::int AS "total"
  FROM "user_items" "ui"
  JOIN "shop_items" "s" ON "s"."id" = "ui"."item_id"
  WHERE "s"."category" = 'Avatar' AND "s"."price" > 0
  GROUP BY "ui"."user_id"
) AS "refund"
WHERE "users"."id" = "refund"."user_id";
--> statement-breakpoint
-- Kepemilikan & pilihan avatar lama ikut terhapus (cascade); pemakainya kembali ke avatar default.
DELETE FROM "shop_items" WHERE "category" = 'Avatar' AND "is_default" = false;
--> statement-breakpoint
-- Avatar default tetap barisnya (yang sudah memakainya tidak berubah), modelnya diganti.
UPDATE "shop_items"
SET "name" = 'Female Adult 01', "image_url" = '/avatars/female-adult-01.glb', "price" = 0
WHERE "category" = 'Avatar' AND "is_default" = true;
--> statement-breakpoint
-- Database baru (shop belum di-seed) dilewati: seed.ts sudah berisi daftar lengkap.
INSERT INTO "shop_items" ("name", "price", "category", "image_url", "is_default")
SELECT "v"."name", 0, 'Avatar', "v"."url", false
FROM (VALUES
  ('Female Adult 02', '/avatars/female-adult-02.glb'),
  ('Female Adult 14', '/avatars/female-adult-14.glb'),
  ('Female Adult 15', '/avatars/female-adult-15.glb'),
  ('Female Adult 17', '/avatars/female-adult-17.glb'),
  ('Male Adult 01', '/avatars/male-adult-01.glb'),
  ('Male Adult 02', '/avatars/male-adult-02.glb'),
  ('Male Adult 06', '/avatars/male-adult-06.glb'),
  ('Male Adult 10', '/avatars/male-adult-10.glb'),
  ('Male Adult 16', '/avatars/male-adult-16.glb')
) AS "v"("name", "url")
WHERE EXISTS (SELECT 1 FROM "shop_items" WHERE "category" = 'Avatar' AND "is_default" = true);
