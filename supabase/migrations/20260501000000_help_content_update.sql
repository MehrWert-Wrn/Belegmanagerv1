-- PROJ-22: Hilfe-Center – Inhalte auf neusten Stand bringen (2026-05-01)
-- Aktualisiert bestehende Artikel und ergänzt neue Artikel für Features PROJ-20 bis PROJ-31.
--
-- Änderungen:
-- 1. BanksAPI-Fix: FinAPI-Artikel → BanksAPI (slug, title, content)
-- 2. Onboarding-Checkliste: BanksAPI + aktueller Schritte-Stand
-- 3. Neue Artikel: KI-Chatbot, E-Mail-Belegeingang, EAR-Buchungsnummern, Weiterempfehlung
-- 4. Neuer Artikel: Eigenbeleg erstellen
-- 5. Neuer Artikel: Massenimport (OCR-Erkennung erweitert)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. BanksAPI-Fix: FinAPI-Artikel aktualisieren
-- ---------------------------------------------------------------------------

UPDATE help_articles
SET
  title             = 'Automatischer Import via BanksAPI (Bankanbindung)',
  slug              = 'banksapi-bankanbindung',
  summary           = 'Verbinde dein Bankkonto via PSD2-API für tägliche automatische Importe.',
  content_html      = '<h2>Was ist BanksAPI?</h2><p>BanksAPI ist ein PSD2-konformer Zahlungsdaten-Service, der deine Kontoauszüge direkt von der Bank holt – ganz ohne CSV-Download. Du sparst dir den manuellen Import komplett.</p><h3>Verbindung herstellen</h3><ol><li>Öffne <em>Einstellungen → Bankanbindungen</em>.</li><li>Klicke auf <strong>Neue Bankverbindung</strong>.</li><li>Wähle deine Bank aus der Liste (über 3.500 unterstützte Banken in Europa).</li><li>Du wirst ins gesicherte BanksAPI-WebForm weitergeleitet und meldest dich mit deinen Online-Banking-Zugangsdaten an.</li><li>Bestätige die Freigabe per TAN oder Push-TAN.</li></ol><h3>Wie oft wird synchronisiert?</h3><p>Standardmäßig einmal täglich automatisch. Du kannst auf der Übersichtsseite der Zahlungsquelle jederzeit manuell eine Synchronisation auslösen – Klick auf <strong>Jetzt synchronisieren</strong>.</p><h3>Gesetzliche Grundlage (PSD2)</h3><p>Die PSD2-Richtlinie erlaubt es, dass du deine Bankdaten einem registrierten Zahlungsdienstleister (BanksAPI) zur Verfügung stellst. Die Verbindung muss alle 180 Tage per Starker Kundenauthentifizierung (SCA) erneuert werden – wir erinnern dich rechtzeitig per E-Mail.</p><h3>Unterstützte Banken</h3><p>Erste Bank, Raiffeisen, Bank Austria, BAWAG, Sparkasse, N26, Revolut Business und hunderte weitere österreichische und europäische Banken. Die vollständige Liste findest du im Setup-Dialog.</p><h3>Kosten</h3><p>Im Belegmanager-Abo enthalten – keine Extra-Gebühren.</p>',
  updated_at        = now()
WHERE topic_id = '11111111-1111-1111-1111-000000000003'
  AND slug = 'finapi-bankanbindung';

-- ---------------------------------------------------------------------------
-- 2. Onboarding-Checkliste: Schritte + BanksAPI aktualisieren
-- ---------------------------------------------------------------------------

