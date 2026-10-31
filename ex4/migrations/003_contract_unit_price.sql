-- CONTRACT - KHONG chay trong lan trien khai 2.0.
-- Chi chay o lan trien khai SAU, khi:
--   * phien ban 1.x da tat hoan toan (khong con moi truong blue chay 1.x)
--   * da het cua so quay lui ve 1.x

DROP TRIGGER IF EXISTS trg_products_sync_price ON products;
DROP FUNCTION IF EXISTS products_sync_price();
ALTER TABLE products ALTER COLUMN unit_price SET NOT NULL;
ALTER TABLE products DROP COLUMN price;

