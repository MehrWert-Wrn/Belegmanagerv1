-- PROJ-22: Hilfe-Center
-- Public read (published only), admin write, German full-text search, soft-delete.

-- ---------------------------------------------------------------------------
-- 0. Helper: is_super_admin()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 1. help_topics
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS help_topics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  slug        TEXT NOT NULL UNIQUE CHECK (char_length(slug) BETWEEN 2 AND 120),
  description TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT 'HelpCircle',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE help_topics ENABLE ROW LEVEL SECURITY;

-- Public SELECT (auch ohne Login) auf non-deleted Themen
CREATE POLICY "help_topics_select_public" ON help_topics
  FOR SELECT
  USING (deleted_at IS NULL);

-- Admins sehen auch geloeschte (fuer Restore)
CREATE POLICY "help_topics_select_admin_all" ON help_topics
  FOR SELECT
  USING (is_super_admin());

CREATE POLICY "help_topics_insert_admin" ON help_topics
  FOR INSERT
  WITH CHECK (is_super_admin());

CREATE POLICY "help_topics_update_admin" ON help_topics
  FOR UPDATE
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "help_topics_delete_admin" ON help_topics
  FOR DELETE
  USING (is_super_admin());

CREATE INDEX IF NOT EXISTS help_topics_sort_order_idx ON help_topics(sort_order);
CREATE INDEX IF NOT EXISTS help_topics_slug_idx ON help_topics(slug);

-- ---------------------------------------------------------------------------
-- 2. help_articles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS help_articles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id            UUID NOT NULL REFERENCES help_topics(id) ON DELETE CASCADE,
  title               TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 200),
  slug                TEXT NOT NULL CHECK (char_length(slug) BETWEEN 2 AND 200),
  summary             TEXT NOT NULL DEFAULT '',
  content_html        TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  video_url           TEXT,
  video_storage_path  TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  read_time_minutes   INTEGER NOT NULL DEFAULT 3,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  UNIQUE (topic_id, slug)
);

ALTER TABLE help_articles ENABLE ROW LEVEL SECURITY;

-- Public SELECT nur fuer published + non-deleted
CREATE POLICY "help_articles_select_public" ON help_articles
  FOR SELECT
  USING (status = 'published' AND deleted_at IS NULL);

-- Admins sehen alles (auch Entwuerfe + soft-deleted)
CREATE POLICY "help_articles_select_admin_all" ON help_articles
  FOR SELECT
  USING (is_super_admin());

CREATE POLICY "help_articles_insert_admin" ON help_articles
  FOR INSERT
  WITH CHECK (is_super_admin());

CREATE POLICY "help_articles_update_admin" ON help_articles
  FOR UPDATE
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "help_articles_delete_admin" ON help_articles
  FOR DELETE
  USING (is_super_admin());

CREATE INDEX IF NOT EXISTS help_articles_topic_id_idx ON help_articles(topic_id);
CREATE INDEX IF NOT EXISTS help_articles_status_idx ON help_articles(status);
CREATE INDEX IF NOT EXISTS help_articles_sort_order_idx ON help_articles(topic_id, sort_order);
CREATE INDEX IF NOT EXISTS help_articles_deleted_at_idx ON help_articles(deleted_at);

-- Deutscher Full-Text-Search-Index auf Titel + Summary + Content
CREATE INDEX IF NOT EXISTS help_articles_fts_idx ON help_articles
  USING GIN (
    to_tsvector(
      'german',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(content_html, '')
    )
  );

-- ---------------------------------------------------------------------------
-- 3. help_article_feedback
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS help_article_feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES help_articles(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating     TEXT NOT NULL CHECK (rating IN ('helpful', 'not_helpful')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE help_article_feedback ENABLE ROW LEVEL SECURITY;

-- Nur Admins lesen Feedback aggregiert aus
CREATE POLICY "help_article_feedback_select_admin" ON help_article_feedback
  FOR SELECT
  USING (is_super_admin());

-- Eingeloggte User koennen Feedback schicken (auch anonym via service role)
CREATE POLICY "help_article_feedback_insert_auth" ON help_article_feedback
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS help_article_feedback_article_id_idx ON help_article_feedback(article_id);
CREATE INDEX IF NOT EXISTS help_article_feedback_created_at_idx ON help_article_feedback(created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION help_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS help_topics_updated_at ON help_topics;
CREATE TRIGGER help_topics_updated_at
  BEFORE UPDATE ON help_topics
  FOR EACH ROW EXECUTE FUNCTION help_set_updated_at();

DROP TRIGGER IF EXISTS help_articles_updated_at ON help_articles;
CREATE TRIGGER help_articles_updated_at
  BEFORE UPDATE ON help_articles
  FOR EACH ROW EXECUTE FUNCTION help_set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Storage Bucket: help-videos
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'help-videos',
  'help-videos',
  true, -- public lesbar, damit <video src="..."> ohne signed URL funktioniert
  524288000, -- 500 MB
  ARRAY['video/mp4']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read (bereits via bucket.public = true abgedeckt, zusaetzlich eine Policy)
CREATE POLICY "help_videos_select_public" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'help-videos');

-- Nur Super-Admins duerfen schreiben
CREATE POLICY "help_videos_insert_admin" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'help-videos' AND is_super_admin());

CREATE POLICY "help_videos_update_admin" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'help-videos' AND is_super_admin())
  WITH CHECK (bucket_id = 'help-videos' AND is_super_admin());

