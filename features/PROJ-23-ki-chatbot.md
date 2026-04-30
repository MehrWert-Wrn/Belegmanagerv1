# PROJ-23: KI-Chatbot

## Status: In Progress
**Created:** 2026-04-14
**Last Updated:** 2026-04-30

## Dependencies
- Requires: PROJ-1 (Authentifizierung) – eingeloggter User-Kontext für personalisierten Support
- Requires: PROJ-22 (Hilfe-Center) – Wissensbasis des Chatbots (Artikel-Inhalte)
- Requires: PROJ-19 (Admin Panel) – Admin kann Chatbot-Inhalte indirekt über Hilfe-Center steuern

---

## Overview

Ein KI-gestützter Chatbot, der rechts unten als Chat-Fenster in die App eingebettet ist und Fragen zur Belegmanager-Software beantwortet. Der Chatbot nutzt die Inhalte des Hilfe-Centers (PROJ-22) als Wissensbasis (RAG – Retrieval Augmented Generation). Er ergänzt das Support-Ticket-System (PROJ-19) als Erste-Hilfe-Instanz und gibt Mandanten sofortige Antworten rund um die Uhr.

---

## User Stories

### US-1: Chatbot öffnen und starten
Als Mandant möchte ich jederzeit den Chatbot über einen Button rechts unten aufrufen können, damit ich schnell Antworten auf meine Fragen bekomme.

**Acceptance Criteria:**
- [ ] Floating Action Button (FAB) rechts unten auf allen App-Seiten sichtbar (außer `/admin`)
- [ ] Icon: Chat-Bubble oder Hilfe-Icon in der CI-Farbe (Petrol/Teal)
- [ ] Klick öffnet ein Chat-Panel (Slide-in oder Overlay, nicht neues Tab)
- [ ] Chat-Panel zeigt Begrüßungstext: „Hallo! Ich bin der Belegmanager-Assistent. Wie kann ich dir helfen?"
- [ ] Schnell-Fragen als Chips/Buttons: z.B. „Beleg hochladen", „Kontoauszug importieren", „Monatsabschluss"
- [ ] Schließen-Button (X) im Panel-Header
- [ ] Chat-Verlauf bleibt während der Session erhalten (kein Reset beim Navigieren)

### US-2: Fragen stellen und Antworten erhalten
Als Mandant möchte ich Fragen in natürlicher Sprache stellen können und relevante Antworten aus dem Hilfe-Center erhalten.

