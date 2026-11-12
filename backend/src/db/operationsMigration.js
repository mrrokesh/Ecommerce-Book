export async function migrateOperations(query) {
  await query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_credit NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_credit_restored BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_token_hash TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_token_expires_at TIMESTAMPTZ;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_days INT NOT NULL DEFAULT 7;
    UPDATE orders SET delivered_at = updated_at WHERE status = 'delivered' AND delivered_at IS NULL;
    CREATE TABLE IF NOT EXISTS refund_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL REFERENCES orders(id),
      amount NUMERIC(12,2) NOT NULL CHECK(amount > 0), status TEXT NOT NULL DEFAULT 'pending',
      gateway_id TEXT, error TEXT, reason TEXT NOT NULL, actor_id UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGSERIAL PRIMARY KEY, actor_id UUID REFERENCES users(id), actor_name TEXT,
      action TEXT NOT NULL, entity_id TEXT, details JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS stock_movements (
      id BIGSERIAL PRIMARY KEY, book_id INT REFERENCES books(id) ON DELETE SET NULL,
      delta INT NOT NULL, reason TEXT NOT NULL, actor_id UUID REFERENCES users(id), order_id UUID REFERENCES orders(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS gift_transactions (
      id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL, order_id UUID REFERENCES orders(id),
      amount NUMERIC(12,2) NOT NULL, reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS customer_notes (
      id BIGSERIAL PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id), actor_id UUID REFERENCES users(id),
      note TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS stock_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), book_id INT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, notified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(book_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS checkout_attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id), session_id TEXT,
      payload JSONB NOT NULL, quote JSONB NOT NULL, gateway_order_id TEXT UNIQUE, payment_id TEXT,
      order_id UUID REFERENCES orders(id), status TEXT NOT NULL DEFAULT 'pending', error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE refund_requests ALTER COLUMN order_id DROP NOT NULL;
    ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS attempt_id UUID REFERENCES checkout_attempts(id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_attempt ON refund_requests(attempt_id) WHERE attempt_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS return_cases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL REFERENCES orders(id),
      status TEXT NOT NULL DEFAULT 'requested', items JSONB NOT NULL, reason TEXT NOT NULL,
      pickup_reference TEXT, inspection TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS returned_quantity INT NOT NULL DEFAULT 0;
    ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
    ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS html_body TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_pending TEXT;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'email_verified_at') THEN
        ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
        UPDATE users SET email_verified_at = created_at;
      END IF;
    END $$;
    CREATE TABLE IF NOT EXISTS email_verifications (
      id SERIAL PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT UNIQUE;
    ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS campaign_id INT;
    CREATE INDEX IF NOT EXISTS idx_outbox_campaign ON email_outbox(campaign_id);
    CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, subject TEXT NOT NULL, preheader TEXT, headline TEXT NOT NULL, body TEXT NOT NULL,
      coupon_code TEXT, cta_label TEXT NOT NULL DEFAULT 'Shop the sale', cta_url TEXT NOT NULL DEFAULT '/shop/books',
      status TEXT NOT NULL DEFAULT 'draft', recipients INT NOT NULL DEFAULT 0, created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), sent_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS marketing_subscribers (
      id SERIAL PRIMARY KEY, email TEXT NOT NULL, name TEXT, source TEXT NOT NULL DEFAULT 'admin', consent_note TEXT,
      consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), unsubscribe_token TEXT UNIQUE, active BOOLEAN NOT NULL DEFAULT TRUE,
      unsubscribed_at TIMESTAMPTZ, created_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_subscribers_email ON marketing_subscribers (lower(email));
    CREATE INDEX IF NOT EXISTS idx_refund_order ON refund_requests(order_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
  `);
}
