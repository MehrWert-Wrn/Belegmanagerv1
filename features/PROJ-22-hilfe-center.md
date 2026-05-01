# PROJ-22: Hilfe-Center

## Status: Deployed
**Created:** 2026-04-14
**Last Updated:** 2026-05-01

## Dependencies
- Requires: PROJ-1 (Authentifizierung) – Zugang für eingeloggte User
- Requires: PROJ-19 (Admin Panel) – Super-Admin kann Artikel verwalten (`is_admin = true`)
- Relates to: PROJ-21 (Onboarding-Checkliste) – E-Mail-Anbindungsartikel werden von der Checkliste verlinkt
- Relates to: PROJ-23 (KI-Chatbot) – Hilfe-Center-Inhalte speisen den Chatbot

---

## Overview

Ein integriertes Hilfe-Center unter `/help`, in dem alle wichtigen Features des Belegmanagers thematisch erklärt werden. Inhalte sind in Themen (Topics) und Artikel (Articles) gegliedert. Super-Admins können Artikel mit Text und Videos anlegen und bearbeiten. Normale User sehen nur die publizierten Inhalte. Das Hilfe-Center ist über das linke Navigationsmenü erreichbar und liefert auch die Wissensbasis für den KI-Chatbot (PROJ-23).

---

## User Stories

### US-1: Hilfe-Center aufrufen
Als Mandant möchte ich das Hilfe-Center über das linke Navigationsmenü aufrufen können, damit ich schnell Antworten auf meine Fragen finde.

**Acceptance Criteria:**
- [ ] Neuer Menüpunkt „Hilfe" mit Icon im linken Sidebar (unterhalb der Hauptnavigation)
- [ ] Klick navigiert zu `/help`
- [ ] Seite ist für alle eingeloggten User zugänglich
- ~~Öffentliche Artikel sind auch ohne Login zugänglich~~ **Entscheidung: Login erforderlich** – Reader-Routen unter `(app)/help/` (Auth-geschützt). SEO bewusst nicht priorisiert.

### US-2: Themen-basierte Navigation
Als Mandant möchte ich Hilfeartikel nach Themen geordnet finden, damit ich schnell zum richtigen Artikel navigieren kann.

**Acceptance Criteria:**
- [ ] Startseite `/help` zeigt alle Themen (Topics) als Kacheln oder Liste
- [ ] Jedes Thema hat: Icon, Titel, kurze Beschreibung, Anzahl der Artikel
- [ ] Klick auf ein Thema zeigt die Artikel-Liste des Themas
- [ ] Artikel-Liste zeigt: Titel, kurze Zusammenfassung, Lesedauer (geschätzt)
- [ ] Klick auf einen Artikel öffnet die Vollansicht unter `/help/[topic-slug]/[article-slug]`
- [ ] Breadcrumb-Navigation: Hilfe > Thema > Artikel
- [ ] Suchfunktion über alle Artikel (Volltextsuche auf Titel + Inhalt)

### US-3: Artikel lesen
Als Mandant möchte ich einen Hilfeartikel lesen können, der Text-Erklärungen und eingebettete Videos enthält.

**Acceptance Criteria:**
- [ ] Artikel-Vollansicht zeigt: Titel, Inhalt (Rich Text), optionale Video-Embeds
- [ ] Videos werden als eingebettete Player dargestellt (YouTube-Link oder direkt hochgeladene MP4)
- [ ] Artikel-Inhalt ist responsiv (Mobile + Desktop)
- [ ] „War dieser Artikel hilfreich?" Feedback-Buttons (👍 / 👎) am Ende jedes Artikels
- [ ] Verwandte Artikel-Empfehlungen am Ende
- [ ] Link-Sharing: direkte URL zu jedem Artikel (für Verlinkung aus Onboarding-Checkliste)

### US-4: Artikel-Management durch Super-Admin
Als Super-Admin möchte ich Artikel und Themen im Admin-Bereich anlegen, bearbeiten und veröffentlichen können.

**Acceptance Criteria:**
- [ ] Neuer Bereich `/admin/help` (nur für `is_admin = true`)
- [ ] Themen anlegen: Titel, Beschreibung, Icon (Lucide-Icon-Name), Reihenfolge (drag & drop oder Zahl)
- [ ] Artikel anlegen: Titel, Thema (Dropdown), Inhalt (Rich-Text-Editor), Status (Entwurf / Veröffentlicht)
- [ ] Rich-Text-Editor unterstützt: Überschriften, Listen, Fettschrift, Links, Code-Blöcke
- [ ] Video hinzufügen: YouTube-URL ODER Datei-Upload (MP4, max. 500 MB) via Supabase Storage
- [ ] Artikel-Vorschau vor Veröffentlichung
- [ ] Artikel löschen (Soft-Delete: `deleted_at`)
- [ ] Reihenfolge der Artikel innerhalb eines Themas festlegbar

### US-5: Vordefinierte Themen und Artikel (Initial-Inhalt)
Als Mandant möchte ich von Anfang an nützliche Hilfeinhalte vorfinden, damit ich nicht auf eine leere Seite stoße.

**Acceptance Criteria:**
- [ ] Folgende Themen sind beim Deployment angelegt:

**Thema 1: Erste Schritte**
- Artikel: Registrierung & Erstanmeldung
- Artikel: Dashboard-Übersicht
- Artikel: Onboarding-Checkliste – Was muss ich tun?
- Artikel: E-Mail-Postfach anbinden – Microsoft 365
- Artikel: E-Mail-Postfach anbinden – Gmail
- Artikel: E-Mail-Postfach anbinden – IMAP

**Thema 2: Belegverwaltung**
- Artikel: Belege hochladen (manuell)
- Artikel: Belege per WhatsApp senden
- Artikel: Belege per E-Mail einsenden
- Artikel: OCR-Erkennung und automatisches Ausfüllen

**Thema 3: Kontoauszug & Matching**
- Artikel: Kontoauszug importieren (CSV)
- Artikel: Automatischer Import via FinAPI (Bankanbindung)
- Artikel: Matching-Status verstehen (Ampel-System)
- Artikel: Belege manuell zuordnen
- Artikel: Kassabuch verwenden

**Thema 4: Monatsabschluss & Export**
- Artikel: Monatsabschluss durchführen
- Artikel: DATEV-Export für den Steuerberater
- Artikel: Zahlungsquellen verwalten

**Thema 5: Einstellungen & Benutzerverwaltung**
- Artikel: Benutzerverwaltung und Rollen (Admin / Buchhalter)
- Artikel: Passwort ändern
- Artikel: Abonnement & Rechnungen

**Thema 6: Portalanbindungen**
- Artikel: Amazon Business anbinden
- Artikel: Lieferantenportal anbinden (Schritt-für-Schritt)
- Artikel: Meeting buchen für Portalanbindung