CREATE POLICY "help_videos_delete_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'help-videos' AND is_super_admin());

-- ---------------------------------------------------------------------------
-- 6. Seed-Daten: 6 Themen + 31 Artikel (Deutsch, echte Inhalte)
-- ---------------------------------------------------------------------------

-- Topics
INSERT INTO help_topics (id, title, slug, description, icon, sort_order) VALUES
  ('11111111-1111-1111-1111-000000000001', 'Erste Schritte', 'erste-schritte',
   'Alles, was du für den Einstieg in den Belegmanager brauchst.', 'Rocket', 1),
  ('11111111-1111-1111-1111-000000000002', 'Belegverwaltung', 'belegverwaltung',
   'Belege hochladen, erfassen und organisieren.', 'FileText', 2),
  ('11111111-1111-1111-1111-000000000003', 'Kontoauszug & Matching', 'kontoauszug-matching',
   'Kontoauszüge importieren und automatisch mit Belegen verknüpfen.', 'ArrowLeftRight', 3),
  ('11111111-1111-1111-1111-000000000004', 'Monatsabschluss & Export', 'monatsabschluss-export',
   'Monatsabschluss durchführen und Daten an den Steuerberater übergeben.', 'CalendarCheck', 4),
  ('11111111-1111-1111-1111-000000000005', 'Einstellungen & Benutzerverwaltung', 'einstellungen-benutzerverwaltung',
   'Konto, Rollen und Abonnement verwalten.', 'Settings', 5),
  ('11111111-1111-1111-1111-000000000006', 'Portalanbindungen', 'portalanbindungen',
   'Externe Portale wie Amazon Business oder Lieferantenportale verbinden.', 'Plug', 6)
ON CONFLICT (slug) DO NOTHING;

-- Articles – echte deutsche Inhalte, kein Placeholder

-- Topic 1: Erste Schritte
INSERT INTO help_articles (topic_id, title, slug, summary, content_html, status, sort_order, read_time_minutes) VALUES
('11111111-1111-1111-1111-000000000001',
 'Registrierung & Erstanmeldung',
 'registrierung-erstanmeldung',
 'So legst du dein Konto an und meldest dich zum ersten Mal an.',
 '<h2>Konto erstellen</h2><p>Rufe die Startseite des Belegmanagers auf und klicke auf <strong>Kostenlos registrieren</strong>. Gib deine geschäftliche E-Mail-Adresse und ein sicheres Passwort (mindestens 8 Zeichen) ein.</p><h3>E-Mail-Verifizierung</h3><p>Direkt nach der Registrierung senden wir dir eine Bestätigungs-E-Mail. Klicke auf den Link in der E-Mail, um dein Konto freizuschalten. Ohne Verifizierung ist kein Login möglich.</p><h3>Erster Login</h3><ul><li>Gib deine E-Mail-Adresse und dein Passwort ein.</li><li>Du wirst automatisch zum Onboarding weitergeleitet.</li><li>Im Onboarding legst du deinen Mandanten (deine Firma) an.</li></ul><h3>Passwort vergessen?</h3><p>Unterhalb des Login-Formulars findest du den Link <em>Passwort vergessen</em>. Wir senden dir einen Reset-Link per E-Mail. Der Link ist 60 Minuten gültig.</p>',
 'published', 1, 2),

('11111111-1111-1111-1111-000000000001',
 'Dashboard-Übersicht',
 'dashboard-uebersicht',
 'Die wichtigsten Bereiche deines Dashboards im Überblick.',
 '<h2>Dein Dashboard</h2><p>Nach dem Login landest du direkt auf dem Dashboard. Es zeigt dir auf einen Blick alles, was gerade wichtig ist.</p><h3>Die wichtigsten Kacheln</h3><ul><li><strong>Offene Belege:</strong> Anzahl der Belege, die noch keiner Transaktion zugeordnet sind.</li><li><strong>Ungematchte Transaktionen:</strong> Zahlungen ohne Beleg – rote Ampel, Handlungsbedarf.</li><li><strong>Aktueller Monat:</strong> Fortschritt des Monatsabschlusses in Prozent.</li><li><strong>Letzte Aktivitäten:</strong> Zeigt die neuesten Uploads, Matches und Änderungen.</li></ul><h3>Linke Navigation</h3><p>Über die Sidebar erreichst du alle Module: Belege, Transaktionen, Kassabuch, Monatsabschluss, Einstellungen und Hilfe.</p>',
 'published', 2, 2),

('11111111-1111-1111-1111-000000000001',
 'Onboarding-Checkliste – Was muss ich tun?',
 'onboarding-checkliste',
 'Die Checkliste führt dich Schritt für Schritt zum produktiven System.',
 '<h2>Ziel der Checkliste</h2><p>Die Onboarding-Checkliste sorgt dafür, dass du in unter 10 Minuten startklar bist. Sie erscheint nach der Registrierung und bleibt sichtbar, bis alle Schritte erledigt sind.</p><h3>Die Schritte</h3><ol><li><strong>Firmendaten prüfen:</strong> Name, UID-Nummer, Adresse – werden automatisch in DATEV-Exports übernommen.</li><li><strong>E-Mail-Postfach anbinden:</strong> Microsoft 365, Gmail oder IMAP – für automatischen Rechnungseingang.</li><li><strong>Zahlungsquelle anlegen:</strong> Bankkonto, Kassa oder Kreditkarte konfigurieren.</li><li><strong>Ersten Kontoauszug importieren:</strong> CSV-Upload oder FinAPI-Bankanbindung.</li><li><strong>Steuerberater einladen:</strong> Optional – dein Steuerberater bekommt Lesezugriff.</li></ol><p>Jeder Schritt hat eine direkte Verlinkung zur passenden Einstellung und einem Hilfeartikel.</p>',
 'published', 3, 3),

