-- EXPAND (chay TRUOC khi bat moi truong moi).
-- (deploy/scripts/migrate.sh chay moi file trong 1 transaction: --single-transaction)
-- Phien ban 2.0 doi ten cot price -> unit_price. Trong luc 1.x (blue) va 2.0 (green) cung chay,
-- ca hai cot phai ton tai va luon bang nhau. Migration nay chi THEM, khong xoa/doi ten gi
-- -> phien ban 1.x khong bi anh huong, va quay lui ve 1.x khong can migration nguoc.

ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2);

-- Dong bo hai chieu: 1.x ghi price -> cap nhat unit_price; 2.0 ghi unit_price -> cap nhat price
CREATE OR REPLACE FUNCTION products_sync_price() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.unit_price := COALESCE(NEW.unit_price, NEW.price);
    NEW.price      := COALESCE(NEW.price, NEW.unit_price);
  ELSIF NEW.unit_price IS DISTINCT FROM OLD.unit_price THEN
    NEW.price := NEW.unit_price;
  ELSIF NEW.price IS DISTINCT FROM OLD.price THEN
    NEW.unit_price := NEW.price;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_sync_price ON products;
CREATE TRIGGER trg_products_sync_price
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION products_sync_price();

-- price cho phep NULL de 2.0 chi can ghi unit_price (trigger se dien price)
ALTER TABLE products ALTER COLUMN price DROP NOT NULL;

-- Backfill du lieu cu
UPDATE products SET unit_price = price WHERE unit_price IS NULL;

