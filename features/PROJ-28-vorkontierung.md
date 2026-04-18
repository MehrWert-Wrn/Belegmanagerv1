# PROJ-28: Vorkontierung

## Status: Planned
**Created:** 2026-04-17
**Last Updated:** 2026-04-17

## Dependencies
- Requires: PROJ-26 (Buchhaltungsmanager Feature-Gate) – Feature muss aktiv sein
- Requires: PROJ-27 (FreeFinance Setup & Kontenplan) – Konten müssen vorhanden sein
- Requires: PROJ-5 (Matching-Engine) – Transaktion muss existieren (mit oder ohne zugeordnetem Beleg)
- Empfohlen: PROJ-6 (Manuelle Zuordnung) – Beleg sollte einer Transaktion zugeordnet sein für vollständige Vorkontierung

---

## Overview

Für jede Transaktion kann ein Buchungssatz (Vorkontierung) angelegt werden. Der Buchungssatz besteht aus Soll-Konto, Haben-Konto, Betrag, MwSt-Satz und Buchungstext. Er wird im Transaktions-Detail als neues Panel angezeigt. Status zeigt an ob der Buchungssatz bereits in FreeFinance gebucht wurde.

---

## User Stories

### US-1: Vorkontierung anlegen
Als Mandant möchte ich für eine Transaktion einen Buchungssatz anlegen können, damit die Buchung für meinen Buchhalter oder für die automatische Übertragung zu FreeFinance vorbereitet ist.

**Acceptance Criteria:**
- [ ] Neues Panel „Buchungssatz" im Transaktions-Detail (rechts oder unterhalb der bestehenden Infos)
- [ ] Panel nur sichtbar wenn Buchhaltungsmanager Feature-Gate aktiv
- [ ] Formular-Felder:
  - Soll-Konto (Pflicht): Dropdown mit Suche aus `konten`-Tabelle (Kontonummer + Bezeichnung)
  - Haben-Konto (Pflicht): Dropdown mit Suche aus `konten`-Tabelle
  - Betrag (Pflicht): Vorausgefüllt mit Transaktionsbetrag (editierbar)
  - MwSt-Satz (Pflicht): Dropdown (0%, 10%, 13%, 20%, befreit) – Vorauswahl aus Soll-Konto MwSt-Code wenn verfügbar
  - Buchungstext (optional): Vorausgefüllt mit Transaktions-Verwendungszweck (editierbar, max. 100 Zeichen)
- [ ] Speichern-Button erstellt Eintrag in `vorkontierungen`-Tabelle
- [ ] Status nach Speichern: „Vorgemerkt"

### US-2: Vorkontierung bearbeiten
Als Mandant möchte ich eine bestehende Vorkontierung korrigieren können, solange sie noch nicht in FreeFinance gebucht ist.

**Acceptance Criteria:**
- [ ] Bestehende Vorkontierung im Panel editierbar (Inline-Edit oder Edit-Button)
- [ ] Bearbeitung nur möglich wenn Status = „Vorgemerkt" (nicht wenn „Gebucht" oder „In Übertragung")
- [ ] Nach Speichern: Status bleibt „Vorgemerkt", `updated_at` wird aktualisiert
- [ ] Versuch bei Status = „Gebucht": Fehlermeldung „Bereits in FreeFinance gebucht – Änderung nicht möglich"

### US-3: Vorkontierungs-Status einsehen
Als Mandant möchte ich auf einen Blick sehen, welche Transaktionen bereits vorkontiert sind und welche noch fehlen.

**Acceptance Criteria:**
- [ ] Status-Badge in der Transaktionsliste (neben dem Ampel-Status): 
  - Kein Icon: keine Vorkontierung
  - Stift-Icon (grau): Vorgemerkt
  - Check-Icon (grün): Gebucht
  - Warnung-Icon (rot): Fehler
- [ ] In der Transaktions-Detail-Ansicht: Status-Chip im Buchungssatz-Panel mit Beschriftung
- [ ] Filterung in der Transaktionsliste nach Vorkontierungs-Status (kein Filter / vorgemerkt / gebucht / fehler)

