CREATE TABLE IF NOT EXISTS admin_users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username     VARCHAR(50)  UNIQUE NOT NULL,
  password     VARCHAR(255) NOT NULL,
  role         VARCHAR(20)  NOT NULL DEFAULT 'admin'
               CHECK (role IN ('superadmin', 'admin', 'viewer')),
  display_name VARCHAR(100),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO admin_users (username, password, role, display_name)
VALUES (
  'superadmin',
  '$2b$12$MxRWHntDsOcVe0woYXsHrec7s15//9IhhHXgfTx1V7d0ueYmghN/m',
  'superadmin',
  'Super Admin'
) ON CONFLICT (username) DO NOTHING;