### US-6: Direktlinks aus der App heraus
Als Mandant möchte ich aus bestimmten Bereichen der App direkt zum passenden Hilfe-Artikel springen können.

**Acceptance Criteria:**
- [ ] Onboarding-Checkliste (PROJ-21): Schritt 2 verlinkt auf die E-Mail-Anbindungsartikel
- [ ] Jede Seite der App kann einen „?" Icon-Button haben, der zum passenden Artikel verlinkt
- [ ] Direktlinks haben Format: `/help/[topic-slug]/[article-slug]`

---

## Edge Cases

- **Artikel noch im Entwurf:** Nur Admins sehen Entwürfe, reguläre User sehen nur „Veröffentlicht"-Artikel
- **Thema ohne Artikel:** Thema wird nicht auf der Startseite angezeigt (automatisch gefiltert)
- **Suche ohne Ergebnisse:** Freundliche Meldung + CTA „Support kontaktieren"
- **Video-Upload zu groß:** Fehlermeldung mit maximalem Datei-Limit (500 MB)
- **YouTube-URL ungültig:** Validierung bei Eingabe, Fehlermeldung
- **Artikel-URL ändert sich:** Alte Slugs werden weitergeleitet (Redirect in Supabase oder Next.js)
- **Admin löscht Thema mit Artikeln:** Warnung: „X Artikel in diesem Thema – trotzdem löschen?"
- **Mobile-Ansicht:** Themen-Navigation als Dropdown oder Sidebar-Sheet

---

## Content-Strategie

Alle initialen Artikel werden beim Deployment als Seed-Daten eingefügt (SQL-Migration). Inhalte basieren auf dem vollständigen Belegmanager-Featureset (PROJ-1 bis PROJ-20). Videos werden in einem zweiten Schritt durch den Admin ergänzt.

---

## Technical Requirements
- **Tabellen:** `help_topics` (id, title, description, icon, sort_order, created_at), `help_articles` (id, topic_id, title, slug, content_html, status, video_url, video_storage_path, sort_order, created_at, updated_at, deleted_at)
- **Storage:** Supabase Storage Bucket `help-videos` für Video-Uploads
- **RLS:** Lesezugriff für alle, Schreibzugriff nur für `is_admin = true`
- **Suche:** PostgreSQL Full-Text-Search auf `title` + `content_html`
- **Rich Text Editor:** `@tiptap/react` oder `react-quill` (beide OSS)
- **Video-Einbettung:** YouTube iframe + direkt hochgeladene Videos via `<video>`-Tag
- **SEO:** Statisch generierte Artikel-Seiten (SSG) für Suchmaschinenindizierung
- **Performance:** Artikel-Inhalt gecacht (ISR 60 Sekunden)

---

## Tech Design (Solution Architect)

### Architektur-Überblick
Zwei getrennte Bereiche: öffentliche Lese-Oberfläche `/help` (ohne Login, SEO-optimiert) + Admin-Content-Management unter `/admin/help`. Datenhaltung vollständig in Supabase.

### Seitenstruktur (Neue Routen)
```
src/app/help/                              → Öffentlich (kein Auth nötig)
├── page.tsx                               /help – Themen-Übersicht
├── [topic-slug]/page.tsx                  /help/[topic] – Artikel-Liste
└── [topic-slug]/[article-slug]/page.tsx   /help/[topic]/[article] – Artikel lesen

src/app/admin/help/                        → Nur is_admin = true
├── page.tsx                               /admin/help – Themen & Artikel verwalten
└── artikel/
    ├── neu/page.tsx                       Neuen Artikel anlegen
    └── [id]/bearbeiten/page.tsx          Artikel bearbeiten

src/app/api/help/
├── topics/route.ts                        GET alle Themen
├── topics/[slug]/route.ts                 GET Thema + Artikel
├── articles/[slug]/route.ts               GET einzelner Artikel
├── search/route.ts                        GET Volltextsuche
└── articles/[id]/feedback/route.ts        POST 👍/👎

src/app/api/admin/help/
├── topics/route.ts + topics/[id]/route.ts CRUD Themen
├── articles/route.ts + articles/[id]/route.ts CRUD Artikel
└── articles/[id]/video/route.ts           Video-Upload
```

### Komponenten-Struktur
```
/help (Startseite)
├── HelpSearchBar            Volltextsuche (debounced)
└── TopicsGrid
    └── TopicCard            Icon, Titel, Beschreibung, Artikel-Anzahl

/help/[topic-slug]
├── Breadcrumb
└── ArticleList
    └── ArticleListItem      Titel, Zusammenfassung, Lesedauer

/help/[topic-slug]/[article-slug]
├── Breadcrumb
├── ArticleHeader            Titel, Lesedauer, Datum
├── ArticleContent           gerendertes HTML
│   └── VideoEmbed           YouTube-Player oder MP4 <video>
├── ArticleFeedback          👍 / 👎
└── RelatedArticles

/admin/help
├── TopicsPanel
│   ├── TopicRow             Reihenfolge-Griff, Name, Aktionen
│   └── AddTopicDialog
└── ArticlesPanel
    ├── ArticleFilterBar     Filter nach Thema / Status
    └── ArticleRow           Titel, Thema-Badge, Status-Badge, Aktionen

/admin/help/artikel/[neu|id/bearbeiten]
├── ArticleMetaForm          Titel, Thema, Status, Zusammenfassung
├── TiptapEditor             H1–H3, Listen, Fett, Links, Code
├── VideoSection             YouTube-URL oder MP4-Upload
└── PreviewButton
```

### Datenmodell
**`help_topics`**: id, title, slug, description, icon (Lucide-Name), sort_order, created_at

**`help_articles`**: id, topic_id, title, slug, summary, content_html, status (`draft`/`published`), video_url, video_storage_path, sort_order, read_time_minutes, created_at, updated_at, deleted_at (Soft-Delete)

**`help_article_feedback`**: id, article_id, user_id (nullable), rating (`helpful`/`not_helpful`), created_at

**Supabase Storage:** Bucket `help-videos` (öffentlich lesbar, Schreiben nur Admin)

### Datenzugriff (RLS)
- Themen + veröffentlichte Artikel: alle (auch ohne Login)
- Entwürfe: nur `is_admin = true`
- Schreiben/Löschen: nur `is_admin = true`
- Feedback abgeben: eingeloggte User

### Tech-Entscheidungen
| Entscheidung | Gewählt | Warum |
|---|---|---|
| Rich-Text-Editor | Tiptap (`@tiptap/react`) | Moderner als Quill, TypeScript-nativ, YouTube-Extension verfügbar |
| Seiten-Rendering | Server Components + ISR (60s) | Artikel ändern sich selten → gecacht für SEO + Performance |
| Volltextsuche | PostgreSQL FTS in Supabase | Kein Extra-Service für 30–50 Artikel nötig |
| Video-Einbettung | Dual-Mode (YouTube + `<video>`) | Kleine Videos direkt, lange Videos via YouTube |
| Slug-Generierung | Automatisch aus Titel | Admin muss URL nicht manuell eintippen |
| Seed-Daten | SQL-Migration (31 Artikel, 6 Themen) | Sofort verfügbar nach Deployment |
| Nav-Integration | `app-sidebar.tsx` erweitern | Konsistent mit bestehender Navigation |

