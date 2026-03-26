# Belegmanager – Product Requirements Document
**MVP v2.0 | März 2026 | Mehr.Wert Gruppe GmbH**

---

## Vision

Belegmanager ist eine mandantenfähige Web-Applikation zur Buchhaltungsvorbereitung für österreichische KMUs. Kernfunktion ist das automatische Matching von Zahlungsausgängen mit Eingangsrechnungsbelegen – mit klarem Ampel-Status und Monatsabschluss-Workflow.

Ab v2 unterstützt die App beliebig viele, vom Mandanten konfigurierbare Zahlungsquellen: neben Kontoauszug und Kassabuch können pro Mandant eigene Quellen angelegt werden (z.B. Firmenkreditkarte, PayPal Business, Tankkarte DKV).

---

## Zielgruppen

**Primär: Österreichische KMUs (1–20 MA)**
- Buchhaltung intern oder durch externen Buchhalter
- Monatliche Belegablage und Übergabe an Steuerberater
- Pain Point: Manuelles Zuordnen von Kontoauszugspositionen zu Rechnungen kostet Stunden

**Sekundär: Buchhalter / Steuerberater-Assistenz**
- Prüfen und freigeben des Monatsabschlusses
- Erwarten DATEV-kompatiblen Export ohne manuelle Nacharbeit

---

## Feature-Übersicht (Roadmap)

| Priorität | Feature | Kurzbeschreibung | Status |
|-----------|---------|-----------------|--------|
| P0 (MVP) | Authentifizierung & Onboarding | Self-Signup, E-Mail-Verifizierung, Mandant anlegen, Onboarding-Wizard | Planned |
| P0 (MVP) | Kontoauszug-Matching | CSV-Import, 2-stufige Matching-Logik, Ampel-Status, manuelle Zuweisung | Planned |
| P0 (MVP) | Kassabuch | Separate Zahlungsquelle mit identischer Matching-Logik | Planned |
| P0 (MVP) | Belegverwaltung | Upload, Vorschau, Metadaten, Zuordnung zu Transaktionen | Planned |
| P0 (MVP) | Monatsabschluss-Workflow | Vollständigkeitsprüfung aller aktiven Quellen, Freigabe, Sperrung | Planned |
| P0 (MVP) | DATEV-Export | CSV-Export im DATEV-kompatiblen Format für Steuerberater | Planned |
| P1 | Zahlungsquellen-Verwaltung (v2) | Mandant konfiguriert beliebige Zusatzquellen (Kreditkarte, PayPal, Tankkarte) | Planned |
| P1 | Kommentare & Workflow | Interne Kommentare pro Transaktion, Status-Flags, Rückfragen | Planned |
| P1 | Multi-Tenant User-Rollen | Admin / Buchhalter-Rollen, Einladung per E-Mail | Planned |
| P1 | Belegverwaltung Formular-Verbesserungen | UI-Fix Dialog-Breite, Beleg-Vorschau, Auto-Berechnung Netto/Brutto, mehrere Steuerzeilen | Planned |
| P1 | OCR-Erkennung & Massenimport | OCR Auto-Fill beim Einzelupload, Massenimport mit Review-Modus | Planned |
| P2 | Reisekostenabrechnung | Eigenes Modul – bewusst aus MVP ausgelagert | Planned |

> Details zu jeder Feature (User Stories, Acceptance Criteria, Edge Cases, Tech Design) → `features/`

---

## MVP-Scope

**Im MVP (P0):**
- Kontoauszug-Matching + Kassabuch
- Belegverwaltung (Upload & Zuordnung)
- Monatsabschluss-Workflow
- DATEV-Export
- Single-Tenant-Login (Self-Signup, 1 Mandant)

**Bewusst NICHT im MVP:**
- Erweiterbare Zahlungsquellen (kommt in v2 / P1)
- Reisekostenabrechnung
- UID-Validierung, Reverse Charge, EU-Erwerbe
- UVA-Vorbereitung
- Fälligkeitsübersicht 30/60/90 Tage
- OCR / E-Mail-Import (liegt in Belegmeister)
- Doppelbeleg-Erkennung (liegt in Belegmeister)

---

## Erfolgskriterien

- Matching-Quote ≥ 80% automatisch (ohne manuelle Eingriffe)
- Monatsabschluss in < 30 Minuten (statt bisher 2–4 Stunden)
- Steuerberater kann DATEV-Export ohne Nacharbeit importieren
- Onboarding neuer Mandant in < 10 Minuten

---

## Tech Stack

| Bereich | Technologie |
|---------|-------------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui |
| Backend / DB | Supabase (PostgreSQL + RLS + Auth + Storage) |
| Hosting | Vercel (Frontend), Supabase Cloud EU Frankfurt |
| Export | DATEV-kompatibles CSV |

> Vollständiger Tech Stack, Conventions, Commands → `CLAUDE.md`

---

## Constraints

- Solo-Entwickler + Claude Code
- Österreichisches Datenschutzrecht (DSGVO), Supabase EU-Region Pflicht
- Supabase RLS für alle Tabellen – keine Datenvermischung zwischen Mandanten
- MVP-Launch: Q2 2026 angestrebt

---

*Detaillierte Feature-Specs → `features/` | Projektkontext → `CLAUDE.md`*
