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

INSERT INTO admin_users (username, password, role, display_name)
VALUES (
  'superadmin',
  '$2b$12$MxRWHntDsOcVe0woYXsHrec7s15//9IhhHXgfTx1V7d0ueYmghN/m',
  'superadmin',
  'Super Admin'
) ON CONFLICT (username) DO NOTHING;
