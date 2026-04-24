-- PROJ-20: Remove FinAPI – drop all FinAPI tables and columns
-- BanksAPI is now the sole PSD2 provider.

-- Drop FinAPI sync history first (FK to finapi_verbindungen)
drop table if exists finapi_sync_historie cascade;

-- Drop FinAPI webform sessions
drop table if exists finapi_webform_sessions cascade;

-- Drop FinAPI connections (may FK to zahlungsquellen – cascade handles it)
drop table if exists finapi_verbindungen cascade;

-- Remove finapi_user_id from mandanten
alter table mandanten drop column if exists finapi_user_id;
