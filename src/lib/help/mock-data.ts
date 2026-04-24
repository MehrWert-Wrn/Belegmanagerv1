// PROJ-22: Hilfe-Center – Mock Data Layer
// TODO(PROJ-22): Replace with Supabase queries via help_topics / help_articles tables
// once backend tables and RLS are in place.

import type { HelpArticle, HelpTopic, HelpTopicWithArticles, HelpTopicWithCount } from './types'

const NOW = '2026-04-14T00:00:00.000Z'

export const MOCK_TOPICS: HelpTopic[] = [
  {
    id: 'topic-1',
    title: 'Erste Schritte',
    slug: 'erste-schritte',
    description: 'Alles, was du fuer den Einstieg in den Belegmanager brauchst.',
    icon: 'Rocket',
    sort_order: 1,
    created_at: NOW,
  },
  {
    id: 'topic-2',
    title: 'Belegverwaltung',
    slug: 'belegverwaltung',
    description: 'Belege hochladen, erfassen und organisieren.',
    icon: 'FileText',
    sort_order: 2,
    created_at: NOW,
  },
  {
    id: 'topic-3',
    title: 'Kontoauszug & Matching',
    slug: 'kontoauszug-matching',
    description: 'Kontoauszuege importieren und automatisch mit Belegen verknuepfen.',
    icon: 'ArrowLeftRight',
    sort_order: 3,
    created_at: NOW,
  },
  {
    id: 'topic-4',
    title: 'Monatsabschluss & Export',
    slug: 'monatsabschluss-export',
    description: 'Monatsabschluss durchfuehren und Daten an den Steuerberater uebergeben.',
    icon: 'CalendarCheck',
    sort_order: 4,
    created_at: NOW,
  },
  {
    id: 'topic-5',
    title: 'Einstellungen & Benutzerverwaltung',
    slug: 'einstellungen-benutzerverwaltung',
    description: 'Konto, Rollen und Abonnement verwalten.',
    icon: 'Settings',
    sort_order: 5,
    created_at: NOW,
  },
  {
    id: 'topic-6',
    title: 'Portalanbindungen',
    slug: 'portalanbindungen',
    description: 'Externe Portale wie Amazon Business oder Lieferantenportale verbinden.',
    icon: 'Plug',
    sort_order: 6,
    created_at: NOW,
  },
]

function placeholderContent(title: string): string {
  return `
    <h2>${title}</h2>
    <p>Dieser Artikel ist aktuell ein Platzhalter. Der finale Inhalt wird vom Super-Admin im Backend-Editor eingepflegt.</p>
    <h3>Was dich hier erwartet</h3>
    <ul>
      <li>Schritt-fuer-Schritt-Anleitung</li>
      <li>Haeufige Fragen &amp; Antworten</li>
      <li>Optional: Erklaer-Video</li>
    </ul>
    <p>Bei Fragen kannst du jederzeit den Support kontaktieren.</p>
  `.trim()
}

function article(
  id: string,
  topicId: string,
  title: string,
  slug: string,
  summary: string,
  sortOrder: number,
): HelpArticle {
  return {
    id,
    topic_id: topicId,
    title,
    slug,
    summary,
    content_html: placeholderContent(title),
    status: 'published',
    video_url: null,
    video_storage_path: null,
    sort_order: sortOrder,
    read_time_minutes: 3,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
  }
}

