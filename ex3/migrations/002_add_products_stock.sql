-- Expand: chi them cot co gia tri mac dinh -> phien ban cu van chay binh thuong
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0;