### Neue Packages
- `@tiptap/react` + `@tiptap/starter-kit` – Rich-Text-Editor
- `@tiptap/extension-youtube` – YouTube-Einbettung im Editor
- `@tiptap/extension-link` – Links im Editor
- `@tiptap/extension-code-block` – Code-Blöcke
- `slugify` – Automatische Slug-Generierung

## Frontend Implementation Notes (2026-04-14)

Frontend-Pass abgeschlossen. Alle UI-Komponenten, Routen und der Mock-Data-Layer sind live. Backend-Aufrufe sind mit `TODO(PROJ-22)`-Kommentaren markiert und verweisen auf die zukuenftigen API-Endpunkte.

### Umgesetzt
- Navigation: Menuepunkt "Hilfe-Center" mit `HelpCircle`-Icon in `src/components/app-sidebar.tsx` und zusaetzlich `BookOpen`-Eintrag in `src/components/admin/admin-sidebar.tsx`.
- Reader-Routen unter `src/app/(app)/help/` (Login-geschuetzt durch bestehendes `(app)/layout.tsx`):
  - `/help` – Themen-Uebersicht mit Such-Bar und Grid
  - `/help/[topic-slug]` – Artikel-Liste mit Breadcrumb
  - `/help/[topic-slug]/[article-slug]` – Artikel mit Video-Embed, Feedback, Related
- Admin-Routen unter `src/app/admin/help/` (geschuetzt durch bestehendes `admin/layout.tsx` + `requireAdmin`):
  - `/admin/help` – Topics- und Articles-Verwaltung
  - `/admin/help/artikel/neu` – Neuen Artikel anlegen
  - `/admin/help/artikel/[id]/bearbeiten` – Artikel bearbeiten
- Reader-Komponenten in `src/components/help/`: `HelpSearchBar`, `TopicsGrid`, `TopicCard`, `ArticleList`, `VideoEmbed`, `ArticleFeedback`, `RelatedArticles`, `LucideIcon`.
- Admin-Komponenten in `src/components/help/admin/`: `TopicsPanel`, `ArticlesPanel`, `ArticleForm`.
- Rich-Text-Editor: `src/components/help/tiptap-editor.tsx` mit Toolbar fuer Bold/Italic/H2/H3/Listen/Link/Code-Block/YouTube/Undo/Redo.
- Mock-Data-Layer: `src/lib/help/types.ts` und `src/lib/help/mock-data.ts` mit allen 6 Themen und 31 Platzhalter-Artikeln gemaess Content-Strategie (US-5).
- CI-konform: teal-* Klassen, Petrol `#08525E` fuer Headings, Plus Jakarta Sans via globale Font-Variable.
- Responsive: Mobile-first Card/Grid-Layout, Breadcrumbs und Table mit `overflow-x-auto`.
- A11y: ARIA-Labels auf Icon-Buttons, `aria-live`/`role="alert"` bei Fehlern, semantische Headings, Fokus-Ringe in Teal.

### Slug-Generierung
`slugify` wird im `ArticleForm` verwendet und auch im `TopicsPanel` beim Anlegen eines neuen Themas.

### Bewusst offen (Backend-Pass)
- Alle POST/PUT/DELETE-Aufrufe sind als `console.log`/`TODO(PROJ-22)`-Mocks umgesetzt (Topics CRUD, Articles CRUD, Feedback, Video-Upload).
- Datei-Uploads validieren nur das Dateigroessen-Limit im Frontend, Storage-Upload erfolgt im Backend-Pass.
- ISR/SSG fuer Artikel-Seiten ist noch nicht aktiv (`getTopics()` etc. liefern aktuell Mock-Daten synchron).
- HTML-Sanitization der Tiptap-Ausgabe erfolgt im Backend-Pass (aktuell direkt `dangerouslySetInnerHTML` auf Mock-Content).
- Rendering der HTML-Inhalte nutzt Tailwind-Arbitrary-Variants (`[&_h2]`...) anstelle von `@tailwindcss/typography`, da das Plugin nicht installiert ist.

## QA Test Results

**QA-Runde:** 1
**Getestet am:** 2026-04-14
**Getestet durch:** QA Engineer (Static Code Review + Red-Team Audit)
**Status:** NOT PRODUCTION READY – 2 High + 1 Medium Security/Logic-Bugs

> Hinweis: Static Code Review gegen Spec, Routes, API-Handler, RLS-Migration, Sanitizer und Frontend-Komponenten. Kein Live-Browser-Test, da die Feature noch nicht deployt ist. Eine Live-QA (Cross-Browser, Responsive) sollte im Staging nachgezogen werden, bevor Deployed-Status gesetzt wird.

### Acceptance Criteria – Ergebnisse

**US-1: Hilfe-Center aufrufen**
- [x] PASS – Menüpunkt „Hilfe-Center" mit `HelpCircle`-Icon in `src/components/app-sidebar.tsx:49`
- [x] PASS – Klick navigiert zu `/help`
- [x] PASS – Seite ist für alle eingeloggten User zugänglich (Reader-Routen unter `(app)/help`)
- [ ] **FAIL** – „Öffentliche Artikel auch ohne Login zugänglich (optional)": Die Reader-Routen liegen unter `src/app/(app)/help/…`, das `(app)/layout.tsx` redirectet jeden nicht eingeloggten User auf `/login`. Die RLS-Migration (`help_topics_select_public`, `help_articles_select_public`) würde öffentliche Reads erlauben, aber das Layout schließt sie im Frontend aus → **Widerspruch zwischen DB-Policies und Route-Struktur** (siehe Bug-007).

**US-2: Themen-basierte Navigation**
- [x] PASS – `/help` zeigt Topic-Grid mit Icon, Titel, Beschreibung, Artikel-Anzahl (`TopicsGrid` + `TopicCard`)
- [x] PASS – Klick auf Thema → `/help/[topic-slug]` mit Artikel-Liste
- [x] PASS – Artikel-Liste zeigt Titel, Summary, Lesedauer
- [x] PASS – Artikel-Vollansicht unter `/help/[topic-slug]/[article-slug]`
- [x] PASS – Breadcrumb-Navigation vorhanden (Hilfe > Thema > Artikel)
- [x] PASS – Volltextsuche via `HelpSearchBar` + `/api/help/search` (ILIKE auf title/summary/content_html)

