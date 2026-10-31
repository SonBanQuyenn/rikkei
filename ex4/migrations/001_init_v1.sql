-- Schema hien tai cua phien ban 1.x
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(12, 2) NOT NULL
);
INSERT INTO products (name, price)
SELECT 'Ao thun ShopFast', 150000
WHERE NOT EXISTS (SELECT 1 FROM products);
