-- BUG-PROJ9-003: Add beraternummer and mandantennummer to mandanten
-- These are required for valid DATEV Buchungsstapel headers.
-- Beraternummer: 5-7 digit numeric string (assigned by tax advisor)
-- Mandantennummer: 1-5 digit numeric string (assigned by tax advisor)

alter table mandanten
  add column if not exists beraternummer  varchar(7)  null,
  add column if not exists mandantennummer varchar(5) null;

comment on column mandanten.beraternummer   is 'DATEV Beraternummer (5-7 Stellen, vom Steuerberater vergeben)';
comment on column mandanten.mandantennummer is 'DATEV Mandantennummer (1-5 Stellen, vom Steuerberater vergeben)';