UPDATE help_articles
SET
  content_html  = '<h2>Ziel der Checkliste</h2><p>Die Onboarding-Checkliste sorgt dafür, dass du in unter 10 Minuten startklar bist. Sie erscheint nach der Registrierung oben auf dem Dashboard und bleibt sichtbar, bis alle Schritte erledigt sind.</p><h3>Die Schritte</h3><ol><li><strong>Firmendaten prüfen:</strong> Name, UID-Nummer, Adresse und Buchführungstyp (EAR oder doppelte Buchführung) – werden automatisch in Exporte übernommen.</li><li><strong>E-Mail-Postfach anbinden:</strong> Microsoft 365, Gmail oder IMAP – für automatischen Rechnungseingang. Zugangsdaten werden AES-256-verschlüsselt gespeichert.</li><li><strong>Zahlungsquelle anlegen:</strong> Bankkonto (manuell oder per BanksAPI-Anbindung), Kassa oder Kreditkarte konfigurieren.</li><li><strong>Ersten Kontoauszug importieren:</strong> CSV-Upload oder BanksAPI-Bankverbindung einrichten.</li><li><strong>Steuerberater einladen:</strong> Optional – dein Steuerberater bekommt Lesezugriff für den Monatsabschluss und Export.</li></ol><h3>Fortschrittsbalken</h3><p>Die Checkliste zeigt einen Fortschrittsbalken mit dem Prozentsatz der erledigten Schritte. Erledigte Schritte werden grün markiert. Die Checkliste verschwindet automatisch, sobald alle Schritte abgehakt sind.</p><p>Jeder Schritt enthält einen direkten Link zur passenden Einstellungsseite und einen Hilfeartikel für weitere Details.</p>',
  updated_at    = now()
WHERE topic_id = '11111111-1111-1111-1111-000000000001'
  AND slug = 'onboarding-checkliste';

-- ---------------------------------------------------------------------------
-- 3. E-Mail-Anbindungs-Artikel: Sicherheitshinweis ergänzen (PROJ-24)
-- ---------------------------------------------------------------------------

UPDATE help_articles
SET
  content_html  = '<h2>Microsoft 365 verbinden</h2><p>Der Belegmanager kann Rechnungen automatisch aus einem Microsoft-365-Postfach abholen. Die Anbindung läuft über OAuth 2.0 – wir speichern kein Passwort in Klartext.</p><h3>Schritt-für-Schritt</h3><ol><li>Öffne <em>Einstellungen → E-Mail-Anbindungen</em>.</li><li>Klicke auf <strong>Microsoft 365 verbinden</strong>.</li><li>Du wirst zu Microsoft weitergeleitet und meldest dich mit deinem Geschäftskonto an.</li><li>Bestätige die Berechtigungen (nur Lesezugriff auf den Posteingang).</li><li>Zurück im Belegmanager wählst du den Ordner, aus dem Belege abgeholt werden sollen.</li></ol><h3>Wie oft wird abgeholt?</h3><p>Alle 15 Minuten. Anhänge (PDF, JPG, PNG) werden automatisch in die Belegablage übernommen und mit OCR verarbeitet.</p><h3>Sicherheit</h3><p>OAuth-Tokens werden AES-256-verschlüsselt gespeichert und sind ausschließlich für den Import-Service entschlüsselbar. Du kannst die Verbindung jederzeit unter <em>Einstellungen → E-Mail-Anbindungen</em> widerrufen und alle gespeicherten Zugangsdaten endgültig löschen.</p><h3>Troubleshooting</h3><ul><li><strong>Admin-Zustimmung erforderlich:</strong> Bei Firmen-Tenants muss ggf. der IT-Admin die App einmalig freigeben.</li><li><strong>Token abgelaufen:</strong> Nach 90 Tagen Inaktivität muss die Verbindung neu autorisiert werden.</li></ul>',
  updated_at    = now()
WHERE topic_id = '11111111-1111-1111-1111-000000000001'
  AND slug = 'email-microsoft-365';

UPDATE help_articles
SET
  content_html  = '<h2>IMAP-Anbindung</h2><p>Für eigene Mailserver, Mailbox.org, All-Inkl, World4You etc. nutze die IMAP-Anbindung. Du brauchst die Server-Daten deines Providers.</p><h3>Benötigte Angaben</h3><ul><li>IMAP-Server (z. B. <code>imap.mailbox.org</code>)</li><li>Port (meist 993 für SSL)</li><li>Benutzername (meist deine E-Mail-Adresse)</li><li>Passwort (oder App-spezifisches Passwort)</li><li>Optional: Ordnername (Standard: <em>INBOX</em>)</li></ul><h3>App-Passwort verwenden</h3><p>Wenn dein Provider Zwei-Faktor-Authentifizierung anbietet, erstelle ein App-spezifisches Passwort und trage dieses hier ein. Dein Haupt-Passwort bleibt geschützt.</p><h3>Sicherheit & Datenschutz</h3><p>Alle Zugangsdaten werden mit AES-256 verschlüsselt in Supabase gespeichert. Die Verbindung läuft ausschließlich über TLS (SSL). Nur unser Import-Service kann die Credentials entschlüsseln. Unter <em>Einstellungen → E-Mail-Anbindungen</em> kannst du die Verbindung jederzeit widerrufen und alle Daten endgültig löschen (Hard-Delete).</p>',
  updated_at    = now()