('11111111-1111-1111-1111-000000000001',
 'E-Mail-Postfach anbinden – Microsoft 365',
 'email-microsoft-365',
 'Verbinde dein Microsoft-365-Postfach für den automatischen Beleg-Import.',
 '<h2>Microsoft 365 verbinden</h2><p>Der Belegmanager kann Rechnungen automatisch aus einem Microsoft-365-Postfach abholen. Die Anbindung läuft über OAuth 2.0 – wir speichern kein Passwort.</p><h3>Schritt-für-Schritt</h3><ol><li>Öffne <em>Einstellungen → E-Mail-Anbindungen</em>.</li><li>Klicke auf <strong>Microsoft 365 verbinden</strong>.</li><li>Du wirst zu Microsoft weitergeleitet und meldest dich mit deinem Geschäftskonto an.</li><li>Bestätige die Berechtigungen (nur Lesezugriff auf den Posteingang).</li><li>Zurück im Belegmanager wählst du den Ordner, aus dem Belege abgeholt werden sollen.</li></ol><h3>Wie oft wird abgeholt?</h3><p>Alle 15 Minuten. Anhänge (PDF, JPG, PNG) werden automatisch in die Belegablage übernommen und mit OCR verarbeitet.</p><h3>Troubleshooting</h3><ul><li><strong>Admin-Zustimmung erforderlich:</strong> Bei Firmen-Tenants muss ggf. der IT-Admin die App einmalig freigeben.</li><li><strong>Token abgelaufen:</strong> Nach 90 Tagen Inaktivität muss die Verbindung neu autorisiert werden.</li></ul>',
 'published', 4, 3),

('11111111-1111-1111-1111-000000000001',
 'E-Mail-Postfach anbinden – Gmail',
 'email-gmail',
 'Verbinde dein Gmail-Konto für den automatischen Beleg-Import.',
 '<h2>Gmail verbinden</h2><p>Auch Gmail und Google Workspace lassen sich per OAuth anbinden. So kommen Rechnungen automatisch in deine Belegablage.</p><h3>Schritt-für-Schritt</h3><ol><li>Öffne <em>Einstellungen → E-Mail-Anbindungen</em>.</li><li>Klicke auf <strong>Gmail verbinden</strong>.</li><li>Melde dich bei Google an und bestätige den Zugriff (Read-only auf Mails).</li><li>Wähle ein Label oder einen Ordner als Quelle aus (z. B. <em>Rechnungen</em>).</li></ol><h3>Label statt Posteingang</h3><p>Wir empfehlen, in Gmail einen Filter anzulegen, der eingehende Rechnungen automatisch mit einem Label versieht. Der Belegmanager holt dann nur Mails mit diesem Label ab – das reduziert Fehltreffer.</p><h3>Privatsphäre</h3><p>Wir lesen nur Betreff, Absender und Anhänge. Alle anderen E-Mails werden nicht verarbeitet und nicht gespeichert.</p>',
 'published', 5, 3),

('11111111-1111-1111-1111-000000000001',
 'E-Mail-Postfach anbinden – IMAP',
 'email-imap',
 'Verbinde ein beliebiges IMAP-Postfach mit dem Belegmanager.',
 '<h2>IMAP-Anbindung</h2><p>Für eigene Mailserver, Mailbox.org, All-Inkl, World4You etc. nutze die IMAP-Anbindung. Du brauchst die Server-Daten deines Providers.</p><h3>Benötigte Angaben</h3><ul><li>IMAP-Server (z. B. <code>imap.mailbox.org</code>)</li><li>Port (meist 993 für SSL)</li><li>Benutzername (meist deine E-Mail-Adresse)</li><li>Passwort (oder App-spezifisches Passwort)</li><li>Optional: Ordnername (Standard: <em>INBOX</em>)</li></ul><h3>App-Passwort verwenden</h3><p>Wenn dein Provider Zwei-Faktor-Authentifizierung anbietet, erstelle ein App-spezifisches Passwort und trage dieses hier ein. Dein Haupt-Passwort bleibt geschützt.</p><h3>Verschlüsselung</h3><p>Alle Zugangsdaten werden verschlüsselt in Supabase gespeichert. Die Verbindung läuft ausschließlich über TLS (SSL).</p>',
 'published', 6, 3);