export const MOCK_ARTICLES: HelpArticle[] = [
  // Topic 1: Erste Schritte
  article('art-1-1', 'topic-1', 'Registrierung & Erstanmeldung', 'registrierung-erstanmeldung', 'So legst du dein Konto an und meldest dich zum ersten Mal an.', 1),
  article('art-1-2', 'topic-1', 'Dashboard-Uebersicht', 'dashboard-uebersicht', 'Die wichtigsten Bereiche deines Dashboards im Ueberblick.', 2),
  article('art-1-3', 'topic-1', 'Onboarding-Checkliste – Was muss ich tun?', 'onboarding-checkliste', 'Die Checkliste fuehrt dich Schritt fuer Schritt zum produktiven System.', 3),
  article('art-1-4', 'topic-1', 'E-Mail-Postfach anbinden – Microsoft 365', 'email-microsoft-365', 'Verbinde dein Microsoft-365-Postfach fuer den automatischen Beleg-Import.', 4),
  article('art-1-5', 'topic-1', 'E-Mail-Postfach anbinden – Gmail', 'email-gmail', 'Verbinde dein Gmail-Konto fuer den automatischen Beleg-Import.', 5),
  article('art-1-6', 'topic-1', 'E-Mail-Postfach anbinden – IMAP', 'email-imap', 'Verbinde ein beliebiges IMAP-Postfach mit dem Belegmanager.', 6),

  // Topic 2: Belegverwaltung
  article('art-2-1', 'topic-2', 'Belege hochladen (manuell)', 'belege-manuell-hochladen', 'So laedst du einzelne Belege per Drag-and-Drop hoch.', 1),
  article('art-2-2', 'topic-2', 'Belege per WhatsApp senden', 'belege-whatsapp', 'Sende Belege bequem vom Handy per WhatsApp an den Belegmanager.', 2),
  article('art-2-3', 'topic-2', 'Belege per E-Mail einsenden', 'belege-email', 'Leite Rechnungen einfach an deine persoenliche Belegmanager-Adresse weiter.', 3),
  article('art-2-4', 'topic-2', 'OCR-Erkennung und automatisches Ausfuellen', 'ocr-erkennung', 'Wie die OCR-Erkennung funktioniert und was du pruefen solltest.', 4),

  // Topic 3: Kontoauszug & Matching
  article('art-3-1', 'topic-3', 'Kontoauszug importieren (CSV)', 'kontoauszug-csv-import', 'Kontoauszug als CSV hochladen und normalisieren lassen.', 1),
  article('art-3-2', 'topic-3', 'Automatischer Import via BanksAPI (Bankanbindung)', 'banksapi-bankanbindung', 'Verbinde dein Bankkonto via PSD2-API fuer taegliche automatische Importe.', 2),
  article('art-3-3', 'topic-3', 'Matching-Status verstehen (Ampel-System)', 'matching-ampel-system', 'Gruen, Gelb, Rot: Was die Matching-Ampel aussagt.', 3),
  article('art-3-4', 'topic-3', 'Belege manuell zuordnen', 'belege-manuell-zuordnen', 'So ordnest du Belege manuell zu, wenn das Matching unsicher ist.', 4),
  article('art-3-5', 'topic-3', 'Kassabuch verwenden', 'kassabuch-verwenden', 'Barzahlungen im Kassabuch erfassen und mit Belegen verknuepfen.', 5),

  // Topic 4: Monatsabschluss & Export
  article('art-4-1', 'topic-4', 'Monatsabschluss durchfuehren', 'monatsabschluss-durchfuehren', 'Der komplette Workflow zum Monatsabschluss in unter 30 Minuten.', 1),
  article('art-4-2', 'topic-4', 'DATEV-Export fuer den Steuerberater', 'datev-export', 'So exportierst du deine Daten im DATEV-kompatiblen Format.', 2),
  article('art-4-3', 'topic-4', 'Zahlungsquellen verwalten', 'zahlungsquellen-verwalten', 'Mehrere Zahlungsquellen wie Kreditkarte oder PayPal anlegen und nutzen.', 3),

  // Topic 5: Einstellungen & Benutzerverwaltung
  article('art-5-1', 'topic-5', 'Benutzerverwaltung und Rollen (Admin / Buchhalter)', 'benutzer-rollen', 'Weitere Benutzer einladen und Rollen zuweisen.', 1),
  article('art-5-2', 'topic-5', 'Passwort aendern', 'passwort-aendern', 'So aenderst du dein Passwort sicher.', 2),
  article('art-5-3', 'topic-5', 'Abonnement & Rechnungen', 'abonnement-rechnungen', 'Dein Abo verwalten und Rechnungen herunterladen.', 3),

  // Topic 6: Portalanbindungen
  article('art-6-1', 'topic-6', 'Amazon Business anbinden', 'amazon-business-anbinden', 'Verbinde dein Amazon-Business-Konto fuer automatischen Rechnungsabruf.', 1),
  article('art-6-2', 'topic-6', 'Lieferantenportal anbinden (Schritt-fuer-Schritt)', 'lieferantenportal-anbinden', 'Allgemeine Anleitung fuer beliebige Lieferantenportale.', 2),
  article('art-6-3', 'topic-6', 'Meeting buchen fuer Portalanbindung', 'meeting-portalanbindung', 'Brauchst du Hilfe bei der Anbindung? Buche ein Meeting mit unserem Team.', 3),
]

