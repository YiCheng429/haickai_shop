-- 微光盲盒 Glimmer Box 訂單資料表
-- 可重複執行（皆使用 IF NOT EXISTS）

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM ('pending_payment', 'paid', 'shipped', 'completed', 'cancelled');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS orders (
  id               BIGSERIAL PRIMARY KEY,
  order_no         VARCHAR(20)  NOT NULL UNIQUE,
  idempotency_key  VARCHAR(64)  UNIQUE,
  status           order_status NOT NULL DEFAULT 'pending_payment',
  buyer_name       VARCHAR(50)  NOT NULL,
  phone            VARCHAR(10)  NOT NULL,
  email            VARCHAR(254) NOT NULL,
  store_name       VARCHAR(50)  NOT NULL,
  store_id         CHAR(6)      NOT NULL,
  note             VARCHAR(500) NOT NULL DEFAULT '',
  subtotal         INTEGER      NOT NULL CHECK (subtotal >= 0),
  shipping_fee     INTEGER      NOT NULL CHECK (shipping_fee >= 0),
  total            INTEGER      NOT NULL CHECK (total >= 0),
  tracking_no      VARCHAR(40),
  admin_note       VARCHAR(1000),
  client_ip        VARCHAR(64),
  paid_at          TIMESTAMPTZ,
  shipped_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  cancelled_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id            BIGSERIAL PRIMARY KEY,
  order_id      BIGINT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    VARCHAR(32) NOT NULL,
  product_name  VARCHAR(100) NOT NULL,
  unit_price    INTEGER     NOT NULL CHECK (unit_price >= 0),
  qty           INTEGER     NOT NULL CHECK (qty BETWEEN 1 AND 20),  -- 應用層上限為 10
  line_total    INTEGER     NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