### US-4: Vorkontierung löschen
Als Mandant möchte ich eine fehlerhafte Vorkontierung löschen können.

**Acceptance Criteria:**
- [ ] Löschen-Button im Buchungssatz-Panel (nur sichtbar wenn Status = „Vorgemerkt")
- [ ] Bestätigungsdialog vor dem Löschen
- [ ] Löschen nicht möglich wenn Status = „Gebucht" (Fehlermeldung mit Verweis auf Stornierung in FreeFinance)
- [ ] Löschen bei Status = „Fehler" → erlaubt (Neuanlegen möglich)

### US-5: Übersicht aller Vorkontierungen
Als Mandant möchte ich eine Übersicht aller Vorkontierungen des Monats sehen, damit ich vor der Übertragung alles prüfen kann.

**Acceptance Criteria:**
- [ ] Neue Seite `/buchhaltung/vorkontierungen` (nur sichtbar wenn Feature-Gate aktiv)
- [ ] Tabelle: Datum, Transaktion (Verwendungszweck), Betrag, Soll-Konto, Haben-Konto, MwSt, Status
- [ ] Filterung nach Monat (Standard: aktueller Monat)
- [ ] Filterung nach Status
- [ ] Kennzahlen oben: Anzahl vorgemerkt / gebucht / fehler im gewählten Monat

---

## Edge Cases

- Transaktion hat keinen zugeordneten Beleg → Vorkontierung trotzdem möglich (Beleg optional)
- Betrag der Vorkontierung weicht vom Transaktionsbetrag ab → erlaubt (z.B. bei Teilbeträgen), aber visueller Hinweis wenn Abweichung > 0,01 €
- Mandant legt zwei Vorkontierungen für dieselbe Transaktion an → nur eine Vorkontierung pro Transaktion erlaubt (DB-Constraint + UI-Verhinderung; stattdessen Edit anbieten)
- Transaktion wird gelöscht → Vorkontierung bleibt in DB (Status = „Waise"), wird in Übersicht mit Warnung angezeigt
- Vorkontierungs-Status = „Fehler" und Mandant versucht erneut zu speichern → Status zurück auf „Vorgemerkt", Fehlerdetail wird überschrieben
- Konto wird deaktiviert, ist aber in bestehender Vorkontierung → Vorkontierung bleibt valid, Konto in Dropdown als „(inaktiv)" angezeigt
- Kontenplan leer (noch kein Import) → Panel zeigt Hinweis „Bitte zuerst Kontenplan importieren" mit Link zu `/settings/buchhaltung`

---

## Data Model

### Neue Tabelle: `vorkontierungen`
- `id` uuid PK
- `mandant_id` uuid → mandanten.id (RLS)
- `transaktion_id` uuid → transaktionen.id (NOT NULL, UNIQUE – eine Vorkontierung pro Transaktion)
- `beleg_id` uuid nullable → belege.id
- `soll_konto_id` uuid → konten.id NOT NULL
- `haben_konto_id` uuid → konten.id NOT NULL
- `betrag` numeric(12,2) NOT NULL
- `mwst_satz` text NOT NULL (z.B. „20%", „10%", „0%", „befreit")
- `buchungstext` text nullable (max. 100 Zeichen)
- `status` text: `vorgemerkt | in_uebertragung | gebucht | fehler` DEFAULT `vorgemerkt`
- `fehler_details` text nullable (Fehlermeldung von FreeFinance API)
- `freefinance_buchung_id` text nullable (ID der Buchung in FreeFinance nach Sync)
- `gebucht_am` timestamp nullable
- `created_at` timestamp
- `updated_at` timestamp

---

## Technical Requirements

- Security: RLS auf `vorkontierungen` – Mandant sieht/ändert nur eigene Daten
- Performance: Konten-Dropdown mit Suche muss bei 500+ Konten performant sein (serverseitige Suche, nicht alles laden)
- Validierung: Soll-Konto ≠ Haben-Konto (DB-Check-Constraint + Client-Validierung)
- UX: Konten-Dropdown zeigt Kontonummer + Bezeichnung, durchsuchbar nach beidem

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