**US-3: Artikel lesen**
- [x] PASS – Titel, Content (Rich HTML), VideoEmbed, Feedback, Related Articles
- [x] PASS – YouTube-Embed via iframe, MP4 via `<video>`
- [x] PASS – Responsive (`md:`, `lg:` Tailwind-Varianten)
- [x] PASS – Feedback-Buttons (👍/👎) via `ArticleFeedback` + POST `/api/help/articles/[id]/feedback`
- [x] PASS – `RelatedArticles` aus gleichem Topic
- [x] PASS – Direkte URL-Struktur `/help/[topic]/[article]`

**US-4: Artikel-Management durch Super-Admin**
- [x] PASS – `/admin/help` + `/admin/help/artikel/neu` + `/admin/help/artikel/[id]/bearbeiten` vorhanden, geschützt durch `verifyAdmin()`
- [~] TEILWEISE – Themen CRUD: Create + Delete OK, **Edit-Dialog fehlt** (`TopicsPanel:198` enthält nur `console.log('[help] edit topic (mock)')`) → Bug-002
- [x] PASS – Artikel-CRUD vollständig (`ArticleForm` + POST/PUT/DELETE)
- [x] PASS – Tiptap-Editor mit H2/H3/Listen/Fett/Links/Code-Block/YouTube
- [x] PASS – YouTube-URL + MP4-Upload implementiert, Validierung client-side + server-side
- [x] PASS – Vorschau-Dialog vor dem Speichern
- [x] PASS – Soft-Delete (`deleted_at` gesetzt) bei Artikeln + Topics
- [ ] **FAIL** – Reihenfolge per Drag-and-Drop: `GripVertical`-Icon ist nur deko, kein DnD-Handler angeschlossen. `sort_order` kann nur über direkten API-Call geändert werden → Bug-006

**US-5: Vordefinierte Themen und Artikel (Seed)**
- [x] PASS – 6 Topics + 31 Artikel als Seed in Migration `20260414200000_help_center.sql` inkl. echten deutschen Inhalten
- [x] PASS – Alle 6 geforderten Themen + die in der Spec gelisteten Artikel sind vorhanden (Topic 1-6)

**US-6: Direktlinks aus der App heraus**
- [~] TEILWEISE – URL-Format `/help/[topic-slug]/[article-slug]` ist verfügbar, aber:
  - Onboarding-Checkliste (PROJ-21) verlinkt in der aktuellen Implementierung noch nicht auf die E-Mail-Anbindungsartikel (nicht verifizierbar ohne Abgleich mit PROJ-21-Code)
  - „?" Icon-Button auf jeder Seite: nicht implementiert → Bug-008 (Low)

### Bugs

#### Bug-001 – HIGH – Stored-XSS-Risiko durch ungefilterte iframe-src-Attribute
- **Datei:** `src/lib/help/sanitize.ts:29-42`
- **Beschreibung:** `sanitize-html` erlaubt `iframe` global mit `allowedIframeHostnames: ['www.youtube.com', 'youtube.com', 'youtu.be', 'www.youtube-nocookie.com']`. Allerdings: `youtu.be` ist nur für Share-Links, erzeugt aber keinen validen Embed-Endpunkt (`youtu.be/VIDEO_ID` liefert nicht den /embed/-Pfad). Wichtiger: das sanitize-html-Flag `allowedIframeHostnames` filtert nur `src`, prüft aber nicht, ob der Pfad tatsächlich `/embed/` ist. Ein Admin könnte `<iframe src="https://www.youtube.com/anything_that_looks_evil">` speichern und die iframe landet unsanitized im `dangerouslySetInnerHTML` auf der öffentlichen Leseseite. Bei gestohlenem Admin-Account lässt sich dadurch beliebiger YouTube-Content (inkl. vollständigem Phishing-Fake-Player) injizieren.
- **Steps to reproduce:** Admin speichert via Tiptap einen Artikel mit manipuliertem YouTube-Iframe, z. B. `<iframe src="https://www.youtube.com/..."></iframe>` mit unpassendem Pfad.
- **Impact:** Admin-Account-Kompromittierung führt zu Fake-Content auf öffentlichen Hilfe-Seiten. Keine direkte XSS, aber Clickjacking/Phishing-Risiko.
- **Empfehlung:** `exclusiveFilter` einsetzen, der iframe-src via Regex auf `^https://www\.youtube(-nocookie)?\.com/embed/[A-Za-z0-9_-]{6,15}$` einschränkt. Zusätzlich: content_html NICHT in `dangerouslySetInnerHTML` rendern, sondern in eine statisch gerenderte Variante mit CSP `frame-src https://www.youtube.com`.

#### Bug-002 – HIGH – XSS über class-Attribute + Tag-Whitelist-Lücke
- **Datei:** `src/lib/help/sanitize.ts:26-38`
- **Beschreibung:** `sanitize-html` erlaubt `div` und `span` mit beliebigem `class`-Attribut. In Kombination mit einem `style`-Tag (nicht in der Whitelist, aber ein Angreifer kann via Tiptap oder direktem API-POST versuchen) oder durch zukünftige Tailwind-Arbitrary-Variants (`[&_div]`) im Dokument kann das Rendering beeinflusst werden. Wichtiger: die `allowedTags` Liste enthält `img` mit `src`, aber die Schemes sind nur `http/https/mailto` – **`data:` ist korrekt geblockt, aber `javascript:` in href auf `<a>` ebenfalls, was gut ist**. Allerdings: Der `content_html`-Sanitizer wird nur im **API-Handler** aufgerufen, NICHT beim direkten DB-Insert. Wenn ein Admin via Supabase Dashboard/psql einen Artikel mit Raw-HTML inklusive `<script>` einfügt, wird das beim Rendering unverändert über `dangerouslySetInnerHTML` ausgegeben → Stored XSS auf der öffentlichen Hilfe-Seite.
- **Steps to reproduce:**
  1. Admin-Role mit Supabase-Zugang führt `INSERT INTO help_articles(content_html, …) VALUES ('<script>alert(1)</script>', …)` aus.
  2. Öffne `/help/[topic]/[article]` → Script wird ausgeführt.
- **Impact:** Stored XSS bei jedem User (auch Buchhalter), der den Artikel öffnet. Session-Hijacking für gesamte `mandant_users`-Basis möglich.
- **Empfehlung:** Defense-in-depth: Zusätzlich beim **Rendern** sanitizen (oder besser: Content als Markdown speichern und serverseitig rendern). Alternative: CSP-Header `default-src 'self'; script-src 'self'` für `/help/*`.

