# PROJ-15: Belegverwaltung Formular-Verbesserungen

## Status: Planned
**Created:** 2026-03-26
**Last Updated:** 2026-03-26

## Dependencies
- Requires: PROJ-3 (Belegverwaltung) – baut auf bestehendem Upload-Dialog und Beleg-Detail-Sheet auf

## User Stories
- Als Benutzer möchte ich, dass der Upload-Dialog immer vollständig sichtbar ist, auch wenn der Dateiname sehr lang ist, damit ich alle Felder ausfüllen kann.
- Als Benutzer möchte ich den hochgeladenen Beleg im Upload-Dialog und in der Belegtabelle anklicken können, damit er sich in einem neuen Browser-Tab öffnet und ich die Inhalte ablesen kann.
- Als Benutzer möchte ich, dass Brutto automatisch berechnet wird, wenn ich Netto und MwSt-Satz eingebe (und umgekehrt), damit ich nicht selbst rechnen muss.
- Als Benutzer möchte ich bei Belegen mit gemischten Steuersätzen mehrere Steuerzeilen (Netto + MwSt-Satz + Brutto) hinzufügen können, damit ich jeden Anteil korrekt erfassen kann.
- Als Benutzer möchte ich unterhalb der Steuerzeilen eine automatisch berechnete Summenzeile sehen (Summe Netto / Summe Brutto), damit ich den Gesamtbetrag auf einen Blick erkenne.

## Acceptance Criteria

### UI-Fix: Dialog-Breite & Dateiname
- [ ] Dialog-Breite wird auf `max-w-2xl` (statt `max-w-lg`) erhöht, damit alle 3-spaltige Gruppen ohne horizontales Scrollen sichtbar sind
- [ ] Dateiname in der Datei-Vorschauzeile wird mit `truncate` abgeschnitten und zeigt einen Tooltip mit dem vollen Namen beim Hover
- [ ] Kein horizontales Überlaufen (overflow-x) bei langen Dateinamen

### Beleg-Vorschau (klickbar)
- [ ] In der Datei-Vorschauzeile (Step 2 des Upload-Dialogs) gibt es einen klickbaren Bereich oder Button „Vorschau öffnen"
- [ ] Klick öffnet die Datei in einem neuen Browser-Tab via Signed URL (für PDFs: `target="_blank"`, für Bilder: direktes Öffnen)
- [ ] In der Belegtabelle (Spalte „Dokument") ist der bestehende Link ebenfalls als klickbarer Button mit Icon sichtbar und öffnet in neuem Tab
- [ ] Signed URL wird on-demand geholt (über `/api/belege/[id]/signed-url`)
- [ ] Bei noch nicht gespeichertem Upload (Step 2, Datei noch lokal): `URL.createObjectURL` wird verwendet

### Auto-Berechnung Netto ↔ Brutto
- [ ] Wenn Nettobetrag geändert wird UND ein MwSt-Satz ausgewählt ist: Bruttobetrag wird automatisch berechnet (`netto * (1 + mwst/100)`, gerundet auf 2 Dezimalstellen)
- [ ] Wenn Bruttobetrag geändert wird UND ein MwSt-Satz ausgewählt ist: Nettobetrag wird automatisch berechnet (`brutto / (1 + mwst/100)`, gerundet auf 2 Dezimalstellen)
- [ ] Wenn MwSt-Satz geändert wird: Wenn Nettobetrag vorhanden → Brutto neu berechnen; wenn nur Brutto vorhanden → Netto neu berechnen
- [ ] Wenn MwSt-Satz auf „Keine Angabe" gesetzt wird: keine automatische Berechnung, Felder bleiben wie sie sind
- [ ] Auto-Berechnung gilt für JEDE Steuerzeile einzeln (nicht nur die erste)

### Mehrere Steuerzeilen
- [ ] Unter der ersten Betrag-Zeile (Netto / MwSt-Satz / Brutto) gibt es einen Button „+ Zeile hinzufügen"
- [ ] Jede zusätzliche Zeile hat dieselben Felder: Nettobetrag, MwSt-Satz, Bruttobetrag
- [ ] Jede Zeile hat einen Entfernen-Button (Mülleimer-Icon); mindestens 1 Zeile bleibt immer bestehen
- [ ] Maximum 5 Steuerzeilen (danach ist „+ Zeile hinzufügen" deaktiviert)
- [ ] Unterhalb aller Steuerzeilen erscheint eine Summenzeile: „Gesamt: Netto [Summe] | Brutto [Summe]" (fett, grau hinterlegt), die sich automatisch aktualisiert
- [ ] Beim Speichern werden alle Steuerzeilen addiert: `bruttobetrag` = Summe aller Bruttobeträge, `nettobetrag` = Summe aller Nettobeträge; `mwst_satz` = MwSt-Satz der ersten Zeile (für Kompatibilität mit bestehendem Datenbankschema)
- [ ] Die Summenzeile erscheint nur, wenn mehr als 1 Steuerzeile vorhanden ist

## Edge Cases
- Dateiname mit 200+ Zeichen: wird abgeschnitten, Tooltip zeigt vollen Namen
- Nettobetrag = 0: Brutto wird korrekt als 0 berechnet (kein NaN)
- MwSt-Satz 0%: Netto = Brutto (keine Division durch Null)
- Benutzer löscht berechneten Bruttobetrag manuell: kein erneutes Überschreiben bis eine andere Eingabe erfolgt
- Steuerzeile mit leerem Netto und Brutto: wird für die Summe als 0 gewertet
- PDF im Upload-Dialog (lokale Datei, noch nicht gespeichert): `createObjectURL` funktioniert für PDFs in modernen Browsern (Chrome, Firefox, Safari) korrekt
- Signed URL abgelaufen: Fehler-Toast mit Hinweis „Vorschau konnte nicht geladen werden"

## Technical Requirements
- Auto-Berechnung: clientseitig mit `useWatch` aus react-hook-form, kein Server-Round-Trip
- Mehrere Steuerzeilen: `useFieldArray` aus react-hook-form
- Datenbankschema bleibt unverändert: Summen werden beim Submit zusammengerechnet
- Browser-Support: Chrome, Firefox, Safari (aktuelle Versionen)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
