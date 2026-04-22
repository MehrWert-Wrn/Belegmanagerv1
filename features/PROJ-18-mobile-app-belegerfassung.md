# PROJ-18: Mobile App – Belegerfassung (iOS & Android)

## Status: In Progress
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

### Projektstruktur
Separates Projekt `BelegmanagerMobile/` (Expo Managed Workflow). Teilt dasselbe Supabase-Backend mit der Web-App — kein neues Backend nötig.

---

### Screen-Struktur

```
App
+-- Auth Stack (nicht eingeloggt)
|   +-- Login Screen (E-Mail + Passwort)
|   +-- Biometrie-Freischaltung (nach erstem Login)
|
+-- Main Stack (eingeloggt)
    +-- Beleghistorie Screen (Startscreen, außer "Kamera beim Start" aktiv)
    |   +-- Leer-Zustand: "Fügen Sie Ihr erstes Dokument hinzu" + "+" (zentriert)
    |   +-- Beleg-Liste (wenn Belege vorhanden)
    |   |   +-- Beleg-Karte: Lieferant · Datum · Betrag · Belegart
    |   |   +-- Status-Badge: "Wird verarbeitet..." / "OCR fertig" / "Duplikat"
    |   +-- FAB "+" (rechts unten) → Aktionsmenü:
    |       +-- Kamera öffnen
    |       +-- Foto aus Galerie auswählen
    |       +-- PDF aus Dateien auswählen
    |
    +-- Kamera / Scan Screen
    |   +-- Echtzeit-Kantenerkennung + Scan Overlay
    |   +-- Aufnahme-Button
    |
    +-- Seiten-Preview Screen
    |   +-- Seiten-Thumbnails (Reihenfolge änderbar, Seiten löschbar)
    |   +-- "Seite hinzufügen" / "Weiter"
    |
    +-- Upload & OCR Screen
    |   +-- Fortschrittsanzeige (Upload läuft)
    |   +-- "OCR liest Dokument..." (nach Upload, Polling alle 2s, max. 30s)
    |   +-- Timeout nach 30s → weiter mit leeren Feldern
    |
    +-- Metadaten Screen
    |   +-- Lieferant (vorausgefüllt durch OCR, editierbar)
    |   +-- Rechnungsdatum (vorausgefüllt durch OCR, editierbar)
    |   +-- Betrag (vorausgefüllt durch OCR, editierbar)
    |   +-- Belegart-Auswahl ER/AR/KASSE/WEITERE [Pflicht, immer manuell]
    |   +-- Anmerkung (Freitext)
    |   +-- Schlagwörter / Tags
    |   +-- ⚠ Duplikat-Warnung (wenn erkannt: Lieferant + Datum des Originals)
    |   +-- "Speichern" / "Trotzdem speichern" (bei Duplikat)
    |
    +-- Erfolgs-Screen
    |   +-- Bestätigung + "Neuen Beleg erfassen"
    |
    +-- Einstellungen Screen (via Icon in der Navigation)
        +-- Sektion: Sicherheit
        |   +-- "Face ID verwenden"  [Toggle]
        |   +-- "PIN verwenden"  [Toggle]
        |       → Bei Aktivierung: PIN einmalig setzen (4–6 Stellen, Bestätigung)
        |       → Face ID und PIN können gleichzeitig aktiv sein
        +-- Sektion: Allgemein
        |   +-- "Kamera beim Start öffnen"  [Toggle]
        |       → ein: App startet direkt auf Kamera-Screen
        |       → aus: App startet auf Beleghistorie (Standard)
        +-- Sektion: Kontakt
            +-- "Support kontaktieren" → mailto:support@belegmanager.at
            +-- "Webseite" → belegmanager.at im Browser
            +-- App-Version (statischer Text)
```

---

### Datenfluss (9 Schritte)