-- Topic 2: Belegverwaltung
INSERT INTO help_articles (topic_id, title, slug, summary, content_html, status, sort_order, read_time_minutes) VALUES
('11111111-1111-1111-1111-000000000002',
 'Belege hochladen (manuell)',
 'belege-manuell-hochladen',
 'So lädst du einzelne Belege per Drag-and-Drop hoch.',
 '<h2>Manueller Upload</h2><p>Im Bereich <em>Belege</em> findest du oben rechts den Button <strong>Beleg hochladen</strong>. Du kannst Dateien per Klick auswählen oder direkt ins Fenster ziehen.</p><h3>Erlaubte Formate</h3><ul><li>PDF (bis 10 MB)</li><li>JPG / JPEG</li><li>PNG</li></ul><h3>Was passiert nach dem Upload?</h3><ol><li>Die Datei wird verschlüsselt in Supabase Storage gespeichert.</li><li>Die OCR-Erkennung liest Datum, Betrag, Lieferant, UID-Nummer automatisch aus.</li><li>Du bekommst ein Review-Formular, in dem du die erkannten Werte prüfen und korrigieren kannst.</li><li>Nach dem Speichern landet der Beleg im Status <em>Offen</em> und wartet auf Zuordnung zu einer Transaktion.</li></ol><h3>Doppel-Upload-Schutz</h3><p>Beim Upload berechnen wir einen Hash der Datei. Wenn genau dieselbe Datei bereits existiert, warnen wir dich und du kannst entscheiden, ob du sie trotzdem speichern willst.</p>',
 'published', 1, 2),

('11111111-1111-1111-1111-000000000002',
 'Belege per WhatsApp senden',
 'belege-whatsapp',
 'Sende Belege bequem vom Handy per WhatsApp an den Belegmanager.',
 '<h2>WhatsApp-Anbindung</h2><p>Unterwegs beim Einkaufen? Fotografiere den Kassenbon und schicke ihn direkt per WhatsApp an deinen persönlichen Belegmanager-Kontakt.</p><h3>Einrichtung</h3><ol><li>Öffne <em>Einstellungen → WhatsApp-Anbindung</em>.</li><li>Scanne den QR-Code mit deiner Handy-Kamera.</li><li>Speichere die Belegmanager-Nummer als Kontakt.</li><li>Sende ein Foto oder PDF per WhatsApp an den Kontakt.</li></ol><h3>Wer darf senden?</h3><p>Nur Handynummern, die du in den Einstellungen hinzufügst, können Belege senden. So ist sichergestellt, dass keine fremden Bilder in deine Ablage kommen.</p><h3>Automatische Verarbeitung</h3><p>Fotos werden automatisch zugeschnitten, entzerrt und per OCR erkannt. Du bekommst eine Bestätigung per WhatsApp zurück, sobald der Beleg in deiner Ablage ist.</p>',
 'published', 2, 3),

('11111111-1111-1111-1111-000000000002',
 'Belege per E-Mail einsenden',
 'belege-email',
 'Leite Rechnungen einfach an deine persönliche Belegmanager-Adresse weiter.',
 '<h2>Deine Belegmanager-E-Mail</h2><p>Jeder Mandant hat eine eigene Einsende-Adresse im Format <code>mandant-xyz@belege.belegmanager.at</code>. Du findest sie unter <em>Einstellungen → E-Mail-Import</em>.</p><h3>So funktioniert es</h3><ol><li>Leite eine Rechnungs-Mail an deine Einsende-Adresse weiter.</li><li>Alle PDF-, JPG- und PNG-Anhänge werden importiert.</li><li>Der Betreff der Mail wird als Notiz am Beleg gespeichert.</li><li>Innerhalb von 1–2 Minuten taucht der Beleg in der Ablage auf.</li></ol><h3>Unterschied zur Postfach-Anbindung</h3><p>Die Postfach-Anbindung (Microsoft 365 / Gmail / IMAP) holt automatisch alle Mails aus einem Ordner ab. Die Einsende-Adresse ist der manuelle Weg – du entscheidest aktiv, welche Mail importiert wird.</p><h3>Spam-Schutz</h3><p>Nur Absender, die du in den Einstellungen als <em>vertrauenswürdig</em> markierst, werden akzeptiert. Alles andere landet im Spam-Ordner.</p>',
 'published', 3, 2),

('11111111-1111-1111-1111-000000000002',
 'OCR-Erkennung und automatisches Ausfüllen',
 'ocr-erkennung',
 'Wie die OCR-Erkennung funktioniert und was du prüfen solltest.',
 '<h2>Was ist OCR?</h2><p>OCR (Optical Character Recognition) liest Text aus PDFs und Fotos automatisch aus. Der Belegmanager nutzt eine moderne KI-basierte OCR, die besonders gut mit österreichischen Rechnungen umgeht.</p><h3>Welche Felder werden erkannt?</h3><ul><li>Rechnungsdatum</li><li>Bruttobetrag, Nettobetrag, Umsatzsteuer</li><li>Lieferant / Firmenname</li><li>UID-Nummer</li><li>Rechnungsnummer</li><li>IBAN (für Matching)</li></ul><h3>Vertrauens-Score</h3><p>Jedes erkannte Feld bekommt einen Score zwischen 0 und 100 %. Felder unter 70 % werden gelb markiert – hier solltest du nochmal drüberschauen.</p><h3>Was nicht erkannt wird</h3><p>Handschriftliche Notizen, Kassenbons in schlechter Qualität und stark rotierte Fotos können Fehler verursachen. In diesen Fällen kannst du die Werte manuell korrigieren – der Beleg lernt daraus für das nächste Mal.</p>',
 'published', 4, 3);

