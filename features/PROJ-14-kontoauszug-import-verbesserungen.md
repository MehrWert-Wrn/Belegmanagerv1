# PROJ-14: Kontoauszug-Import Verbesserungen

## Status: Planned
**Created:** 2026-03-19
**Last Updated:** 2026-03-19

## Dependencies
- Requires: PROJ-4 (Kontoauszug-Import) – baut auf dem bestehenden Import-Wizard auf
- Requires: PROJ-5 (Matching-Engine) – Datumsfilter-Bug betrifft Transaktionen-Übersicht

## Hintergrund
Vier konkrete Probleme wurden beim produktiven Einsatz von PROJ-4 identifiziert:
1. Unnötige Felder in der Spaltenzuordnung (IBAN, Buchungsreferenz)
2. Datumsfilter auf der Transaktionen-Übersicht funktioniert nicht korrekt
3. CSV-Konfigurationsschritt fehlt – Upload springt sofort zum nächsten Schritt
4. Duplikat-Erkennung blockiert gültige Zeilen fälschlicherweise als Fehler

---

## User Stories

- Als Benutzer möchte ich beim CSV-Import nur relevante Felder zuordnen müssen (Datum, Betrag, Beschreibung), damit die Spaltenzuordnung übersichtlicher ist und mich nicht mit Feldern verwirrt, die ich nicht kenne.
- Als Benutzer möchte ich vor dem Weiterleiten zur Spaltenzuordnung Zeichenkodierung, Trennzeichen und Header-Zeile konfigurieren können, damit mein CSV korrekt eingelesen wird.
- Als Benutzer möchte ich nach dem Ablegen einer CSV-Datei nicht automatisch weitergeleitet werden, damit ich zuerst die Parsing-Einstellungen prüfen und bestätigen kann.
- Als Benutzer möchte ich auf der Transaktionen-Übersicht nach Datum filtern können und dabei alle Match-Status (offen, vorgeschlagen, zugeordnet) sehen, damit ich Transaktionen eines bestimmten Zeitraums vollständig überblicken kann.
- Als Benutzer möchte ich, dass nur tatsächlich doppelte Buchungszeilen als Fehler markiert werden, damit gültige Zeilen aus derselben CSV-Datei importiert werden können, auch wenn eine andere Zeile ein Duplikat ist.

---

## Acceptance Criteria

### AC-1: Spaltenzuordnung – IBAN & Buchungsreferenz entfernen
- [ ] Im Schritt "Spalten zuordnen" des Import-Wizards erscheinen IBAN und Buchungsreferenz **nicht mehr** als wählbare Zielfelder
- [ ] Pflichtfelder für die Zuordnung sind: Datum, Betrag, Beschreibung
- [ ] Optionale Felder (falls vorhanden): keine weiteren benutzer-sichtbaren Felder
- [ ] Das Matching-System verwendet IBAN und Buchungsreferenz intern weiterhin – sie werden bei vorhandener Mapping-Konfiguration aus bestehenden Daten übernommen, aber nicht neu vom Benutzer zugeordnet
- [ ] Bestehende importierte Transaktionen mit iban_gegenseite / buchungsreferenz sind nicht betroffen

### AC-2: CSV-Konfigurationsschritt vor Spalten-Zuordnung
- [ ] Nach Auswahl/Ablegen einer CSV-Datei wird **nicht automatisch** zum nächsten Schritt gewechselt
- [ ] Der Benutzer sieht einen Konfigurationsbereich mit drei Einstellungen:
  - **Zeichenkodierung:** UTF-8 (Standard) | Latin-1 (ISO-8859-1)
  - **Trennzeichen:** Semikolon `;` (Standard) | Komma `,` | Tab
  - **Erste Zeile enthält Spaltenüberschriften:** Ja (Standard) | Nein
- [ ] Erst nach Klick auf "Weiter" wird mit den gewählten Einstellungen geparst und zum Spaltenzuordnungs-Schritt gewechselt
- [ ] Eine Vorschau der ersten 3 Zeilen der CSV (roh, ungeparst) ist sichtbar, damit der Benutzer die Einstellungen prüfen kann
- [ ] Auto-Erkennung des Trennzeichens bleibt als Vorauswahl erhalten (Semikolon bei österreichischen Bankexporten)

### AC-3: Datumsfilter – alle Transaktionen sichtbar
- [ ] Wenn auf `/transaktionen` ein Datum-von/bis-Filter gesetzt wird, zeigt die Tabelle **alle** Match-Status (offen, vorgeschlagen, zugeordnet, kein_beleg) innerhalb des Zeitraums
- [ ] Die Kombination von Datumsfilter + Status-Filter funktioniert korrekt (z.B. Datum von/bis + Status "offen" zeigt nur offene Transaktionen in diesem Zeitraum)
- [ ] Das Setzen eines Datumsfilters allein verändert den Status-Filter **nicht** (er bleibt auf "Alle" wenn vorher "Alle" ausgewählt war)
- [ ] Der angezeigte Datensatz entspricht dem, was die API bei den gesendeten Parametern zurückgibt (kein implizites Status-Filtering im Frontend)

### AC-4: Duplikat-Erkennung – granulare Fehlermarkierung
- [ ] Wenn in einer CSV-Datei Zeile X ein Duplikat ist, werden nur Zeile X als "Duplikat" / Fehler markiert
- [ ] Alle anderen Zeilen der Datei werden unabhängig von Zeile X verarbeitet und importiert
- [ ] Der Import-Summary zeigt korrekt: X importiert, Y Duplikate übersprungen, Z Fehler (mit jeweiliger Zeilennummer)
- [ ] Eine einzelne Duplikat-Zeile blockiert **nicht** den Gesamtimport der Datei
- [ ] Zeilen mit echten Fehlern (fehlendes Datum, ungültiger Betrag) werden weiterhin als Fehler markiert – aber ebenfalls nur granular, ohne andere Zeilen zu blockieren

---

## Edge Cases

- **CSV nur mit Duplikaten:** Alle Zeilen sind Duplikate → Import-Summary: 0 importiert, N Duplikate übersprungen, Import gilt als erfolgreich abgeschlossen
- **Gemischte Datei:** 3 gültige, 1 Duplikat, 1 Fehler → 3 werden importiert, 1 als Duplikat markiert, 1 als Fehler markiert
- **Zeichenkodierung falsch gewählt:** Umlaute sind korrumpiert → Benutzer sieht es in der Roh-Vorschau und kann die Einstellung korrigieren, bevor er "Weiter" klickt
- **Keine Kopfzeile gewählt, aber CSV hat eine:** Erste Zeile wird als Datenzeile behandelt → Benutzer sieht es in der Spaltenzuordnungs-Vorschau
- **Datumsfilter mit sehr weit zurückliegendem Datum:** Leere Ergebnismenge → "Keine Transaktionen für diesen Zeitraum" anzeigen, kein Ladefehler
- **Statusfilter "Offen" + Datumsfilter:** Zeigt nur offene Transaktionen im Zeitraum (korrekte Kombination beider Filter)

---

## Nicht in Scope
- Entfernung von IBAN / Buchungsreferenz aus der Datenbank oder der Matching-Engine (nur UI-seitig aus der Spaltenzuordnung entfernen)
- Änderungen am Duplikat-Erkennungsalgorithmus selbst (Datum + Betrag + Buchungsreferenz bleibt die Erkennungslogik)
- Neue Filteroptionen auf der Transaktionen-Übersicht über die bestehenden hinaus

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