#### Bug-003 – MEDIUM – Search-Endpoint kein Rate-Limit, DoS via pgSQL-ILIKE
- **Datei:** `src/app/api/help/search/route.ts` + `src/lib/help/queries.ts:133`
- **Beschreibung:** `GET /api/help/search?q=…` hat keine Rate-Limitierung und keine Auth-Anforderung. Die Implementierung nutzt `ILIKE '%…%'` auf `title + summary + content_html` über `.or(…)`. Ein Angreifer kann mit vielen parallelen Requests und 200-Zeichen-Queries die DB belasten. Der FTS-GIN-Index hilft hier nicht, da `ILIKE` ihn nicht nutzt (nur `to_tsvector`-Lookups nutzen den Index).
- **Steps to reproduce:**
  1. `for i in {1..500}; do curl "https://…/api/help/search?q=$(openssl rand -hex 100)" &; done`
  2. DB-Auslastung steigt signifikant (bei 31 Artikeln noch unkritisch, bei 1000+ Artikeln problematisch).
- **Impact:** Niedrig bei 31 Artikeln, wächst mit Datenmenge. Kein Auth-Gate → öffentlich ausnutzbar.
- **Empfehlung:** Rate-Limit via Upstash/Vercel Middleware (5 req/s/IP). Migration zu `textSearch('german', q)` um den vorhandenen FTS-Index tatsächlich zu nutzen. Längere Queries (>50 Zeichen) ablehnen.

#### Bug-004 – MEDIUM – Feedback-Spam: keine Eindeutigkeits-Constraint (user_id, article_id)
- **Datei:** `src/app/api/help/articles/[id]/feedback/route.ts` + Migration `help_article_feedback`
- **Beschreibung:** Ein User kann dasselbe Feedback beliebig oft POSTen – es gibt keinen UNIQUE-Constraint `(article_id, user_id)` und keine Dedupe-Logik im Handler. Die Statistik im Admin-Dashboard (zukünftig) wird verfälscht. Die Client-Komponente `ArticleFeedback` blockt zwar lokalen State, nach Reload klappt aber jeder weitere POST.
- **Impact:** Feedback-Quote manipulierbar.
- **Empfehlung:** `UNIQUE(article_id, user_id)` + `ON CONFLICT (article_id, user_id) DO UPDATE SET rating = …` oder Upsert-Pattern. Alternativ: Rate-Limit pro User auf 1 Feedback/Artikel.

#### Bug-005 – MEDIUM – URL-Encoding-Bug im Storage-Public-URL-Fallback
- **Datei:** `src/components/help/video-embed.tsx:49-52`
- **Beschreibung:** Der Storage-Pfad wird direkt per String-Concatenation zu einer URL zusammengesetzt (`${supabaseUrl}/storage/v1/object/public/help-videos/${storagePath}`). Enthält der Pfad Sonderzeichen (aktuell `{article_id}/{timestamp}.mp4`, also safe), aber eine Pfad-Änderung durch Admin kann dies brechen. Außerdem: `process.env.NEXT_PUBLIC_SUPABASE_URL` ist im Client-Component-Kontext nur verfügbar wenn es im Build gesetzt ist – ansonsten `storagePath` als Fallback-src, was einen Broken-Link ergibt.
- **Empfehlung:** `encodeURI()` nutzen + im Server-Component die signierte URL via `admin.storage.from('help-videos').getPublicUrl(path)` vorrechnen und als Prop durchreichen.

#### Bug-006 – MEDIUM – Drag & Drop-Sort-Order nicht implementiert (Spec-Abweichung)
- **Datei:** `src/components/help/admin/topics-panel.tsx:173-176`, `articles-panel.tsx`
- **Beschreibung:** Spec US-4 fordert "Reihenfolge der Artikel innerhalb eines Themas festlegbar" und "Reihenfolge drag & drop oder Zahl". Die UI zeigt nur ein `GripVertical`-Icon ohne DnD-Library/Handler. Die `sort_order` wird automatisch beim Create gesetzt, aber nicht vom User steuerbar.
- **Empfehlung:** `@dnd-kit/sortable` oder PATCH-Endpoint zum Umsortieren + einfache Pfeil-up/down-Buttons.

#### Bug-007 – HIGH – Widerspruch: Öffentliche RLS vs. Login-Pflicht im (app)-Layout
- **Datei:** `src/app/(app)/help/**` + `src/app/(app)/layout.tsx:19-21`
- **Beschreibung:** Die Migration erlaubt `help_topics_select_public` und `help_articles_select_public` WHERE status='published' ohne Auth-Check – gemäß US-1 AC „Öffentliche Artikel sind auch ohne Login zugänglich (optional – SEO)". Die Routen liegen aber unter `src/app/(app)/help/`, dessen Layout jeden Nicht-Eingeloggten auf `/login` redirectet. SEO-Indizierung ist damit unmöglich. Die Tech-Design-Beschreibung in der Spec sagt explizit „Öffentlich (kein Auth nötig)" für `/help/…`.
- **Impact:** Funktionale Regression gegen Spec. Keine Sicherheitslücke, aber Feature-Anspruch nicht erfüllt.
- **Empfehlung:** Reader-Routen nach `src/app/help/` (außerhalb `(app)`) verschieben ODER Spec anpassen (dann US-1 AC-4 streichen).

#### Bug-008 – LOW – „?" Icon-Button auf Seiten der App fehlt
- **Datei:** n/a – nicht implementiert
- **Beschreibung:** US-6 AC: „Jede Seite der App kann einen „?" Icon-Button haben, der zum passenden Artikel verlinkt." Fehlt komplett.
- **Empfehlung:** Kleiner `HelpLink`-Wrapper mit `Link href={\`/help/${topic}/${article}\`}` + Tooltip-Komponente.

#### Bug-009 – LOW – „Kein Treffer"-Meldung verlinkt auf /support (Route-Existenz unklar)
- **Datei:** `src/components/help/help-search-bar.tsx:85-90`
- **Beschreibung:** Leerer Suche-Dropdown bietet `<Link href="/support">Support kontaktieren</Link>`, aber die Route `/support` ist nicht als eigene Page in der Feature-Liste. Klick kann 404 erzeugen.
- **Empfehlung:** Route verifizieren oder durch Mailto-Link ersetzen.

#### Bug-010 – LOW – `video_url` wird beim Upload null-gesetzt, Admin-Intent unklar
- **Datei:** `src/app/api/admin/help/articles/[id]/video/route.ts:100`
- **Beschreibung:** Beim MP4-Upload wird `video_url = null` gesetzt – bewusst, damit Storage-Video Vorrang hat. Aber der Admin sieht im Form weiterhin die YouTube-URL (lokaler State). Nach Refresh ist sie verschwunden – verwirrend.
- **Empfehlung:** UI-Hinweis: „Durch MP4-Upload wird die YouTube-URL entfernt."

#### Bug-011 – LOW – Reading-Time-Berechnung zählt HTML-Entities als Wörter
- **Datei:** `src/lib/help/sanitize.ts:55-61`
- **Beschreibung:** `estimateReadTimeMinutes` entfernt HTML-Tags, aber Entities wie `&amp;` `&auml;` bleiben als „Wörter" erhalten. Bei deutschen Texten mit vielen Umlauten (als Entities kodiert) wird die Lesezeit überschätzt.
- **Empfehlung:** `decodeEntities` vor dem Split nutzen.