```
1.  Login → Supabase Auth JWT
2.  Biometrie / PIN → JWT verschlüsselt im Secure Enclave / Android Keystore
3.  Dokument aufnehmen oder importieren (Kamera / Galerie / PDF)
4.  Mehrere Seiten → client-seitig zu 1 PDF (max. 2048px, JPEG 85%)
5.  SHA-256 Hash berechnen → GET /api/belege/check-hash
    → Duplikat gefunden? → Warnung für Metadaten-Screen vorbereiten
6.  PDF → Upload in Supabase Storage: belege/mandant_id/MOBIL_<uuid>.pdf
7.  Beleg-Datensatz anlegen (quelle: 'MOBIL', ocr_status: 'pending')
8.  OCR triggern → POST /api/belege/{id}/ocr → Polling alle 2s, max. 30s
    → Ergebnis: Lieferant, Datum, Betrag → Metadaten-Screen vorausfüllen
    → Timeout: Metadaten-Screen öffnet mit leeren Feldern
9.  User bestätigt Metadaten → Beleg-Record final aktualisiert
    → Beleghistorie zeigt Beleg mit echtem Lieferantennamen
```

---

### Start-Logik (Kamera-Toggle)

```
App-Start nach Login / Biometrie:
  "Kamera beim Start" = an  → direkt zu Kamera Screen
  "Kamera beim Start" = aus → direkt zu Beleghistorie (Standard)
```

---

### PIN + Face ID Zusammenspiel

| Face ID | PIN | Verhalten beim App-Start |
|---|---|---|
| an | – | Face ID → bei Fehler: Passwort-Fallback |
| – | an | PIN-Eingabe |
| an | an | Face ID zuerst → bei Fehler: PIN-Eingabe |
| aus | aus | Direkt eingeloggt (kein Sperrscreen) |

---

### Duplikat-Erkennung

```
Zeitpunkt: Nach PDF-Erstellung, VOR Upload
Methode:   SHA-256 Hash → GET /api/belege/check-hash (existiert bereits)

Ergebnis A – kein Duplikat:     → Upload läuft normal
Ergebnis B – Duplikat gefunden: → ⚠ Banner auf Metadaten-Screen
                                 → "Abbrechen" oder "Trotzdem speichern"
                                 → Bei Speichern: Tag 'duplikat' wird gesetzt
```

---

### Beleghistorie

- Zeigt alle Belege des Mandanten, neueste zuerst
- Anzeigename: Lieferant + Rechnungsdatum (aus OCR) — bei laufender OCR: "Wird verarbeitet..."
- Duplikat-Badge auf entsprechend markierten Belegen
- Pull-to-Refresh
- Datenquelle: Supabase-Query direkt auf `belege`-Tabelle (RLS sichert Mandanten-Isolation)

---

### Backend-Änderungen

Keine neuen API-Routen. Mobile nutzt ausschließlich bestehende Infrastruktur:

| Endpoint | Zweck |
|---|---|
| Supabase Auth direkt | Login, Session, Refresh |
| Supabase Storage direkt | Upload |
| Supabase DB direkt | `belege`-Tabelle lesen/schreiben |
| `GET /api/belege/check-hash` | Duplikat-Erkennung (existiert) |
| `POST /api/belege/{id}/ocr` | OCR auslösen (existiert) |

Einzige mögliche DB-Migration: `'MOBIL'` als neuen Wert im `quelle`-Feld ergänzen.

---

### Einstellungen – Datenspeicherung

| Einstellung | Speicherort |
|---|---|
| Face ID an/aus | `expo-secure-store` (verschlüsselt) |
| PIN (Wert) | `expo-secure-store` (verschlüsselt, nie Klartext) |
| PIN an/aus | `expo-secure-store` |
| Kamera beim Start | `AsyncStorage` (nicht sicherheitskritisch) |

---

### Abhängigkeiten (neue Bibliotheken)

| Paket | Zweck |
|---|---|
| `@supabase/supabase-js` | Auth + Storage + DB |
| `expo-camera` | Kamera |
| `react-native-document-scanner-plugin` | Kantenerkennung + Perspektivkorrektur |
| `react-native-pdf-lib` | Client-seitige PDF-Erstellung |
| `expo-local-authentication` | Face ID / Fingerprint |
| `expo-secure-store` | Verschlüsselter JWT- und PIN-Speicher |
| `expo-file-system` | Offline-Queue (lokale Datei-Speicherung) |
| `@react-native-async-storage/async-storage` | Offline-Queue Metadaten + App-Einstellungen |
| `expo-image-picker` | Foto-Import aus Galerie |
| `expo-document-picker` | PDF-Import aus Dateien |
| `react-native-reanimated` | FAB-Animation, Aktionsmenü |

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