-- Topic 3: Kontoauszug & Matching
INSERT INTO help_articles (topic_id, title, slug, summary, content_html, status, sort_order, read_time_minutes) VALUES
('11111111-1111-1111-1111-000000000003',
 'Kontoauszug importieren (CSV)',
 'kontoauszug-csv-import',
 'Kontoauszug als CSV hochladen und normalisieren lassen.',
 '<h2>CSV-Import</h2><p>Fast jede Bank bietet einen CSV-Export des Kontoauszugs. Der Belegmanager erkennt die gängigen Formate von Erste Bank, Raiffeisen, Bank Austria, BAWAG, Sparkasse und N26 automatisch.</p><h3>So geht''s</h3><ol><li>Lade dir in deinem Online-Banking den Kontoauszug als CSV herunter.</li><li>Öffne <em>Transaktionen → Import</em> und wähle deine Zahlungsquelle.</li><li>Ziehe die CSV-Datei ins Fenster oder wähle sie per Klick aus.</li><li>Der Belegmanager erkennt die Spaltenzuordnung automatisch.</li><li>Du siehst eine Vorschau der ersten 10 Zeilen – prüfe, ob Betrag und Datum korrekt sind.</li><li>Klick auf <strong>Import starten</strong>.</li></ol><h3>Duplikate</h3><p>Schon importierte Transaktionen werden erkannt und übersprungen. Du kannst also gefahrlos denselben Monat mehrmals importieren.</p><h3>Unbekanntes Format?</h3><p>Falls deine Bank nicht automatisch erkannt wird, kannst du die Spalten manuell zuordnen. Die Zuordnung wird für künftige Imports gespeichert.</p>',
 'published', 1, 3),

('11111111-1111-1111-1111-000000000003',
 'Automatischer Import via FinAPI (Bankanbindung)',
 'finapi-bankanbindung',
 'Verbinde dein Bankkonto via PSD2-API für tägliche automatische Importe.',
 '<h2>Was ist FinAPI?</h2><p>FinAPI ist ein PSD2-konformer Zahlungsdaten-Service. Er holt deine Kontoauszüge direkt von der Bank – ohne CSV-Download. So sparst du dir den manuellen Import komplett.</p><h3>Verbindung herstellen</h3><ol><li>Öffne <em>Einstellungen → Bankanbindungen</em>.</li><li>Klicke auf <strong>Neue Bankverbindung</strong>.</li><li>Wähle deine Bank aus der Liste (über 3.500 unterstützte Banken in Europa).</li><li>Du wirst ins gesicherte FinAPI-WebForm weitergeleitet und meldest dich mit deinen Online-Banking-Zugangsdaten an.</li><li>Bestätige die Freigabe per TAN oder Push-TAN.</li></ol><h3>Wie oft wird synchronisiert?</h3><p>Standardmäßig einmal täglich automatisch. Du kannst jederzeit manuell eine Synchronisation auslösen – der Button steht auf der Übersichtsseite.</p><h3>Gesetzliche Grundlage</h3><p>Die PSD2-Richtlinie erlaubt es, dass du deine Bankdaten an einen registrierten Drittanbieter (FinAPI) weitergibst. Die Verbindung muss alle 180 Tage per Starker Kundenauthentifizierung (SCA) erneuert werden – wir erinnern dich rechtzeitig per E-Mail.</p><h3>Kosten</h3><p>Im Belegmanager-Abo enthalten.</p>',
 'published', 2, 4),

('11111111-1111-1111-1111-000000000003',
 'Matching-Status verstehen (Ampel-System)',
 'matching-ampel-system',
 'Grün, Gelb, Rot: Was die Matching-Ampel aussagt.',
 '<h2>Das Ampel-System</h2><p>Jede Transaktion bekommt nach dem Matching einen Ampel-Status, der zeigt, wie sicher die Zuordnung zum Beleg ist.</p><h3>🟢 Grün – Hard Match (Score 100)</h3><p>Deterministische Zuordnung. Wir sind uns zu 100 % sicher, dass Beleg und Transaktion zusammengehören. Passiert z. B. wenn die Rechnungsnummer im Verwendungszweck steht oder ein SEPA-Mandat zugeordnet ist.</p><h3>🟡 Gelb – Score Match (70–99)</h3><p>Gute Zuordnung, aber nicht 100 %. Betrag, Datum und Lieferant passen, aber ein Detail ist unklar. Du solltest die Zuordnung kurz prüfen.</p><h3>🔴 Rot – Kein Match (unter 70)</h3><p>Keine passende Zuordnung gefunden. Entweder fehlt der Beleg noch oder die Werte weichen zu stark ab. Hier musst du manuell eingreifen oder einen neuen Beleg hochladen.</p><h3>Mehrfach-Matches</h3><p>Wenn mehrere Belege gleich gut passen (z. B. bei runden Beträgen wie 100 €), bekommst du eine Auswahl und entscheidest selbst.</p>',
 'published', 3, 3),