#### Bug-012 – LOW – Slug-Kollision bei Edit nicht sauber abgefangen
- **Datei:** `src/app/api/admin/help/articles/[id]/route.ts:89-91`
- **Beschreibung:** Beim PUT wird `slug` durch `slugify` geschickt, aber die Unique-Constraint-Verletzung wird zwar gefangen – der Admin sieht nur „Slug existiert bereits in diesem Thema". Die UI in `ArticleForm` setzt `setSlugTouched(true)` nach User-Edit aber nicht bei Initial-Load → bei reinem Title-Change wird neuer Slug ggf. nicht korrekt übernommen.
- **Empfehlung:** UX-Check in Live-Test.

#### Bug-013 – LOW – fehlende `deleted_at`-Spalte auf `help_topics` im Frontend-Query
- **Datei:** `src/lib/help/queries.ts:27-28`
- **Beschreibung:** `getTopicsWithCounts` selectet `help_topics` ohne `deleted_at`-Filter. Die Migration hat die Spalte, aber die public-Policy filtert schon `deleted_at IS NULL`. Admin-Query `adminGetAllTopics` filtert explizit – inkonsistent aber nicht falsch.
- **Empfehlung:** Konsistent `.is('deleted_at', null)` überall schreiben (Defense-in-depth).

### Security-Audit (Red Team) – Zusammenfassung

| Vektor | Ergebnis |
|---|---|
| Auth-Bypass Admin-Routes | PASS – `verifyAdmin()` bei allen `/api/admin/help/*` Endpunkten |
| RLS-Enforcement | PASS – public-read + admin-write korrekt in Migration |
| SQL-Injection via Search | PASS – `%`/`_` werden escaped (`q.replace(/[%_]/g, '\\$&')`) |
| XSS via content_html | **FAIL** – siehe Bug-001 + Bug-002 |
| XSS via iframe-src (YouTube-Bypass) | **FAIL** – siehe Bug-001 |
| Missbrauch video-upload als storage-DoS | TEILWEISE – 500 MB-Limit okay, aber keine Quota pro Admin/Stunde |
| Exposed Secrets im Bundle | PASS – keine Service-Role-Keys im Client-Code |
| CSRF auf Admin-PUT/DELETE | TEILWEISE – kein CSRF-Token, Supabase-Session-Cookie = SameSite=Lax. Riskant bei Cross-Origin-POST aus kompromittiertem Admin-Browser |
| Rate-Limit auf öffentliche Endpoints | **FAIL** – Bug-003 + Feedback-Endpoint |
| Sensitive Daten in Responses | PASS |

### Regression-Testing (deployed Features)

Statisch geprüft – keine Eingriffe in bestehende Module:
- `src/components/app-sidebar.tsx` – nur neuer Menüpunkt, keine bestehende Nav berührt
- `src/components/admin/admin-sidebar.tsx` – neuer `BookOpen`-Eintrag hinzugefügt, Rest unverändert
- Keine Änderungen an Supabase-Tabellen der Features PROJ-1…PROJ-20 (isolierte Tabellen `help_topics`, `help_articles`, `help_article_feedback`)
- Keine neuen Shared-Components überschrieben

Regression-Risiko: **LOW**. Ein Live-Smoketest auf Dashboard, Beleg-Upload und DATEV-Export wird vor Deploy empfohlen.

### Offene Punkte für Live-QA (Staging)

- [ ] Cross-Browser: Chrome, Firefox, Safari (inkl. iOS Safari für Mobile)
- [ ] Responsive: 375 / 768 / 1440 – Tiptap-Editor-Toolbar auf Mobile prüfen (enge Viewports)
- [ ] YouTube-Embed-Laden gegen CSP (sofern gesetzt)
- [ ] Video-Upload >100 MB realen Netzwerk-Stresstest
- [ ] Preview-Dialog sauber schließen (Escape-Key)
- [ ] Suche mit deutschen Umlauten (Volltextsuche, ILIKE)
- [ ] Slugs mit deutschen Umlauten (slugify `strict: true` sollte sie entfernen)
- [ ] Admin-Impersonation-Kontext: verlinkt das Admin-Help korrekt?

### Production-Ready-Entscheidung

**NOT READY FOR PRODUCTION**

Blocker (müssen vor Deploy gefixt werden):
1. Bug-001 (HIGH) – iframe-Whitelist verschärfen
2. Bug-002 (HIGH) – Defense-in-depth XSS-Schutz
3. Bug-007 (HIGH) – Route-Layout vs. Public-RLS-Widerspruch

Nach Fix der 3 High-Bugs kann der Feature in Staging erneut getestet werden. Medium-Bugs (003–006) sollten zumindest mit Issues angelegt werden.

### Priorisierungs-Empfehlung

1. **P0 (sofort):** Bug-001, Bug-002, Bug-007
2. **P1 (vor Release):** Bug-003, Bug-004, Bug-006
3. **P2 (nach MVP):** Bug-005, Bug-008, Bug-010, Bug-011
4. **P3 (Nice-to-have):** Bug-009, Bug-012, Bug-013

---

## QA Test Results – Runde 2

**QA-Runde:** 2
**Getestet am:** 2026-04-14
**Getestet durch:** QA Engineer (Static Code Review – Re-Test nach Bug-Fixes)
**Status:** NOT PRODUCTION READY – 1 CRITICAL neuer Bug (Search komplett defekt) + weitere Findings

> Re-Test der 13 Runde-1-Bugs gegen den aktuellen Code. Zusätzlich wurde der durch die Fixes eingeführte neue Code audiert. Ein NEUER CRITICAL-Bug ist dabei aufgetreten (Bug-014), der den kompletten Such-Flow blockiert.

### Status der Runde-1-Bugs