WHERE topic_id = '11111111-1111-1111-1111-000000000001'
  AND slug = 'email-imap';

-- ---------------------------------------------------------------------------
-- 4. Neue Artikel: Thema 1 – Erste Schritte
-- ---------------------------------------------------------------------------

-- 4a. KI-Chatbot-Assistent (PROJ-23)
INSERT INTO help_articles
  (topic_id, title, slug, summary, content_html, status, sort_order, read_time_minutes)
VALUES (
  '11111111-1111-1111-1111-000000000001',
  'KI-Assistent – Der Belegmanager-Chatbot',
  'ki-assistent-chatbot',
  'Der KI-Assistent beantwortet deine Fragen rund um den Belegmanager sofort – rund um die Uhr.',
  '<h2>Dein KI-Assistent</h2><p>Rechts unten auf jeder Seite findest du das Chat-Icon. Ein Klick öffnet den KI-Assistenten – er beantwortet Fragen zur Belegmanager-Software auf Deutsch, zu jeder Tages- und Nachtzeit.</p><h3>Was kann der Assistent?</h3><ul><li>Fragen zu allen Funktionen des Belegmanagers beantworten</li><li>Schritt-für-Schritt-Anleitungen geben (z. B. „Wie importiere ich einen Kontoauszug?")</li><li>Auf passende Hilfe-Artikel verlinken</li><li>Ein Support-Ticket erstellen, wenn er nicht weiterhelfen kann</li></ul><h3>Wie funktioniert er?</h3><p>Der Assistent basiert auf Claude (Anthropic) und nutzt die Inhalte dieses Hilfe-Centers als Wissensbasis. Er weiß, auf welcher Seite du dich gerade befindest, und bietet passende Schnellfragen als Chips an.</p><h3>Kontext-Chips</h3><p>Beim Öffnen des Chats siehst du vorgeschlagene Fragen, die zur aktuellen Seite passen – z. B. auf der Beleg-Seite „Beleg hochladen" oder „OCR erklärt". Ein Klick auf einen Chip stellt die Frage sofort.</p><h3>Support-Ticket aus dem Chat heraus</h3><p>Wenn der Assistent nach zwei erfolglosen Versuchen keine passende Antwort liefert, erscheint automatisch eine Eskalations-Karte. Du kannst mit einem Klick ein Support-Ticket direkt im Chat erstellen.</p><h3>Datenschutz</h3><p>Der Chat-Verlauf wird nur für die aktuelle Browser-Session gespeichert – nicht in der Datenbank. Gib keine Passwörter oder Zugangsdaten in den Chat ein.</p>',
  'published', 7, 3
)
ON CONFLICT (topic_id, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Neue Artikel: Thema 2 – Belegverwaltung
-- ---------------------------------------------------------------------------

-- 5a. Belege per E-Mail empfangen – Testphase-Postfach (PROJ-30)
INSERT INTO help_articles
  (topic_id, title, slug, summary, content_html, status, sort_order, read_time_minutes)
VALUES (
  '11111111-1111-1111-1111-000000000002',
  'Belege per E-Mail einsenden (zentrales Postfach)',
  'belege-email-zentrales-postfach',
  'Sende Rechnungen an testphase@belegmanager.at – automatische Erkennung und OCR-Verarbeitung.',
  '<h2>Das zentrale Beleg-Postfach</h2><p>Während der Testphase steht das zentrale Postfach <strong>testphase@belegmanager.at</strong> bereit. Alle Rechnungen, die du oder ein Lieferant an diese Adresse schickt, werden automatisch in deine Belegablage importiert.</p><h3>So funktioniert es</h3><ol><li>Leite eine Rechnungsmail an <code>testphase@belegmanager.at</code> weiter – oder bitte deinen Lieferanten, Rechnungen direkt dorthin zu schicken.</li><li>Der Belegmanager erkennt deinen Mandanten anhand der hinterlegten Absender-E-Mail-Adresse.</li><li>Alle PDF-, JPG- und PNG-Anhänge werden mit OCR verarbeitet und als Belege angelegt.</li><li>Innerhalb von 1–2 Minuten erscheint der Beleg in deiner Ablage mit Status <em>Offen</em>.</li></ol><h3>Absender konfigurieren</h3><p>Damit das System weiß, welchem Mandanten eine eingehende Mail gehört, trage deine E-Mail-Adresse(n) unter <em>Einstellungen → E-Mail-Belegeingang</em> ein. Du kannst mehrere Adressen hinterlegen (z. B. du + dein Buchhalter).</p><h3>Unterschied zur Postfach-Anbindung</h3><p>Die Postfach-Anbindung (Microsoft 365 / Gmail / IMAP) holt aktiv Mails aus deinem eigenen Postfach. Das zentrale Postfach ist der umgekehrte Weg – du oder dein Lieferant schickt aktiv an unsere Adresse.</p><h3>Hinweis zur Testphase</h3><p>Diese Funktion befindet sich aktuell in der Testphase. Das zentrale Postfach wird in Kürze durch mandantenspezifische Adressen ersetzt (z. B. <code>deinunternehmen@belege.belegmanager.at</code>). Alle bereits eingegangenen Belege bleiben erhalten.</p>',
  'published', 5, 3
)
ON CONFLICT (topic_id, slug) DO NOTHING;

-- 5b. Eigenbeleg erstellen (PROJ-17)
INSERT INTO help_articles
  (topic_id, title, slug, summary, content_html, status, sort_order, read_time_minutes)
VALUES (
  '11111111-1111-1111-1111-000000000002',
  'Eigenbeleg erstellen',
  'eigenbeleg-erstellen',
  'Einen Eigenbeleg anlegen, wenn kein externer Beleg vorhanden oder beschaffbar ist.',
  '<h2>Was ist ein Eigenbeleg?</h2><p>Ein Eigenbeleg ist ein intern erstelltes Dokument, das einen fehlenden externen Beleg ersetzt – z. B. bei Barzahlungen ohne Kassenbon, verlorenen Quittungen oder Kleinauslagen aus eigener Tasche.</p><h3>Wann ist ein Eigenbeleg erlaubt?</h3><p>Nach österreichischem Steuerrecht (§ 4 Abs. 1 EStG) kann ein Eigenbeleg verwendet werden, wenn ein externer Beleg nachweislich nicht beschaffbar ist. Er muss mindestens enthalten: Datum, Betrag, Verwendungszweck und Unterschrift des Erstellers.</p><h3>Eigenbeleg anlegen</h3><ol><li>Öffne <em>Belege → Neuer Beleg</em>.</li><li>Wähle den Belegtyp <strong>Eigenbeleg</strong>.</li><li>Fülle Datum, Betrag, Lieferant / Empfänger und Beschreibung aus.</li><li>Optional: Begründung ergänzen, z. B. „Kassenbon verloren – Eigenbeleg gem. § 131 BAO".</li><li>Speichern – der Belegmanager generiert automatisch ein PDF und legt es in der Ablage ab.</li></ol><h3>Steuerberater-Hinweis</h3><p>Eigenbelegs sind steuerlich die Ausnahme und sollten dokumentiert begründet sein. Bei Unsicherheiten wende dich an deinen Steuerberater. Der Belegmanager erstellt das Dokument, prüft aber nicht die steuerliche Zulässigkeit im Einzelfall.</p>',
  'published', 6, 3
)
ON CONFLICT (topic_id, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Neue Artikel: Thema 4 – Monatsabschluss & Export
-- ---------------------------------------------------------------------------

-- 6a. EAR-Buchungstyp & Buchungsnummern (PROJ-25)
INSERT INTO help_articles
  (topic_id, title, slug, summary, content_html, status, sort_order, read_time_minutes)
VALUES (
  '11111111-1111-1111-1111-000000000004',
  'EAR-Buchungstyp & Buchungsnummern',
  'ear-buchungstyp-buchungsnummern',
  'Einnahmen-Ausgaben-Rechnung konfigurieren und automatische Buchungsnummern verstehen.',
  '<h2>Buchführungstyp: EAR oder doppelte Buchführung?</h2><p>Der Belegmanager unterstützt beide gängigen Buchführungsarten für österreichische KMUs:</p><ul><li><strong>Einnahmen-Ausgaben-Rechnung (EAR):</strong> Für Unternehmen bis 700.000 € Jahresumsatz (§ 4 Abs. 3 EStG). Einfachere Methode – nur Einnahmen und Ausgaben werden erfasst.</li><li><strong>Doppelte Buchführung:</strong> Für bilanzierungspflichtige Unternehmen. Jede Transaktion erhält einen Soll/Haben-Buchungssatz.</li></ul><h3>Buchführungstyp einstellen</h3><ol><li>Öffne <em>Einstellungen → Firmendaten → Buchführungstyp</em>.</li><li>Wähle <em>EAR</em> oder <em>Doppelte Buchführung</em>.</li><li>Speichern – die Einstellung beeinflusst den Export und die Buchungsnummern-Vergabe.</li></ol><h3>Automatische Buchungsnummern beim Monatsabschluss</h3><p>Beim Monatsabschluss vergibt der Belegmanager automatisch Buchungsnummern für alle Transaktionen und benennt die zugehörigen Belege entsprechend um. Das Format ist:</p><ul><li><strong>EAR:</strong> <code>JJJJ-MM-NNN</code> (z. B. <code>2026-04-001</code>)</li><li><strong>Doppelt:</strong> <code>JJJJ-MM-E-NNN</code> / <code>JJJJ-MM-A-NNN</code> für Einnahmen / Ausgaben</li></ul><h3>Privat-Transaktionen</h3><p>Transaktionen, die privat (nicht betrieblich) sind, kannst du als <em>Privat</em> markieren. Sie erhalten keine Buchungsnummer, erscheinen nicht im Export und zählen im Monatsabschluss als erledigt.</p><h3>Buchungsnummern rückgängig machen?</h3><p>Buchungsnummern werden erst beim Monatsabschluss endgültig vergeben. Bis zum Abschluss sind Änderungen möglich. Nach dem Abschluss kann nur ein Admin den Monat erneut öffnen – das wird im Audit-Log protokolliert.</p>',
  'published', 4, 4
)
ON CONFLICT (topic_id, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Neue Artikel: Thema 5 – Einstellungen & Benutzerverwaltung
-- ---------------------------------------------------------------------------

-- 7a. Weiterempfehlungsprogramm (PROJ-31)
INSERT INTO help_articles
  (topic_id, title, slug, summary, content_html, status, sort_order, read_time_minutes)
VALUES (
  '11111111-1111-1111-1111-000000000005',
  'Freunde werben & Gratismonat verdienen',
  'weiterempfehlung-referral',
  'Empfehle den Belegmanager und erhalte pro erfolgreichem Abonnenten einen Gratismonat.',
  '<h2>Das Weiterempfehlungsprogramm</h2><p>Für jede erfolgreiche Weiterempfehlung wird dir <strong>ein kostenloser Monat</strong> gutgeschrieben. Es gibt keine Obergrenze – bei 12 erfolgreichen Empfehlungen bekommst du ein Jahr gratis.</p><h3>So funktioniert es</h3><ol><li>Öffne <em>Einstellungen → Weiterempfehlung</em> oder gehe direkt auf <em>/referral</em>.</li><li>Kopiere deinen persönlichen Empfehlungs-Link.</li><li>Teile den Link per E-Mail, WhatsApp oder in deinem Netzwerk.</li><li>Sobald jemand über deinen Link ein kostenpflichtiges Abo abschließt und die Probezeit nicht kündigt, wird automatisch ein Gratismonat auf dein Konto gebucht.</li></ol><h3>Gutschrift & Status</h3><p>Die Gutschrift läuft automatisch über Stripe. Dein gesammeltes Guthaben siehst du unter <em>Einstellungen → Abonnement → Weiterempfehlungs-Guthaben</em>. Das Dashboard-Widget zeigt dir jederzeit: Einladungen verschickt, Konversionen und verfügbares Guthaben.</p><h3>Bedingungen</h3><ul><li>Der geworbene Mandant muss sich über deinen Link registrieren und ein kostenpflichtiges Abo abschließen.</li><li>Die Probezeit muss ohne Kündigung ablaufen, bevor die Gutschrift erfolgt.</li><li>Selbst-Registrierungen mit dem eigenen Link sind nicht zulässig.</li></ul>',
  'published', 4, 3
)
ON CONFLICT (topic_id, slug) DO NOTHING;
