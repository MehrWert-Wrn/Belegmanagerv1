# PROJ-18: Mobile App – Belegerfassung (iOS & Android)

## Status: Planned
**Created:** 2026-04-07
**Last Updated:** 2026-04-07

## Dependencies
- Requires: PROJ-1 (Authentifizierung) – Supabase Auth, gleiche Credentials
- Requires: PROJ-3 (Belegverwaltung) – Belege-Tabelle & Storage-Struktur
- Requires: PROJ-15 (OCR-Erkennung) – OCR-Pipeline wird nach Upload automatisch ausgelöst

## Projekt-Kontext
Die Mobile App ist ein **separates Projekt** (`BelegmanagerMobile/`) auf Basis von React Native + Expo. Sie teilt sich das Supabase-Backend (Auth, Storage, DB) mit der Web-App – kein eigenes Backend nötig. App-Name: **"Belegmanager Scan"** (App Store / Play Store).

---

## User Stories

- As a user, I want to log in with my existing Belegmanager credentials so that I don't need a separate account
- As a user, I want to unlock the app with Face ID / Fingerprint after the first login so that I don't have to re-enter my password every time
- As a user, I want to photograph a receipt with automatic edge detection and perspective correction so that the scan is clean and readable without manual cropping
- As a user, I want to combine multiple photos into one PDF so that multi-page receipts are stored as a single document
- As a user, I want to import existing photos or PDFs from my phone so that I can upload receipts I already have saved
- As a user, I want to select the receipt type (ER / AR / KASSE / WEITERE) before uploading so that it is correctly categorized in Belegmanager
- As a user, I want to add a note (Freitext) to a receipt so that important information is passed to the accounting team
- As a user, I want to enter preliminary data (date, amount) so that the receipt can be pre-categorized before OCR runs
- As a user, I want to add keywords/tags to a receipt so that it is easier to find later
- As a user, I want uploaded receipts to appear immediately in the Belegmanager web app so that the accounting team can process them without delay

---

## Acceptance Criteria

### Authentifizierung
- [ ] User kann sich mit E-Mail + Passwort (bestehende Belegmanager-Zugangsdaten) anmelden
- [ ] Nach erstem erfolgreichen Login wird Biometrie (Face ID / Fingerprint) angeboten
- [ ] Bei aktivierter Biometrie: kein erneutes Passwort-Eingeben beim App-Start nötig
- [ ] Session bleibt bestehen bis manueller Logout oder Token-Ablauf
- [ ] Logout löscht gespeicherte Session (biometrische Bindung bleibt, Credentials nicht)
- [ ] Multi-Tenant: User sieht und lädt nur Belege seines eigenen Mandanten hoch

### Kamera & Scan
- [ ] Kamera-Screen öffnet sich direkt beim Start (nach Login)
- [ ] Echtzeit-Kantenerkennung hebt das Dokument visuell hervor
- [ ] Automatische Perspektivkorrektur nach Aufnahme (Trapezoid → Rechteck)
- [ ] Nutzer kann Ergebnis prüfen und erneut aufnehmen
- [ ] Mehrere Aufnahmen können zu einem mehrseitigen Beleg zusammengefasst werden
- [ ] Reihenfolge der Seiten ist änderbar, einzelne Seiten löschbar

### Import
- [ ] Import aus Gerätegalerie (JPEG, PNG)
- [ ] Import von PDF-Dateien
- [ ] Importierte Bilder durchlaufen dieselbe Metadaten-Erfassung wie Kamera-Aufnahmen

### Metadaten-Erfassung (vor Upload)
- [ ] Pflichtfeld: Belegart – Auswahl aus: ER, AR, KASSE, WEITERE (mapped auf `rechnungstyp` in DB)
- [ ] Optional: Anmerkung (Freitext) → wird in Feld `beschreibung` des Belegs gespeichert
- [ ] Optional: Datum (Vorausfüllung: heute)
- [ ] Optional: Betrag (Dezimalzahl)
- [ ] Optional: Schlagwörter / Tags (Freitext, mehrere möglich)