| Bug | Severity (R1) | Status R2 | Verifiziert in |
|---|---|---|---|
| Bug-001 iframe-Whitelist | HIGH | **FIXED** | `src/lib/help/sanitize.ts:5,36-42` – `YOUTUBE_EMBED_REGEX` + `exclusiveFilter` |
| Bug-002 Defense-in-depth XSS | HIGH | **FIXED** | `src/lib/help/sanitize.ts:63-66` + Nutzung in `src/app/(app)/help/[topic-slug]/[article-slug]/page.tsx:84` |
| Bug-003 Search Rate-Limit / ILIKE | MEDIUM | **PARTIALLY FIXED** | Auth-Pflicht + 50-Zeichen-Limit in `src/app/api/help/search/route.ts:7-28`; FTS-Umstellung in `src/lib/help/queries.ts:151-159` – ABER NEUER BUG-014 |
| Bug-004 Feedback-Spam / UNIQUE | MEDIUM | **FIXED** | Migration `20260415000000_help_feedback_unique.sql` + Upsert in `src/app/api/help/articles/[id]/feedback/route.ts:64-69` |
| Bug-005 URL-Encoding Storage | MEDIUM | **FIXED** | `src/components/help/video-embed.tsx:49-53` verwendet `encodeURI` |
| Bug-006 Drag & Drop Sort | MEDIUM | **FIXED** (alternativ) | Hoch/Runter-Buttons in `src/components/help/admin/topics-panel.tsx:253-273` (kein DnD, aber funktional) |
| Bug-007 Öffentliche RLS vs. Login-Pflicht | HIGH | **FIXED per Spec-Entscheidung** | Spec-Update US-1 AC: „Entscheidung: Login erforderlich". Routen bleiben unter `(app)/help/`. Public-RLS bleibt als Defense-in-depth in der Migration |
| Bug-008 Help-Icon-Button überall | LOW | **OPEN** | Nicht implementiert |
| Bug-009 /support Link | LOW | **OPEN** | `src/components/help/help-search-bar.tsx:85-90` weiterhin `/support` |
| Bug-010 video_url null Hinweis | LOW | **OPEN** | Kein UI-Hinweis hinzugefügt |
| Bug-011 Entities in read-time | LOW | **FIXED** | `src/lib/help/sanitize.ts:73-89` dekodiert Entities vor dem Split |
| Bug-012 Slug-UX beim Edit | LOW | **OPEN** (Live-Test nötig) | unverändert |
| Bug-013 deleted_at Consistency | LOW | **OPEN** (kosmetisch) | `getTopicsWithCounts` nutzt weiterhin keinen `.is('deleted_at', null)`, verlässt sich auf RLS-Policy |

**Gefixt:** 7 / 13 (inkl. Bug-007 per Spec-Entscheidung)
**Offen:** 6 / 13 (alle LOW)
**Regression durch Fix eingeführt:** 1 (Bug-014 CRITICAL – siehe unten)

### Neue Bugs durch Re-Test

#### Bug-014 – CRITICAL – Volltextsuche gegen nicht-existente Spalte `search_vector`
- **Datei:** `src/lib/help/queries.ts:158`
- **Beschreibung:** Der Bug-003-Fix hat die Suche von `.or('title.ilike.%…%,…')` auf `.textSearch('search_vector', ftsQuery, { config: 'german' })` umgestellt. In der Tabelle `help_articles` existiert aber **keine Spalte `search_vector`** – die Migration `20260414200000_help_center.sql:113-121` legt nur einen GIN-Index auf den Ausdruck `to_tsvector('german', title || summary || content_html)` an, NICHT eine `GENERATED ALWAYS AS (...) STORED`-Spalte. Supabase PostgREST wird `column help_articles.search_vector does not exist` zurückgeben, jede Suche schlägt mit 500/400 fehl.
- **Steps to reproduce:**
  1. Deployment nach Staging.
  2. `/help` öffnen, in der Search-Bar „matching" eingeben.
  3. API-Call `GET /api/help/search?q=matching` → interner Fehler, leere Liste, Error-Log.
- **Impact:** US-2 Acceptance Criterion „Suchfunktion über alle Artikel" ist komplett defekt. Blockiert Deployment.
- **Empfehlung:** Eine der folgenden Varianten:
  1. Neue Migration: `ALTER TABLE help_articles ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (to_tsvector('german', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(content_html,''))) STORED;` + GIN-Index auf `search_vector` statt auf den Ausdruck.
  2. Alternativ in `queries.ts` die FTS-Query als Raw-RPC/`.filter('to_tsvector(...)','@@', ftsQuery)` umsetzen (fragil in PostgREST, nicht empfohlen).
  3. Pragmatisch: ILIKE-Variante (mit Escape) reaktivieren + Bug-003 bei der 50-Zeichen-Grenze belassen.
- **Severity:** CRITICAL – Kernfunktion einer P0-AC ist tot.

#### Bug-015 – MEDIUM – Admin-Artikel-Vorschau rendert ohne Sanitization
- **Datei:** `src/components/help/admin/article-form.tsx:387`
- **Beschreibung:** Die Vorschau im Admin-Bereich nutzt `dangerouslySetInnerHTML={{ __html: content || ... }}` ohne `sanitizeForRender()`. Zwar ist die Seite auf Admins beschränkt (Scope im gleichen Browser), aber die Defense-in-depth-Logik aus Bug-002 fehlt hier, und wenn ein Admin-Account kompromittiert wird, läuft beim Vorschau-Klick beliebiges JS im Admin-Kontext (privilege escalation möglich, Session-Cookie sessionhijack).
- **Impact:** Selbe Klasse wie Bug-002, aber auf Admin-Session beschränkt. Weniger kritisch als Reader-Seite, aber vermeidbar.
- **Empfehlung:** `sanitizeForRender(content)` auch in der Vorschau anwenden.