('11111111-1111-1111-1111-000000000003',
 'Belege manuell zuordnen',
 'belege-manuell-zuordnen',
 'So ordnest du Belege manuell zu, wenn das Matching unsicher ist.',
 '<h2>Manuelle Zuordnung</h2><p>Für jede Transaktion mit gelbem oder rotem Status kannst du den Beleg selbst auswählen.</p><h3>Variante 1: Aus der Transaktionsliste</h3><ol><li>Öffne die Transaktion (Klick auf die Zeile).</li><li>Im rechten Panel siehst du die Top-5-Beleg-Vorschläge sortiert nach Score.</li><li>Klicke auf den passenden Beleg, um ihn zuzuordnen.</li><li>Der Status wechselt auf grün.</li></ol><h3>Variante 2: Aus der Beleg-Ablage</h3><ol><li>Öffne den Beleg.</li><li>Im rechten Panel siehst du passende Transaktionsvorschläge.</li><li>Klicke auf die Transaktion, um die Zuordnung zu speichern.</li></ol><h3>Zuordnung lösen</h3><p>Falsch zugeordnet? Klick auf das X neben dem Beleg-Namen – die Zuordnung wird aufgehoben und das Matching läuft neu.</p><h3>Kein Beleg vorhanden</h3><p>Manche Transaktionen haben bewusst keinen Beleg (z. B. Zinsen, Gebühren). Markiere sie als <strong>Kein Beleg nötig</strong> – so zählen sie im Monatsabschluss als fertig.</p>',
 'published', 4, 3),

('11111111-1111-1111-1111-000000000003',
 'Kassabuch verwenden',
 'kassabuch-verwenden',
 'Barzahlungen im Kassabuch erfassen und mit Belegen verknüpfen.',
 '<h2>Das Kassabuch</h2><p>Das Kassabuch ist eine separate Zahlungsquelle für Barzahlungen. Jede Einlage und jede Auszahlung wird als Zeile erfasst – chronologisch und mit laufendem Saldo.</p><h3>BAO-konform</h3><p>Das Kassabuch des Belegmanagers erfüllt die Anforderungen der Bundesabgabenordnung (BAO): tagfertige Erfassung, laufende Nummerierung, unveränderbare Einträge nach Monatsabschluss.</p><h3>Eintrag erfassen</h3><ol><li>Öffne <em>Kassabuch → Neuer Eintrag</em>.</li><li>Datum, Betrag, Einnahme oder Ausgabe, Verwendungszweck.</li><li>Beleg direkt hochladen oder später zuordnen.</li></ol><h3>Saldo-Warnung</h3><p>Wenn der Kassenstand negativ wird (was in der Realität nicht vorkommen darf), warnt dich der Belegmanager. In der Regel fehlt dann eine Einlage-Buchung.</p><h3>Tages-Abschluss</h3><p>Am Ende jedes Tages solltest du den physischen Kassenstand mit dem Belegmanager-Saldo abgleichen. Differenzen werden als <em>Kassasturz-Differenz</em> gebucht.</p>',
 'published', 5, 4);

-- Topic 4: Monatsabschluss & Export
INSERT INTO help_articles (topic_id, title, slug, summary, content_html, status, sort_order, read_time_minutes) VALUES
('11111111-1111-1111-1111-000000000004',
 'Monatsabschluss durchführen',
 'monatsabschluss-durchfuehren',
 'Der komplette Workflow zum Monatsabschluss in unter 30 Minuten.',
 '<h2>Ziel des Monatsabschlusses</h2><p>Am Ende jedes Monats werden alle Transaktionen geprüft, mit Belegen verknüpft und freigegeben. Danach ist der Monat gesperrt – rückwirkende Änderungen sind nicht mehr möglich.</p><h3>Vollständigkeitsprüfung</h3><p>Der Belegmanager prüft automatisch, ob <strong>alle</strong> Transaktionen aus <strong>allen</strong> aktiven Zahlungsquellen einen Beleg (oder die Markierung <em>Kein Beleg nötig</em>) haben.</p><h3>Workflow</h3><ol><li>Öffne <em>Monatsabschluss</em> und wähle den Monat.</li><li>Der Prüfbericht zeigt dir offene Posten pro Zahlungsquelle.</li><li>Arbeite die offenen Posten ab – meist Belege nachladen oder Zuordnungen korrigieren.</li><li>Wenn alles grün ist: Klick auf <strong>Monat abschließen</strong>.</li><li>Der Monat ist nun gesperrt. Du kannst weiterhin Belege ansehen, aber nicht mehr ändern.</li></ol><h3>Monat wieder öffnen</h3><p>Nur der Admin kann einen gesperrten Monat wieder öffnen – das wird im Audit-Log protokolliert.</p>',
 'published', 1, 4),

('11111111-1111-1111-1111-000000000004',
 'DATEV-Export für den Steuerberater',
 'datev-export',
 'So exportierst du deine Daten im DATEV-kompatiblen Format.',
 '<h2>DATEV-Export</h2><p>Nach dem Monatsabschluss kannst du alle Buchungen und Belege als DATEV-kompatibles Paket exportieren. Dein Steuerberater importiert das Paket ohne Nacharbeit in DATEV Unternehmen online oder DATEV Kanzlei-Rechnungswesen.</p><h3>Was ist im Export enthalten?</h3><ul><li><strong>EXTF_Buchungsstapel.csv:</strong> Alle Buchungen im DATEV-Format (Konten, Beträge, Buchungstexte).</li><li><strong>Belege (PDF):</strong> Alle zugeordneten Belege in einem Unterordner, benannt nach Buchungsnummer.</li><li><strong>Index-Datei:</strong> Verknüpfung zwischen Buchung und Beleg.</li></ul><h3>Export starten</h3><ol><li>Öffne <em>Export → DATEV</em>.</li><li>Wähle den Zeitraum (einzelner Monat oder Quartal).</li><li>Prüfe die Buchungsvorschau.</li><li>Klicke auf <strong>ZIP-Paket erstellen</strong>.</li><li>Download-Link kommt per E-Mail (bei großen Exports) oder direkt im Browser.</li></ol><h3>Kontenrahmen</h3><p>Unterstützt werden SKR03 und SKR04 (Deutschland) sowie der österreichische Einheitskontenrahmen (EKR).</p>',
 'published', 2, 4),

