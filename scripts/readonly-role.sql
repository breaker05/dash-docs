-- Read-only role for the docs "Ask AI" Postgres integration.
-- Run this against the DASH PLATFORM database (not the docs database) as its
-- owner, then add the resulting connection string at /admin/integrations:
--   postgresql://docs_reader:<password>@<host>/<db>?sslmode=require
-- On Neon, prefer the host of a read replica (read-only compute) so chat
-- queries never compete with production traffic.

CREATE ROLE docs_reader WITH LOGIN PASSWORD 'change-me-to-a-long-random-password';

-- Never let a runaway query hold resources.
ALTER ROLE docs_reader SET statement_timeout = '15s';
ALTER ROLE docs_reader SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE docs_reader SET default_transaction_read_only = on;

GRANT CONNECT ON DATABASE neondb TO docs_reader;  -- your database name
GRANT USAGE ON SCHEMA public TO docs_reader;

-- Option A (tighter, recommended): only the tables the team chat needs.
GRANT SELECT ON public.vendors TO docs_reader;    -- adjust to your table names
-- GRANT SELECT ON public.clients, public.campaigns TO docs_reader;

-- Option B (broader): everything in the schema, now and in the future.
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO docs_reader;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO docs_reader;

-- Sensitive columns (password hashes, tokens, PII) can be hidden by granting
-- per-column instead, e.g.:
-- GRANT SELECT (id, name, created_at) ON public.users TO docs_reader;