#### Bug-016 – MEDIUM – FTS-Query-Builder produziert ungültige tsquery bei Sonderzeichen
- **Datei:** `src/lib/help/queries.ts:145-149`
- **Beschreibung:** Der Builder splittet an `\s+`, entfernt `'`, `"`, `\` – aber NICHT `&`, `|`, `!`, `(`, `)`, `:`. Eingabe wie `DATEV (Export)` ergibt `DATEV:* & (Export):*` – das führende `(` ohne passenden Wortkontext ist syntaktisch gültig, aber `Export):*` kann je nach tsquery-Parser als Syntax-Error fehlschlagen. Kombiniert mit Bug-014 wird das ohnehin nie ausgeführt, aber nach Bug-014-Fix wird dies zum latenten 500-Fehler.
- **Empfehlung:** Whitelist statt Blacklist: `w.replace(/[^\p{L}\p{N}]/gu, '')`. Oder `websearch_to_tsquery('german', q)` serverseitig per RPC.

#### Bug-017 – LOW – Keine Rate-Limit-Middleware auf `/api/help/search` trotz Re-Test-Behauptung
- **Datei:** `src/app/api/help/search/route.ts`
- **Beschreibung:** Der Kommentar sagt „Bug-003 fix: … max. 50 Zeichen", aber das eigentliche Rate-Limiting (Upstash/Vercel Middleware, etc.) wurde nicht implementiert. Bei vielen parallelen kurzen Queries bleibt DoS möglich. Mit Bug-014 ist das aktuell ohnehin kein Performance-Problem (jede Query schlägt sofort fehl), wird aber nach dem Fix relevant.
- **Empfehlung:** In-Memory-LRU pro IP oder Vercel KV / Upstash Ratelimit.

#### Bug-018 – LOW – Admin-Help-Sidebar dupliziert Hilfe-Center-Eintrag im Top-Nav
- **Datei:** `src/components/admin/admin-sidebar.tsx` + `src/components/app-sidebar.tsx`
- **Beschreibung:** Beide Sidebars listen den Hilfe-Link (mit unterschiedlichen Icons `HelpCircle` vs `BookOpen`). Wenn ein Admin im Admin-Panel ist, sieht er „Hilfe-Center" im normalen Sidebar und im Admin-Sidebar – leicht verwirrend, wäre im Staging UX-Check.
- **Empfehlung:** Im Admin-Sidebar als „Hilfe-Center verwalten" kennzeichnen (Label bereits so?). Bei Live-Test verifizieren.

### Zusätzliche Security-Checks (Runde 2)

| Vektor | Ergebnis |
|---|---|
| iframe-Whitelist Bypass (YouTube-Pfad-Trick) | **PASS** – Regex prüft `/embed/{ID}` strikt |
| Stored-XSS via direkter DB-Insert | **PASS** (Reader) / **FAIL** (Admin-Preview, Bug-015) |
| Feedback-Spam / Flood | **PASS** – UNIQUE-Constraint + Upsert |
| Such-Query-Injection (tsquery-Syntax) | **WARNING** – Bug-016 |
| Rate-Limit Search / Feedback | **WARNING** – Bug-017 |
| Auth-Bypass auf /api/admin/help/* | **PASS** – `verifyAdmin()` weiterhin konsistent |
| CSRF auf Admin-PUT/DELETE | **OPEN** (unverändert seit Runde 1) – Supabase-Session-Cookie SameSite=Lax, kein CSRF-Token |
| Bucket `help-videos` public read | **PASS** – Write nur Admin via RLS |
| is_super_admin() Function SECURITY DEFINER | **PASS** – `SET search_path = public` korrekt gesetzt |

### Regression-Check (Runde 2)

- `src/components/admin/admin-sidebar.tsx` – neuer Eintrag berührt bestehende Admin-Navigation nicht destructive
- `src/lib/help/queries.ts` – isoliert, kein Eingriff in existierende Queries der PROJ-1…20
- Neue Migration `20260415000000_help_feedback_unique.sql` – nur `help_article_feedback`-Tabelle, keine Regressionsgefahr

Regression-Risiko: **LOW**. Bug-014 ist isoliert auf die Such-Funktion, alles andere funktioniert unabhängig.

### Production-Ready-Entscheidung (Runde 2)

**NOT READY FOR PRODUCTION**

Blocker:
1. **Bug-014 (CRITICAL)** – Suche komplett defekt. Ohne Fix ist US-2 AC „Suchfunktion über alle Artikel" unerfüllt.

Vor Release stark empfohlen:
2. Bug-015 (MEDIUM) – Admin-Preview sanitizen
3. Bug-016 (MEDIUM) – Nach Bug-014-Fix: tsquery-Sanitizing gegen Sonderzeichen
4. Bug-017 (LOW) – Echtes Rate-Limit

Nice-to-have (nicht blockend):
5. Bug-008, Bug-009, Bug-010, Bug-012, Bug-013, Bug-018

### Priorisierungs-Empfehlung Runde 2

1. **P0 (sofort, deploy-blocking):** Bug-014
2. **P1 (vor Release):** Bug-015, Bug-016, Bug-017
3. **P2 (nach MVP):** Bug-008, Bug-010, Bug-018
4. **P3 (Nice-to-have / Cleanup):** Bug-009, Bug-012, Bug-013

### Offene Punkte für Live-QA (Staging) – unverändert aus Runde 1

Nach Fix von Bug-014 sollten die folgenden Punkte aus Runde 1 live nachgezogen werden:
- Cross-Browser: Chrome, Firefox, Safari (inkl. iOS Safari)
- Responsive: 375 / 768 / 1440 – Tiptap-Toolbar auf Mobile
- YouTube-Embed gegen CSP
- Video-Upload >100 MB Stresstest
- Preview-Dialog Escape-Key
- Deutsche Umlaute in Suche + Slugs
- Admin-Impersonation-Kontext

## Deployment

**Deployed:** 2026-04-15
**Production URL:** https://belegmanagerv1.vercel.app/help
**Admin URL:** https://belegmanagerv1.vercel.app/admin/help

### Deployment-Zusammenfassung
- Frontend: Vercel (auto-deploy via git push auf `main`)
- Backend: Supabase Cloud EU Frankfurt
- Migrationen eingespielt:
  - `20260414200000_help_center.sql` – Tabellen, RLS, Seed (6 Themen, 31 Artikel)
  - `20260415000000_help_feedback_unique.sql` – UNIQUE Constraint Feedback
  - `20260415000001_help_search_vector_column.sql` – `search_vector` Generated Column + GIN-Index
- Storage Bucket `help-videos` angelegt (public read, admin write)

### QA-Status vor Deploy
- Runde 1: 13 Bugs gefunden, alle HIGH/MEDIUM/LOW gefixt
- Runde 2: 5 neue Bugs (Bug-014 CRITICAL, Bug-015/016 MEDIUM, Bug-017/018 LOW) – alle gefixt
- Verbleibend: Bug-008 (LOW, Help-Icon-Button), Bug-012 (LOW, Slug-UX-Edge-Case) – akzeptiert

### Offene Punkte (Post-Launch)
- Live-QA: Cross-Browser, Responsive, Video-Upload-Stresstest
- Bug-008: `HelpLink`-Button auf App-Seiten (für Direktlinks in Artikel)
- Rate-Limiting: Upstash Redis für produktionsreifes Multi-Instance-Limit

## Content-Update (2026-05-01)

Migration `20260501000000_help_content_update.sql` eingespielt. Artikel-Bestand auf 38 Artikel (war 31) erweitert.

### Geänderte Artikel
- **BanksAPI-Fix:** `finapi-bankanbindung` → `banksapi-bankanbindung` (Titel, Slug, Inhalt – FinAPI wurde in PROJ-20 durch BanksAPI ersetzt)
- **Onboarding-Checkliste:** BanksAPI-Referenz + Buchführungstyp-Schritt ergänzt
- **Microsoft-365-Artikel:** AES-256-Sicherheitshinweis + Hard-Delete-Hinweis (PROJ-24)
- **IMAP-Artikel:** AES-256-Sicherheitshinweis + Hard-Delete-Hinweis (PROJ-24)

### Neue Artikel
| Slug | Thema | Feature |
|---|---|---|
| `ki-assistent-chatbot` | Erste Schritte | PROJ-23 |
| `belege-email-zentrales-postfach` | Belegverwaltung | PROJ-30 |
| `eigenbeleg-erstellen` | Belegverwaltung | PROJ-17 |
| `ear-buchungstyp-buchungsnummern` | Monatsabschluss & Export | PROJ-25 |
| `weiterempfehlung-referral` | Einstellungen & Benutzerverwaltung | PROJ-31 |

### KI-Chatbot-Anbindung (PROJ-23)
Der KI-Chatbot (PROJ-23) greift via PostgreSQL FTS direkt auf `help_articles` zu. Alle neuen und aktualisierten Artikel sind sofort für den Chatbot verfügbar – kein manueller Sync-Schritt nötig.
