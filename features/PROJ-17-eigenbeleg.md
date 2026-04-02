# PROJ-17: Eigenbeleg-Erstellung

**Status:** In Progress  
**Erstellt:** 2026-04-02

---

## Übersicht

Für jede Transaktion soll ein Eigenbeleg erstellt werden können, der automatisch in der Belegverwaltung abgelegt wird. Ein Eigenbeleg dient als interner Nachweis, wenn kein regulärer Fremdbeleg vorhanden ist.

## User Stories

- Als Buchhalterin möchte ich für eine Transaktion ohne reguläre Rechnung einen Eigenbeleg erstellen, damit die Transaktion trotzdem ordnungsgemäß belegt ist.
- Als Buchhalterin möchte ich, dass der Eigenbeleg automatisch mit einer laufenden Nummer (pro Jahr) versehen wird.
- Als Buchhalterin möchte ich die Firmenangaben (Name, Adresse) aus dem Mandantenprofil vorausgefüllt sehen.

## Anforderungen

### Pflichtfelder im Eigenbeleg
- **Bezeichnung:** `Eigenbeleg_[laufende Nummer]` (auto-generiert)
- **Name und Adresse des Unternehmens** (aus Mandantenprofil vorausgefüllt)
- **Datum der Ausgabe / des Vorgangs** (aus Transaktion vorausgefüllt)
- **Beschreibung der Ausgabe** (Freitext, Pflichtfeld)
- **Betrag brutto** (aus Transaktion vorausgefüllt)
- **MwSt-Satz** (Auswahl: 0%, 5%, 10%, 13%, 20%) → Nettobetrag wird automatisch berechnet
- **Grund, warum kein regulärer Beleg vorhanden ist** (Freitext, Pflichtfeld)
- **Laufende Nummer** (auto-generiert, Format: `NNN/JJJJ`)

### Verhalten
- Button „Eigenbeleg erstellen" erscheint im Transaktion-Detail-Sheet für Transaktionen mit `match_status = 'offen'`
- Nach Erstellung: Transaktion wird automatisch als `match_status = 'bestaetigt'` markiert (match_type = 'EIGENBELEG')
- Eigenbeleg erscheint in der Belegverwaltung mit `rechnungstyp = 'eigenbeleg'`
- Laufende Nummer ist pro Mandant und Jahr eindeutig (z.B. `001/2026`, `002/2026`)

## Technisches Design

### DB-Änderungen
- `rechnungstyp_enum`: neuer Wert `'eigenbeleg'`
- `belege.storage_path`: nullable (Eigenbelege haben keine Datei)
- `belege.original_filename`: nullable
- `belege.eigenbeleg_laufnummer`: INTEGER (nullable)
- `belege.eigenbeleg_jahr`: INTEGER (nullable)
- `belege.kein_beleg_grund`: TEXT (nullable)
- Unique Index auf `(mandant_id, eigenbeleg_jahr, eigenbeleg_laufnummer)` WHERE NOT NULL

### Neue API-Routen
- `GET /api/mandant` – Gibt Mandant-Profil zurück (firmenname, strasse, plz, ort)
- `POST /api/transaktionen/[id]/eigenbeleg` – Erstellt Eigenbeleg für Transaktion

### Neue UI-Komponenten
- `eigenbeleg-dialog.tsx` – Dialog-Formular zur Eigenbeleg-Erstellung

### Geänderte UI-Komponenten
- `transaktion-detail-sheet.tsx` – Button „Eigenbeleg erstellen" für offene Transaktionen

## Acceptance Criteria

- [ ] Eigenbeleg kann für offene Transaktionen erstellt werden
- [ ] Laufende Nummer wird automatisch pro Mandant und Jahr vergeben
- [ ] Firmenname und Adresse aus Mandantenprofil sind vorausgefüllt
- [ ] Datum und Bruttobetrag aus Transaktion sind vorausgefüllt
- [ ] Nettobetrag wird aus Brutto und MwSt-Satz berechnet
- [ ] Nach Erstellung ist Transaktion als `bestaetigt` markiert
- [ ] Eigenbeleg erscheint in der Belegverwaltung
- [ ] Monatsabschluss wird respektiert (kein Eigenbeleg für gesperrte Monate)
