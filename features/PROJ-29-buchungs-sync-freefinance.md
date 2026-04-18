# PROJ-29: Buchungs-Sync FreeFinance

## Status: Planned
**Created:** 2026-04-17
**Last Updated:** 2026-04-17

## Dependencies
- Requires: PROJ-26 (Buchhaltungsmanager Feature-Gate) – Feature muss aktiv sein
- Requires: PROJ-27 (FreeFinance Setup & Kontenplan) – API-Key + Konten müssen vorhanden sein
- Requires: PROJ-28 (Vorkontierung) – Vorkontierung muss existieren (Status „Vorgemerkt")

---

## Overview

Vorkontierungen mit Status „Vorgemerkt" werden via FreeFinance API als Buchungen übertragen. Der Mandant kann Buchungen einzeln oder als Batch übertragen. Nach erfolgreicher Übertragung wechselt der Status auf „Gebucht" und die FreeFinance-Buchungs-ID wird gespeichert. Bei Fehlern: klare Fehlermeldung + Retry möglich.

---

## User Stories

### US-1: Einzelne Buchung übertragen
Als Mandant möchte ich eine einzelne Vorkontierung manuell nach FreeFinance übertragen können, um sie sofort zu buchen.

**Acceptance Criteria:**
- [ ] Button „Nach FreeFinance übertragen" im Buchungssatz-Panel (nur wenn Status = „Vorgemerkt")
- [ ] Klick startet Übertragung: Status wechselt sofort auf „In Übertragung" (Button deaktiviert)
- [ ] Bei Erfolg: Status → „Gebucht", `freefinance_buchung_id` gespeichert, `gebucht_am` gesetzt
- [ ] Bei Fehler: Status → „Fehler", `fehler_details` gespeichert, Fehlermeldung im Panel sichtbar
- [ ] Fehlermeldung enthält: technische Ursache (z.B. „Ungültiger API-Key", „Konto nicht gefunden in FreeFinance") + Button „Erneut versuchen"

### US-2: Batch-Übertragung aller vorgemerkten Buchungen
Als Mandant möchte ich alle vorgemerkten Vorkontierungen eines Monats auf einmal nach FreeFinance übertragen, um Zeit zu sparen.

**Acceptance Criteria:**
- [ ] Button „Alle vorgemerkten Buchungen übertragen" auf `/buchhaltung/vorkontierungen`
- [ ] Bestätigungsdialog: „X Buchungen werden nach FreeFinance übertragen. Fortfahren?"
- [ ] Übertragung läuft sequenziell (keine Parallelverarbeitung, um FreeFinance Rate Limits zu respektieren)
- [ ] Fortschrittsanzeige: „Buchung 3 von 12 wird übertragen..."
- [ ] Zusammenfassung nach Abschluss: „10 Buchungen erfolgreich, 2 Fehler"
- [ ] Fehlerhafte Buchungen bleiben auf Status „Fehler" – manuelle Überprüfung + Retry erforderlich

### US-3: Fehlerhafte Buchung erneut versuchen
Als Mandant möchte ich eine fehlgeschlagene Buchung erneut übertragen können, nachdem ich den Fehler behoben habe (z.B. Kontenplan-Import).

**Acceptance Criteria:**
- [ ] „Erneut versuchen"-Button bei Vorkontierungen mit Status = „Fehler"
- [ ] Vor Retry: Vorkontierung kann noch bearbeitet werden (Status zurück auf „Vorgemerkt" beim Editieren)
- [ ] Retry führt denselben API-Aufruf erneut durch
- [ ] Nach erneutem Fehler: `fehler_details` wird aktualisiert (nicht angehängt)

### US-4: FreeFinance Buchungs-Link
Als Mandant möchte ich direkt zur Buchung in FreeFinance navigieren können, um sie dort einzusehen.

**Acceptance Criteria:**
- [ ] Bei Status = „Gebucht": Link-Icon neben Status-Badge im Panel
- [ ] Klick öffnet FreeFinance-Buchung in neuem Tab (URL aus `freefinance_buchung_id` konstruiert)
- [ ] Wenn FreeFinance-URL-Schema nicht bekannt: `freefinance_buchung_id` als Text anzeigen (Copy-Button)

### US-5: Buchungs-Protokoll
Als Mandant möchte ich ein Protokoll aller Sync-Vorgänge einsehen können, damit ich nachvollziehen kann was wann gebucht wurde.

**Acceptance Criteria:**
- [ ] Neue Tabelle `buchungs_log` oder separater Abschnitt in der Vorkontierungs-Übersicht
- [ ] Protokoll zeigt: Datum/Uhrzeit, Transaktion, Betrag, Status (Erfolg/Fehler), FreeFinance-ID
- [ ] Filterung nach Monat und Status
- [ ] Protokoll-Einträge nur lesbar (kein Löschen)

---

## Edge Cases

- FreeFinance API nicht erreichbar (Timeout, 5xx) → Status „Fehler", `fehler_details` = „FreeFinance nicht erreichbar (Timeout)" – kein Retry-Loop, manueller Retry
- FreeFinance API gibt 401 zurück → Status „Fehler", `fehler_details` = „API-Key ungültig", Link zu `/settings/buchhaltung` zum Aktualisieren
- FreeFinance gibt 422 zurück (Validierungsfehler, z.B. Konto existiert nicht in FreeFinance) → Status „Fehler", FreeFinance-Fehlermeldung in `fehler_details` anzeigen
- Mandant löscht FreeFinance API-Key während Batch-Übertragung läuft → laufende Transaktion schlägt fehl (Fehler), offene werden abgebrochen mit Status „Fehler"
- Doppelt-Übertragung (Race Condition, zweifacher Klick) → `in_uebertragung`-Status verhindert zweiten API-Aufruf (nur eine aktive Übertragung pro Vorkontierung)
- FreeFinance-Buchungs-ID in Response fehlt trotz Erfolg (unerwartetes API-Verhalten) → Status „Gebucht" aber `freefinance_buchung_id = NULL`, Log-Eintrag mit Warnung
- Batch läuft, Seite wird geschlossen → API Route läuft server-seitig durch (kein Abbruch durch Client), Status wird korrekt gespeichert
- Rate Limit von FreeFinance wird erreicht → Pause + Retry nach X Sekunden (Exponential Backoff, max. 3 Versuche)

---

## Technical Requirements

- FreeFinance API: Buchungs-Endpunkt muss mit Kontonummer (nicht interner FreeFinance-ID) angesprochen werden können, ODER lokale `freefinance_id` aus Kontenplan-Import verwenden
- Security: API-Key wird serverseitig entschlüsselt, nie an Client übermittelt
- Idempotenz: `freefinance_buchung_id` als Guard gegen Doppelbuchung prüfen bevor API-Aufruf
- Timeouts: FreeFinance API-Calls mit 10s Timeout
- Logging: Alle FreeFinance API-Calls (Request + Response-Status) in Server-Logs für Debugging

---

## API Design (FreeFinance)

Die Implementierung muss gegen die FreeFinance API-Dokumentation verifiziert werden. Erwarteter Flow:
1. `POST /api/journal-entries` oder äquivalent mit: `debit_account`, `credit_account`, `amount`, `tax_code`, `description`, `date`
2. Response enthält `id` der erstellten Buchung → `freefinance_buchung_id`
3. Bei Fehler: HTTP 4xx/5xx mit Fehlerdetails

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
