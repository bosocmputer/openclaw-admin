CREATE TABLE IF NOT EXISTS admin_users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username     VARCHAR(50)  UNIQUE NOT NULL,
  password     VARCHAR(255) NOT NULL,
  role         VARCHAR(20)  NOT NULL DEFAULT 'admin'
               CHECK (role IN ('superadmin', 'admin', 'chat')),
  display_name VARCHAR(100),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webchat_rooms (
  id           SERIAL PRIMARY KEY,
  agent_id     TEXT NOT NULL UNIQUE,
  display_name TEXT,
  policy       TEXT NOT NULL DEFAULT 'open' CHECK (policy IN ('open', 'allowlist')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webchat_room_users (
  room_id      INT NOT NULL REFERENCES webchat_rooms(id) ON DELETE CASCADE,
  username     VARCHAR(50) NOT NULL REFERENCES admin_users(username) ON DELETE CASCADE,
  PRIMARY KEY (room_id, username)
);

CREATE TABLE IF NOT EXISTS webchat_messages (
  id           SERIAL PRIMARY KEY,
  room_id      INT NOT NULL REFERENCES webchat_rooms(id) ON DELETE CASCADE,
  username     VARCHAR(50) NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content      TEXT NOT NULL,
  run_id       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  actor      VARCHAR(50) NOT NULL,
  action     VARCHAR(60) NOT NULL,
  target     TEXT,
  detail     TEXT,
  ip         VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor     ON audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_logs(action);

-- Webchat performance indexes
CREATE INDEX IF NOT EXISTS idx_webchat_messages_room_created ON webchat_messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_users_username          ON admin_users(username);

CREATE TABLE IF NOT EXISTS sale_orders (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no         VARCHAR(50),
  source         VARCHAR(20) NOT NULL DEFAULT 'line',
  agent_id       VARCHAR(50),
  contact_name   VARCHAR(200),
  contact_phone  VARCHAR(50),
  items          JSONB       NOT NULL DEFAULT '[]',
  total_amount   NUMERIC(12,2),
  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','success','failed')),
  raw_request    JSONB,
  raw_response   JSONB,
  error_message  TEXT,
  retry_count    INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sale_orders_status     ON sale_orders(status);
CREATE INDEX IF NOT EXISTS idx_sale_orders_created    ON sale_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_orders_agent      ON sale_orders(agent_id);
CREATE INDEX IF NOT EXISTS idx_sale_orders_source     ON sale_orders(source);

CREATE TABLE IF NOT EXISTS conversation_turns (
  turn_id       TEXT PRIMARY KEY,
  source        TEXT NOT NULL DEFAULT 'unknown',
  session_key   TEXT,
  started_at    TIMESTAMPTZ NOT NULL,
  agent_id      TEXT,
  channel       TEXT NOT NULL DEFAULT 'unknown',
  chat_user     TEXT NOT NULL DEFAULT 'unknown',
  user_text     TEXT NOT NULL DEFAULT '',
  final_text    TEXT NOT NULL DEFAULT '',
  route         TEXT NOT NULL DEFAULT 'unknown',
  intent        TEXT NOT NULL DEFAULT 'unknown',
  status        TEXT NOT NULL DEFAULT 'unknown',
  root_cause    TEXT,
  duration_ms   INTEGER,
  ack_ms        INTEGER,
  model_ms      INTEGER,
  model         TEXT,
  provider      TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost          NUMERIC(14,8),
  tool_count    INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_events (
  id            BIGSERIAL PRIMARY KEY,
  turn_id       TEXT NOT NULL REFERENCES conversation_turns(turn_id) ON DELETE CASCADE,
  event_hash    TEXT NOT NULL,
  event_index   INTEGER NOT NULL DEFAULT 0,
  event_type    TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ,
  title         TEXT,
  body          TEXT,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(turn_id, event_hash)
);

CREATE TABLE IF NOT EXISTS conversation_ingest_checkpoints (
  source_key       TEXT PRIMARY KEY,
  source_path      TEXT,
  source_kind      TEXT,
  inode            TEXT,
  mtime_ms         NUMERIC,
  offset_bytes     NUMERIC,
  last_imported_at TIMESTAMPTZ,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_exports (
  id         BIGSERIAL PRIMARY KEY,
  actor      TEXT,
  format     TEXT NOT NULL,
  filters    JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_count  INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_turns_started_at      ON conversation_turns(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_turns_agent_started   ON conversation_turns(agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_turns_channel_started ON conversation_turns(channel, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_turns_status_started  ON conversation_turns(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_turns_chat_started    ON conversation_turns(chat_user, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_events_turn           ON conversation_events(turn_id, event_index ASC);

INSERT INTO admin_users (username, password, role, display_name)
VALUES (
  'superadmin',
  '$2b$12$MxRWHntDsOcVe0woYXsHrec7s15//9IhhHXgfTx1V7d0ueYmghN/m',
  'superadmin',
  'Super Admin'
) ON CONFLICT (username) DO NOTHING;
