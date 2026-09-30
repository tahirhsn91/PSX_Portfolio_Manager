-- "Last sign-in" was only ever written by the login route, so an account that stayed
-- signed in — a browser holding its session for days — showed a timestamp from days ago.
-- The column is maintained whenever the app is opened now, so its name says what it holds.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_login_at'
  ) THEN
    ALTER TABLE users RENAME COLUMN last_login_at TO last_seen_at;
  END IF;
END $$;