('11111111-1111-1111-1111-000000000004',
 'Zahlungsquellen verwalten',
 'zahlungsquellen-verwalten',
 'Mehrere Zahlungsquellen wie Kreditkarte oder PayPal anlegen und nutzen.',
 '<h2>Was sind Zahlungsquellen?</h2><p>Eine Zahlungsquelle ist jeder Ort, von dem Geld fließt: Bankkonto, Kassa, Kreditkarte, PayPal, Tankkarte. Der Belegmanager unterstützt beliebig viele Quellen pro Mandant.</p><h3>Standardquellen</h3><p>Beim Anlegen eines Mandanten werden automatisch <em>Bankkonto 1</em> und <em>Kassa</em> erstellt. Diese kannst du umbenennen oder deaktivieren.</p><h3>Neue Quelle anlegen</h3><ol><li>Öffne <em>Einstellungen → Zahlungsquellen</em>.</li><li>Klick auf <strong>Neue Zahlungsquelle</strong>.</li><li>Typ wählen (Bank, Kassa, Kreditkarte, PayPal, sonstige).</li><li>Name, Währung, Startsaldo angeben.</li><li>Optional: FinAPI-Anbindung verknüpfen.</li></ol><h3>Quelle deaktivieren</h3><p>Nicht mehr genutzte Quellen kannst du deaktivieren. Historische Daten bleiben erhalten, neue Transaktionen werden aber nicht mehr erwartet – die Quelle zählt auch nicht mehr in der Vollständigkeitsprüfung.</p>',
 'published', 3, 3);

-- Topic 5: Einstellungen & Benutzerverwaltung
INSERT INTO help_articles (topic_id, title, slug, summary, content_html, status, sort_order, read_time_minutes) VALUES
('11111111-1111-1111-1111-000000000005',
 'Benutzerverwaltung und Rollen (Admin / Buchhalter)',
 'benutzer-rollen',
 'Weitere Benutzer einladen und Rollen zuweisen.',
 '<h2>Multi-User pro Mandant</h2><p>Du kannst pro Mandant beliebig viele Benutzer einladen – z. B. deinen Steuerberater, einen Buchhalter oder einen zweiten Geschäftsführer.</p><h3>Die Rollen</h3><ul><li><strong>Admin:</strong> Voller Zugriff – Einstellungen, Benutzerverwaltung, Monatsabschluss, Export.</li><li><strong>Buchhalter:</strong> Belege hochladen, Transaktionen matchen, Monatsabschluss vorbereiten. Keine Benutzerverwaltung, keine Einstellungen.</li></ul><h3>Benutzer einladen</h3><ol><li>Öffne <em>Einstellungen → Benutzerverwaltung</em>.</li><li>Klick auf <strong>Benutzer einladen</strong>.</li><li>E-Mail-Adresse und Rolle angeben.</li><li>Der Benutzer bekommt einen Einladungs-Link per E-Mail und kann sich damit registrieren.</li></ol><h3>Rolle ändern / Benutzer entfernen</h3><p>In der Benutzerliste kannst du jederzeit die Rolle ändern oder den Benutzer deaktivieren. Historische Aktionen bleiben im Audit-Log erhalten.</p>',
 'published', 1, 3),

('11111111-1111-1111-1111-000000000005',
 'Passwort ändern',
 'passwort-aendern',
 'So änderst du dein Passwort sicher.',
 '<h2>Passwort ändern</h2><p>Ein starkes Passwort schützt deine Buchhaltungsdaten. Wir empfehlen, das Passwort alle 6 Monate zu wechseln.</p><h3>Variante 1: Eingeloggt</h3><ol><li>Klick oben rechts auf dein Profil → <em>Profil-Einstellungen</em>.</li><li>Gib dein aktuelles Passwort ein.</li><li>Wähle ein neues Passwort (mindestens 8 Zeichen, Groß- und Kleinschreibung, Zahl).</li><li>Speichern.</li></ol><h3>Variante 2: Passwort vergessen</h3><ol><li>Auf der Login-Seite auf <strong>Passwort vergessen</strong> klicken.</li><li>E-Mail-Adresse eingeben.</li><li>Reset-Link per E-Mail erhalten (gültig 60 Minuten).</li><li>Neues Passwort setzen.</li></ol><h3>Passwort-Manager empfohlen</h3><p>Wir empfehlen die Nutzung eines Passwort-Managers wie 1Password, Bitwarden oder Apple-Schlüsselbund.</p>',
 'published', 2, 2),