// --- Query helpers ---------------------------------------------------------

export function getTopics(options: { includeEmpty?: boolean } = {}): HelpTopicWithCount[] {
  const topics = [...MOCK_TOPICS].sort((a, b) => a.sort_order - b.sort_order)
  const withCount = topics.map((topic) => ({
    ...topic,
    article_count: MOCK_ARTICLES.filter(
      (a) => a.topic_id === topic.id && a.status === 'published' && !a.deleted_at,
    ).length,
  }))
  if (options.includeEmpty) return withCount
  return withCount.filter((t) => t.article_count > 0)
}

export function getTopicBySlug(slug: string): HelpTopicWithArticles | null {
  const topic = MOCK_TOPICS.find((t) => t.slug === slug)
  if (!topic) return null
  const articles = MOCK_ARTICLES
    .filter((a) => a.topic_id === topic.id && a.status === 'published' && !a.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order)
  return { ...topic, articles }
}

export function getArticleBySlug(topicSlug: string, articleSlug: string): HelpArticle | null {
  const topic = MOCK_TOPICS.find((t) => t.slug === topicSlug)
  if (!topic) return null
  const article = MOCK_ARTICLES.find(
    (a) => a.topic_id === topic.id && a.slug === articleSlug && !a.deleted_at,
  )
  return article ?? null
}

export function getRelatedArticles(article: HelpArticle, limit = 3): HelpArticle[] {
  return MOCK_ARTICLES
    .filter(
      (a) =>
        a.topic_id === article.topic_id &&
        a.id !== article.id &&
        a.status === 'published' &&
        !a.deleted_at,
    )
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, limit)
}

export function searchArticles(query: string): Array<HelpArticle & { topic_slug: string }> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return MOCK_ARTICLES
    .filter((a) => a.status === 'published' && !a.deleted_at)
    .filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.content_html.toLowerCase().includes(q),
    )
    .map((a) => {
      const topic = MOCK_TOPICS.find((t) => t.id === a.topic_id)
      return { ...a, topic_slug: topic?.slug ?? '' }
    })
}

// --- Admin helpers (all return mock data for now) --------------------------

export function getAllTopicsForAdmin(): HelpTopicWithCount[] {
  return getTopics({ includeEmpty: true })
}

export function getAllArticlesForAdmin(): HelpArticle[] {
  return [...MOCK_ARTICLES]
    .filter((a) => !a.deleted_at)
    .sort((a, b) => {
      if (a.topic_id !== b.topic_id) return a.topic_id.localeCompare(b.topic_id)
      return a.sort_order - b.sort_order
    })
}

export function getArticleByIdForAdmin(id: string): HelpArticle | null {
  return MOCK_ARTICLES.find((a) => a.id === id && !a.deleted_at) ?? null
}

export function getTopicById(id: string): HelpTopic | null {
  return MOCK_TOPICS.find((t) => t.id === id) ?? null
}
