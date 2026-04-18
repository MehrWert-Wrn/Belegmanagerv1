# PROJ-27: FreeFinance Provider-Setup & Kontenplan-Import

## Status: Planned
**Created:** 2026-04-17
**Last Updated:** 2026-04-17

## Dependencies
- Requires: PROJ-26 (Buchhaltungsmanager Feature-Gate) – Feature muss aktiv sein
- Requires: PROJ-24 (Sichere Zugangsdaten-Übermittlung) – Verschlüsselungsmechanismus für API-Keys wiederverwenden

---

## Overview

Mandanten konfigurieren ihren FreeFinance-Account im Belegmanager. Der API-Key wird verschlüsselt gespeichert. Der Kontenplan wird direkt aus FreeFinance importiert und lokal in der `konten`-Tabelle gespeichert. So ist kein manuelles Anlegen von Konten notwendig.

---

## User Stories

### US-1: FreeFinance API-Key hinterlegen
Als Mandant möchte ich meinen FreeFinance API-Key in den Einstellungen hinterlegen, damit der Belegmanager auf mein FreeFinance-Konto zugreifen kann.

**Acceptance Criteria:**
- [ ] Neue Einstellungsseite `/settings/buchhaltung` (nur sichtbar wenn PROJ-26 Gate aktiv)
- [ ] Formular: Provider-Auswahl (derzeit nur „FreeFinance"), API-Key-Eingabefeld (masked)
- [ ] API-Key wird AES-256-verschlüsselt in DB gespeichert (gleicher Mechanismus wie PROJ-24)
- [ ] Nach Speichern: Verbindungstest gegen FreeFinance API – Erfolgsmeldung oder Fehlermeldung
- [ ] API-Key kann jederzeit aktualisiert oder gelöscht werden
- [ ] Gelöschter API-Key → alle Buchungs-Sync-Operationen werden gestoppt, Vorkontierungen bleiben erhalten

### US-2: Kontenplan aus FreeFinance importieren
Als Mandant möchte ich meinen bestehenden Kontenplan direkt aus FreeFinance importieren, damit ich keine Konten manuell anlegen muss.

**Acceptance Criteria:**
- [ ] Button „Kontenplan importieren" auf `/settings/buchhaltung`
- [ ] Import ruft FreeFinance API `/accounts` (oder äquivalenten Endpunkt) ab
- [ ] Importierte Konten werden in Tabelle `konten` gespeichert: `kontonummer`, `bezeichnung`, `kontentyp` (Aufwand/Erlös/Aktiva/Passiva), `mwst_code`, `aktiv`
- [ ] Bereits vorhandene Konten werden per `kontonummer` abgeglichen und aktualisiert (Upsert)
- [ ] Nach Import: Anzahl importierter/aktualisierter Konten als Bestätigung anzeigen
- [ ] Import kann jederzeit erneut ausgeführt werden (Sync)

### US-3: Kontenplan einsehen
Als Mandant möchte ich meinen importierten Kontenplan einsehen und bei Bedarf einzelne Konten deaktivieren können.

**Acceptance Criteria:**
- [ ] Kontenplan-Liste auf `/settings/buchhaltung/kontenplan` (oder als Abschnitt auf der Settings-Seite)
- [ ] Spalten: Kontonummer, Bezeichnung, Typ, MwSt-Code, Status (aktiv/inaktiv)
- [ ] Suchfeld nach Kontonummer oder Bezeichnung
- [ ] Konto kann deaktiviert werden (erscheint dann nicht mehr in Vorkontierungs-Dropdowns)
- [ ] Konto kann reaktiviert werden
- [ ] Konto kann NICHT gelöscht werden wenn es bereits in einer Vorkontierung verwendet wird (Fehlermeldung)

### US-4: Verbindungsstatus anzeigen
Als Mandant möchte ich jederzeit sehen, ob meine FreeFinance-Verbindung aktiv ist.

**Acceptance Criteria:**
- [ ] Status-Chip auf der Einstellungsseite: „Verbunden" (grün) / „Nicht verbunden" (grau) / „Fehler" (rot)
- [ ] „Verbindung testen"-Button ruft FreeFinance API auf und zeigt aktuellen Status
- [ ] Bei fehlgeschlagenem API-Key (401 von FreeFinance): Status wechselt auf „Fehler", klarer Hinweis „API-Key ungültig oder abgelaufen"

---

## Edge Cases

- FreeFinance-API nicht erreichbar beim Import → Fehlermeldung, kein teilweiser Import; bestehende Konten bleiben unverändert
- FreeFinance-API gibt leere Kontenliste zurück → Bestätigung „0 Konten gefunden", keine Löschung bestehender Konten
- Mandant hat Konten manuell angelegt (falls UI das erlaubt) und importiert dann → manuelle Konten bleiben, FreeFinance-Konten werden per `kontonummer` abgeglichen
- API-Key wird geändert → bestehende Konten bleiben (sie gehören zum Mandanten), neuer Import-Zyklus beginnt
- Kontonummer existiert in FreeFinance und in lokaler DB mit unterschiedlicher Bezeichnung → FreeFinance-Bezeichnung gewinnt beim Import (Upsert)
- Mandant versucht `/settings/buchhaltung` aufzurufen ohne aktives Feature-Gate → Redirect auf `/settings`

---

## Data Model

### Neue Tabelle: `konten`
- `id` uuid PK
- `mandant_id` uuid → mandanten.id (RLS)
- `kontonummer` text NOT NULL
- `bezeichnung` text NOT NULL
- `kontentyp` text: `aufwand | erloes | aktiva | passiva | sonstige`
- `mwst_code` text nullable (z.B. „20%", „10%", „0%", „befreit")
- `aktiv` boolean DEFAULT true
- `quelle` text: `freefinance | manuell`
- `freefinance_id` text nullable (externe ID für Sync)
- `created_at` timestamp
- `updated_at` timestamp
- UNIQUE(`mandant_id`, `kontonummer`)

### Neue Tabelle: `buchhaltung_provider_config`
- `id` uuid PK
- `mandant_id` uuid → mandanten.id (RLS, UNIQUE)
- `provider` text: `freefinance | sevdesk`
- `api_key_encrypted` text NOT NULL
- `api_key_iv` text NOT NULL (Initialization Vector für AES-256)
- `verbunden_seit` timestamp nullable
- `letzter_import` timestamp nullable
- `created_at` timestamp
- `updated_at` timestamp

---

## Technical Requirements

- Security: API-Key niemals im Klartext in DB oder Logs
- Security: Verschlüsselung serverseitig (API Route), nie im Frontend
- Security: RLS auf `konten` und `buchhaltung_provider_config` – Mandant sieht nur eigene Daten
- FreeFinance API-Dokumentation prüfen: Rate Limits, Authentifizierungsformat (Bearer/API-Key-Header)
- Verbindungstest darf nicht den vollständigen Kontenplan laden (kostengünstiger Endpunkt verwenden)

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