**Acceptance Criteria:**
- [ ] Texteingabefeld mit Send-Button und Enter-Tastenkürzel
- [ ] Chatbot antwortet auf Deutsch (Sprache des Belegmanagers)
- [ ] Antworten basieren auf den publizierten Hilfe-Center-Artikeln (RAG)
- [ ] Bei relevanten Antworten: Link zum vollständigen Artikel (z.B. „Mehr dazu: [Artikel-Titel]")
- [ ] Antwortzeit < 5 Sekunden (Streaming bevorzugt für schnelles Feedback)
- [ ] Streaming-Darstellung: Antwort erscheint schrittweise (Typing-Effekt)
- [ ] Wenn keine relevante Antwort gefunden: „Ich konnte dazu keinen Artikel finden. Möchtest du ein Support-Ticket erstellen?"
- [ ] Laden-Indikator (Typing-Animation) während Antwort generiert wird

### US-3: Zu Support-Ticket weiterleiten
Als Mandant möchte ich vom Chatbot an den menschlichen Support weitergeleitet werden können, wenn der Bot meine Frage nicht beantworten kann.

**Acceptance Criteria:**
- [ ] Nach 2 nicht-erfolgreichen Antworten erscheint automatisch: „Soll ich ein Support-Ticket für dich erstellen?"
- [ ] Button: „Ja, Ticket erstellen" → öffnet Support-Ticket-Dialog (PROJ-19)
- [ ] Button: „Nein, ich versuche es anders" → User kann weiter fragen
- [ ] Meeting-Link als Alternative: „Oder buche direkt ein 15-Min-Meeting: [Link]"

### US-4: Chatbot-Wissensbasis aus Hilfe-Center
Als Super-Admin möchte ich, dass der Chatbot automatisch neue/aktualisierte Hilfe-Center-Artikel berücksichtigt, ohne dass ich den Chatbot manuell aktualisieren muss.

**Acceptance Criteria:**
- [ ] Beim Veröffentlichen eines neuen Artikels in PROJ-22: Artikel-Inhalt wird automatisch in die Chatbot-Wissensbasis übernommen (Vektorisierung via Embedding)
- [ ] Beim Aktualisieren eines Artikels: alter Embedding wird ersetzt
- [ ] Beim Löschen eines Artikels: Embedding wird entfernt
- [ ] Super-Admin hat im Admin-Bereich einen „Wissensbasis aktualisieren"-Button für manuelle Neusynchronisation
- [ ] Wissensbasis enthält nur Artikel mit Status „Veröffentlicht"

### US-5: Chatbot-Kontext aus App-Seite
Als Mandant möchte ich, dass der Chatbot weiß, auf welcher Seite ich mich befinde, damit er kontextsensitive Hilfe anbieten kann.

**Acceptance Criteria:**
- [ ] Chatbot erhält aktuellen Pfad (z.B. `/kontoauszug`, `/belege`) als Kontext
- [ ] Begrüßungs-Chips passen sich an aktuelle Seite an (z.B. auf `/belege`: „Beleg hochladen", „OCR erklärt")
- [ ] System-Prompt enthält Seitenkontext für relevantere Antworten

---

## Edge Cases

- **Hilfe-Center noch leer (vor PROJ-22-Deployment):** Chatbot antwortet mit generischem Fallback-Text und verweist auf Support-Ticket
- **OpenAI/Claude API nicht erreichbar:** Fehlermeldung: „Der Assistent ist gerade nicht verfügbar. Bitte erstelle ein Support-Ticket." – Support-Widget erscheint
- **Sehr lange Antworten:** Antworten werden auf max. 500 Wörter begrenzt mit Link zum vollständigen Artikel
- **Sensible Daten im Chat:** Chatbot gibt keinen Hinweis, keine Passwörter oder Zugangsdaten einzugeben (System-Prompt)
- **User tippt sehr schnell / Spam:** Rate-Limiting: max. 10 Nachrichten pro Minute
- **Mobile-Ansicht:** Chat-Panel nimmt auf kleinen Screens den gesamten Bildschirm ein (Fullscreen-Mode)
- **Mehrsprachigkeit:** Chatbot erkennt Sprache des Users und antwortet auf Deutsch (Standardsprache)
- **User fragt nach nicht-Belegmanager-Themen:** Chatbot antwortet: „Dazu kann ich dir leider nicht helfen. Ich bin spezialisiert auf die Belegmanager-Software."

---

## Technical Requirements

### KI-Infrastruktur
- **Modell:** Claude 3.5 Sonnet (Anthropic) oder GPT-4o (OpenAI) – via API
- **RAG-Ansatz:** Retrieval Augmented Generation mit Hilfe-Center-Artikel-Embeddings
- **Embedding-Model:** `text-embedding-3-small` (OpenAI) oder `voyage-3` (Anthropic)
- **Vektor-Datenbank:** `pgvector` Extension in Supabase (kein separater Dienst)
- **Ähnlichkeitssuche:** Cosine Similarity, Top-3 relevante Artikel als Kontext
- **System-Prompt:** Definiert Chatbot-Persönlichkeit, Sprache (Deutsch), Kontext-Einschränkung auf Belegmanager

### API & Backend
- **API-Route:** `POST /api/chat` (Next.js Edge Function für Streaming)
- **Auth:** Supabase JWT-Validierung (nur eingeloggte User)
- **Rate-Limiting:** 10 Requests/Minute pro User (via Upstash Redis oder Supabase Edge Function)
- **Tabellen:** `help_article_embeddings` (article_id, embedding vector(1536), content_chunk)
- **Streaming:** Vercel AI SDK (`ai` package) für Server-Sent Events

### UI
- **Position:** Fixed bottom-right, z-index 50
- **Breite:** 380px (Desktop), Fullscreen (Mobile < 640px)
- **Höhe:** 560px (Desktop)
- **Animation:** Slide-up beim Öffnen
- **Styling:** CI-konform (Petrol/Teal, Plus Jakarta Sans)

---

## Tech Design (Solution Architect)
**Erstellt:** 2026-04-30

### Strategische Entscheidungen

#### RAG: FTS statt pgvector
Das Hilfe-Center hat bereits PostgreSQL Full-Text Search mit German-Konfiguration (`search_vector` generated column). Für Phase 1 wird diese bestehende Infra als RAG-Basis verwendet – keine neuen Tabellen, keine Embedding-Kosten. Semantic Search via pgvector kann in Phase 2 nachgerüstet werden, wenn FTS nicht ausreicht.

#### SupportWidget-Integration
Das bestehende `SupportWidget` (PROJ-19) sitzt an `fixed bottom-6 right-6`. Ein zweites FAB wäre schlechte UX. Das Chatbot-FAB **ersetzt** das SupportWidget vollständig. Die Support-Ticket-Erstellung wird zur Eskalationsaktion innerhalb des Chatbots (US-3: Button „Ticket erstellen" erscheint im Chat nach Nicht-Antworten).

### Komponenten-Struktur

```
src/components/chat/
├── chatbot-widget.tsx     ← FAB + Panel-State (ersetzt SupportWidget im Layout)
├── chat-panel.tsx         ← Chat-Fenster (Nachrichten-Liste + Eingabe + Eskalations-Flow)
└── chat-message.tsx       ← Einzelne Nachrichts-Bubble (User / Assistent / System)

src/app/api/chat/
└── route.ts               ← POST, SSE-Streaming, RAG-Suche, Claude-Aufruf

src/lib/chat/
└── rag.ts                 ← FTS-Suche in help_articles + HTML-zu-Text-Konvertierung
```

**Geänderte Bestands-Dateien:**
- `src/app/(app)/layout.tsx` — `<SupportWidget />` wird durch `<ChatbotWidget />` ersetzt

### Datenfluss

```
User-Eingabe im ChatPanel
    ↓
POST /api/chat  { messages: ChatMessage[], currentPath: string }
    ↓
Route Handler (src/app/api/chat/route.ts):
  1. Supabase JWT validieren → user.id
  2. Rate-Limit prüfen (10 req/min, In-Memory wie /api/help/search)
  3. FTS-Suche: letzte User-Nachricht → top 3 Artikel aus help_articles
  4. HTML strippen → plain-text (regex, kein Extra-Package)
  5. System-Prompt aufbauen (Persona + currentPath-Kontext + Artikel-Snippets)
  6. Anthropic SDK messages.stream() → ReadableStream (SSE) an Client
    ↓
ChatPanel: Token-für-Token-Rendering (Streaming)
    ↓
Nach 2 nicht-hilfreichen Antworten: Eskalations-CTA im Panel
  → „Ticket erstellen"-Button öffnet Inline-Ticket-Formular (aus SupportWidget übernommen)
```

### Datenmodell

**Keine neuen Datenbank-Tabellen.** Gelesen wird aus:
- `help_articles` (title, content_html, slug, topic_id, status = 'published')
- `help_topics` (slug – für Artikel-Links im Chat, z.B. „Mehr dazu: [Artikel-Titel]")

**Chat-Verlauf:** React State (Session-only, kein DB-Persist im MVP). Letzte 10 Nachrichten werden bei jedem Request als Kontext mitgeschickt.

**Eskalations-Zähler:** React State. Zählt Antworten, bei denen der Chatbot keinen passenden Artikel fand.

### Tech-Entscheidungen

| Entscheidung | Wahl | Begründung |
|---|---|---|
| KI-Modell | Claude Sonnet 4.6 | `@anthropic-ai/sdk` bereits installiert, kein OpenAI-Konto nötig |
| Streaming | Anthropic SDK `messages.stream()` + `ReadableStream` | Kein Vercel AI SDK nötig – spart eine Dependency |
| RAG-Methode | PostgreSQL FTS (bestehend, `search_vector`) | German-Config bereits aktiv, keine neue Infra |
| HTML→Text | Regex-Strip (serverseitig) | Für Help-Article-HTML ausreichend, kein Extra-Package |
| Rate-Limit | In-Memory Map (10 req/min/user) | Konsistentes Pattern mit `/api/help/search` |
| Chat-Persistenz | Session-State (React) | MVP-Scope, kein DB-Overhead |
| Position | Fixed bottom-right (ersetzt SupportWidget) | Ein FAB statt zwei, saubere UX |
| SupportWidget | Vollständig in ChatbotWidget integriert | Eskalation als Inline-Flow im Chat |

### Neue Dependencies

**Keine neuen npm-Packages.** `@anthropic-ai/sdk ^0.80.0` ist bereits installiert.

### UI-Spezifikation

- **FAB:** `fixed bottom-6 right-6 z-50`, Teal-600, 56×56px – identische Position wie bisheriges SupportWidget
- **Chat-Panel:** `fixed bottom-24 right-6 z-50`, 380px breit, 560px hoch (Desktop); Fullscreen auf Mobile < 640px
- **Animation:** `slide-in-from-bottom-4 fade-in` (identisch zu SupportWidget)
- **Eskalations-Flow:** Erscheint als System-Nachricht mit CTA-Buttons nach 2 Nicht-Antworten
- **Artikel-Links:** Inline als klickbare Links in der Chat-Antwort (`/help/[topic]/[artikel]`)
- **Kontext-Chips:** Beim Öffnen abhängig von `currentPath` (z.B. auf `/belege`: „Beleg hochladen")

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