### Upload & Integration
- [ ] Mehrseitige Belege werden client-seitig zu einer PDF zusammengefasst (1 Datei = 1 Beleg)
- [ ] Datei wird zunächst mit Temp-Name hochgeladen: `MOBIL_<uuid>.pdf`
- [ ] Beleg-Datensatz wird in `belege`-Tabelle angelegt mit `mandant_id`, `rechnungstyp`, `beschreibung`, `datum`, `betrag`, `schlagwoerter`, `quelle: 'MOBIL'`
- [ ] OCR-Pipeline (PROJ-15) wird automatisch nach Upload ausgelöst und extrahiert: Rechnungsdatum, Lieferantenname, Rechnungsnummer
- [ ] Nach erfolgreicher OCR wird die Datei in Supabase Storage **umbenannt** nach dem Schema: `TT.MM.JJJJ - lieferant_name - Rechnungsnummer.pdf` (Beispiel: `26.01.2026 - manubu_gmbh - RN-R 2026 1322.pdf`)
- [ ] Lieferantenname wird für den Dateinamen normalisiert: Kleinbuchstaben, Leerzeichen → Unterstriche, Sonderzeichen entfernt
- [ ] Wenn OCR einzelne Felder nicht erkennt: Felder bleiben leer im Dateinamen, z.B. `26.01.2026 - unbekannt - .pdf` → Nutzer kann im Web-App korrigieren
- [ ] Upload-Fortschritt wird angezeigt (Ladeindikator)
- [ ] Nach erfolgreichem Upload: Bestätigung + Option "Neuen Beleg erfassen"
- [ ] Bei Upload-Fehler: klare Fehlermeldung, Möglichkeit zum erneuten Versuch (Datei bleibt erhalten)
- [ ] Hochgeladene Belege sind sofort im Web-App unter "Belege" des Mandanten sichtbar

---

## Edge Cases

- **Kein Internet beim Upload:** Beleg + Metadaten werden lokal gespeichert (Offline-Queue), Upload wird automatisch wiederholt sobald Verbindung vorhanden
- **Upload unterbrochen (z.B. App in Hintergrund):** Upload-Queue bleibt erhalten, wird beim nächsten App-Start fortgesetzt
- **Sehr großes Dokument (viele Seiten, hohe Auflösung):** Bilder werden vor PDF-Erstellung auf max. 2048px skaliert + komprimiert (JPEG 85%) um Upload-Größe zu begrenzen
- **PDF-Import mit vielen Seiten:** Warnung ab 20 Seiten, Nutzer kann Seitenbereich auswählen
- **Biometrie nicht verfügbar (altes Gerät):** App funktioniert ohne Biometrie, nur Passwort-Login
- **Biometrie-Fehler (z.B. nasses Fingerprint):** Fallback auf Passwort-Eingabe
- **Token abgelaufen während Nutzung:** Automatischer Re-Login via Refresh-Token, bei Fehler → Logout-Hinweis
- **Falsche Belegart gewählt:** Belegart ist nach Upload im Web-App editierbar
- **Doppelter Upload (gleiches Foto zweimal):** Kein automatischer Duplikatschutz in MVP – Nutzer ist verantwortlich
- **OCR erkennt Felder nicht (schlechte Bildqualität, handgeschrieben):** Dateiname erhält Platzhalter (`unbekannt`), Beleg ist im Web-App editierbar – manuelle Korrektur von Datum, Lieferant und RN-Nummer möglich
- **OCR-Umbenennung schlägt fehl (Timeout, Fehler):** Beleg bleibt unter Temp-Name erhalten und ist trotzdem im Web-App sichtbar; Umbenennung kann bei nächster OCR-Korrektur nachgeholt werden

---

## Technical Requirements

- **Plattform:** iOS 16+ und Android 10+ (API Level 29+)
- **Framework:** React Native + Expo (SDK 52+)
- **Auth:** `@supabase/supabase-js` – gleiche Supabase-Instanz wie Web-App
- **Biometrie:** `expo-local-authentication`
- **Kamera + Kantenerkennung:** `expo-camera` + Dokumentenscan-Bibliothek (z.B. `react-native-document-scanner-plugin` oder `expo-document-scanner`)
- **PDF-Erstellung:** client-seitig aus Bildern (z.B. `react-native-pdf-lib` oder `rn-pdf-creator`)
- **Storage-Upload:** Supabase Storage (gleicher Bucket `belege` wie Web-App)
- **Offline-Queue:** lokale Speicherung via `expo-file-system` + `AsyncStorage`
- **Projektstruktur:** Separates Verzeichnis `BelegmanagerMobile/` außerhalb von `Belegmanagerv1/`
- **Deployment:** Expo EAS Build (App Store + Google Play)
- **Sicherheit:** Biometrischer Key wird im Secure Enclave / Android Keystore gespeichert, nie im AsyncStorage

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