('11111111-1111-1111-1111-000000000005',
 'Abonnement & Rechnungen',
 'abonnement-rechnungen',
 'Dein Abo verwalten und Rechnungen herunterladen.',
 '<h2>Abonnement-Verwaltung</h2><p>Der Belegmanager läuft im Abo-Modell mit monatlicher oder jährlicher Abrechnung über Stripe.</p><h3>Plan ändern</h3><ol><li>Öffne <em>Einstellungen → Abonnement</em>.</li><li>Klick auf <strong>Plan ändern</strong>.</li><li>Neuen Plan wählen.</li><li>Du wirst zu Stripe weitergeleitet und bestätigst die Änderung.</li></ol><h3>Zahlungsmethode</h3><p>Unterstützt werden Kreditkarte, SEPA-Lastschrift und Apple Pay. Die Zahlungsdaten werden direkt bei Stripe gespeichert – der Belegmanager hat keinen Zugriff auf Kartendaten.</p><h3>Rechnungen herunterladen</h3><p>Unter <em>Einstellungen → Abonnement → Rechnungen</em> siehst du alle bisherigen Rechnungen und kannst sie als PDF herunterladen. Die Rechnungen sind auf deinen Firmennamen ausgestellt.</p><h3>Kündigung</h3><p>Du kannst jederzeit kündigen. Die Kündigung wird zum Ende des aktuellen Abrechnungszeitraums wirksam – bis dahin hast du vollen Zugriff.</p>',
 'published', 3, 3);

-- Topic 6: Portalanbindungen
INSERT INTO help_articles (topic_id, title, slug, summary, content_html, status, sort_order, read_time_minutes) VALUES
('11111111-1111-1111-1111-000000000006',
 'Amazon Business anbinden',
 'amazon-business-anbinden',
 'Verbinde dein Amazon-Business-Konto für automatischen Rechnungsabruf.',
 '<h2>Warum Amazon Business?</h2><p>Amazon Business stellt deine Bestell-Rechnungen als PDF im Kundenbereich bereit. Der Belegmanager kann diese automatisch abholen, sodass du nie wieder manuell runterladen musst.</p><h3>Voraussetzungen</h3><ul><li>Ein aktives Amazon-Business-Konto (nicht normal-Amazon).</li><li>Admin-Rechte im Amazon-Konto.</li></ul><h3>Verbindung einrichten</h3><ol><li>Öffne <em>Einstellungen → Portalanbindungen → Amazon Business</em>.</li><li>Klick auf <strong>Verbinden</strong>.</li><li>Melde dich bei Amazon an (OAuth).</li><li>Bestätige die Rechnungs-Abrufe-Berechtigung.</li></ol><h3>Wie oft?</h3><p>Der Belegmanager synchronisiert täglich und holt alle neuen Rechnungen der letzten 30 Tage. Ältere Rechnungen kannst du mit dem <strong>Rückwirkend importieren</strong>-Button bis zu 12 Monate nachholen.</p>',
 'published', 1, 3),

('11111111-1111-1111-1111-000000000006',
 'Lieferantenportal anbinden (Schritt-für-Schritt)',
 'lieferantenportal-anbinden',
 'Allgemeine Anleitung für beliebige Lieferantenportale.',
 '<h2>Individuelle Portal-Anbindung</h2><p>Viele Lieferanten stellen Rechnungen nur in ihrem eigenen Kundenportal bereit (z. B. A1, Magenta, Herold). Für solche Portale bieten wir eine geführte Anbindung per Browser-Automation.</p><h3>So funktioniert es</h3><ol><li>Öffne <em>Einstellungen → Portalanbindungen → Neu</em>.</li><li>Wähle dein Portal aus der Liste – oder klick auf <strong>Portal nicht dabei</strong>, um ein Meeting mit unserem Team zu buchen.</li><li>Gib deine Zugangsdaten ein – sie werden verschlüsselt gespeichert.</li><li>Der Belegmanager meldet sich täglich im Portal an und holt neue Rechnungen.</li></ol><h3>Sicherheit</h3><p>Alle Zugangsdaten werden mit AES-256 verschlüsselt. Nur unser Import-Service kann sie entschlüsseln – nicht wir als Menschen.</p><h3>Zwei-Faktor-Authentifizierung</h3><p>Wenn dein Portal 2FA verlangt, richten wir die Verbindung über ein App-Passwort oder einen Session-Token ein. Details dazu erklären wir im Setup-Wizard.</p>',
 'published', 2, 4),

('11111111-1111-1111-1111-000000000006',
 'Meeting buchen für Portalanbindung',
 'meeting-portalanbindung',
 'Brauchst du Hilfe bei der Anbindung? Buche ein Meeting mit unserem Team.',
 '<h2>Individuelle Unterstützung</h2><p>Nicht jedes Portal lässt sich in 2 Minuten selbst anbinden. Für spezielle Setups (z. B. interne Firmen-SSO, Zertifikats-Login, seltene Portale) bieten wir kostenlose 30-Minuten-Meetings an.</p><h3>Meeting buchen</h3><ol><li>Öffne <em>Einstellungen → Portalanbindungen</em>.</li><li>Klick auf <strong>Meeting buchen</strong>.</li><li>Wähle einen freien Termin im Kalender.</li><li>Beschreibe kurz, welches Portal du anbinden willst.</li></ol><h3>Was passiert im Meeting?</h3><ul><li>Gemeinsamer Bildschirm – wir gehen die Einrichtung zusammen durch.</li><li>Wir testen die Verbindung direkt mit deinen Daten.</li><li>Falls nötig, erweitern wir den Belegmanager, damit dein Portal dauerhaft unterstützt wird.</li></ul><h3>Kosten</h3><p>Für Kunden im <em>Business</em>- und <em>Enterprise</em>-Plan kostenlos. Im <em>Starter</em>-Plan einmalig 49 €.</p>',
 'published', 3, 2);
