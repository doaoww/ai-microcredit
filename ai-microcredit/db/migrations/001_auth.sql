CREATE TABLE users (
  id uuid PRIMARY KEY,
  login varchar(64) NOT NULL UNIQUE CHECK (login = lower(login)),
  display_name varchar(120) NOT NULL,
  password_hash text NOT NULL,
  account_status text NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'BLOCKED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE credit_applications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'ISSUED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_applications_user_created_idx ON credit_applications(user_id, created_at DESC);

CREATE TABLE login_rate_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  window_start timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_rate_limits_window_idx ON login_rate_limits(window_start);
