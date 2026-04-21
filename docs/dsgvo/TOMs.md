# Technisch-Organisatorische Maßnahmen (TOMs)
**Art. 32 DSGVO | Belegmanager | Mehr.Wert Gruppe GmbH**
**Stand: April 2026**

---

## Übersicht

Dieses Dokument beschreibt die implementierten technischen und organisatorischen Maßnahmen zur Sicherstellung eines angemessenen Schutzniveaus personenbezogener Daten im Belegmanager.

---

## 1. Zutrittskontrolle (physisch)

| Maßnahme | Status |
|---|---|
| Serverinfrastruktur bei Supabase Cloud (EU-Frankfurt) – kein eigenes Rechenzentrum | ✅ |
| Zugang zur Supabase-Konsole nur für autorisierte Entwickler mit MFA | ✅ |
| Vercel-Dashboard-Zugang nur mit MFA | ✅ |

---

## 2. Zugangskontrolle (logisch)

| Maßnahme | Status |
|---|---|
| Supabase Auth mit E-Mail + Passwort, Pflicht-E-Mail-Verifizierung | ✅ |
| Passwörter werden ausschließlich als bcrypt-Hash gespeichert (Supabase Auth) | ✅ |
| Session-Token-Rotation via `@supabase/ssr` Middleware | ✅ |
| Rate Limiting auf Auth-Endpoints (20 Requests/Minute/IP) | ✅ |
| Admin-Panel nur für verifizierte System-Admins (separate Rollentabelle) | ✅ |
| Supabase Service Role Key ausschließlich serverseitig (API Routes), nie im Browser | ✅ |

---

## 3. Zugriffskontrolle (Autorisierung)

| Maßnahme | Status |
|---|---|
| Row Level Security (RLS) auf allen Supabase-Tabellen mit `mandant_id` | ✅ |
| Keine mandantenübergreifenden Datenzugriffe möglich (multi-tenancy by design) | ✅ |
| Rollenmodell: Admin / Buchhalter innerhalb eines Mandanten | ✅ |
| Monatsabschluss-Sperre: gesperrte Monate unveränderbar | ✅ |
| Impersonation-Audit: jede Admin-Impersonation ist nachvollziehbar | ✅ |

---

## 4. Übertragungskontrolle

| Maßnahme | Status |
|---|---|
| TLS 1.2+ für alle Verbindungen (Vercel + Supabase erzwingen HTTPS) | ✅ |
| HSTS mit `max-age=63072000; includeSubDomains; preload` | ✅ |
| Dateiuploads ausschließlich via signierte Supabase-Storage-URLs | ✅ |
| Signed URLs für Belegvorschau (zeitlich begrenzt, nicht dauerhaft öffentlich) | ✅ |
| Stripe Webhook Signatur-Verifizierung (`stripe.webhooks.constructEvent`) | ✅ |
| Postmark Inbound Signature-Verifizierung | ✅ |

---

## 5. Eingabekontrolle

| Maßnahme | Status |
|---|---|
| Alle API-Inputs mit Zod validiert (serverseitig) | ✅ |
| File Upload: Dateityp, Dateigröße (max 10 MB), MIME-Whitelist geprüft | ✅ |
| HTML-Sanitisierung mit `sanitize-html` (Tiptap-Inhalte im Hilfe-Center) | ✅ |
| Parameterized Queries durch Supabase ORM (kein SQL-Injection-Risiko) | ✅ |
| Duplikat-Erkennung via SHA-256-Hash bei Belegupload | ✅ |

---

## 6. Verfügbarkeitskontrolle

| Maßnahme | Status |
|---|---|
| Supabase: automatische Backups (täglich, Point-in-Time-Recovery) | ✅ |
| Vercel: globales CDN mit automatischem Failover | ✅ |
| Storage: Supabase S3-kompatibles Object Storage mit Redundanz | ✅ |
| Disaster Recovery: Supabase-Restore aus Backup jederzeit möglich | ✅ |

---

## 7. Trennungskontrolle (Multi-Tenancy)

| Maßnahme | Status |
|---|---|
| Jede Tabelle hat `mandant_id` als Pflichtfeld | ✅ |
| RLS-Policies verhindern mandantenübergreifende Queries auf Datenbankebene | ✅ |
| Storage-Bucket mit Pfad `{mandant_id}/...` – RLS auch auf Storage | ✅ |
| Supabase Anon Key hat keine Schreibrechte außerhalb RLS-Kontext | ✅ |

---

## 8. Content Security Policy

| Maßnahme | Status |
|---|---|
| CSP mit kryptographischem Nonce pro Request (middleware.ts) | ✅ |
| `X-Frame-Options: DENY` – kein Clickjacking | ✅ |
| `X-Content-Type-Options: nosniff` | ✅ |
| `Referrer-Policy: strict-origin-when-cross-origin` | ✅ |
| `Permissions-Policy: camera=(), microphone=(), geolocation=()` | ✅ |

---

## 9. Pseudonymisierung / Datensparsamkeit

| Maßnahme | Status |
|---|---|
| Keine Erhebung unnötiger personenbezogener Daten | ✅ |
| OCR-Ergebnisse werden nur als strukturierte Felder gespeichert, keine Rohdaten | ✅ |
| E-Mail-Rohdaten des Inbound-Eingangs werden nicht dauerhaft gespeichert | ✅ |

---

## 10. Offene Punkte (TODO)

| Maßnahme | Priorität | Status |
|---|---|---|
| Magic-Byte-Check bei File Uploads (serverseitig Buffer-Header prüfen) | Hoch | ⏳ Offen |
| Audit-Log für kritische Dateioperationen (Beleg-Löschung, Monatsabschluss) | Mittel | ⏳ Offen |
| Automatisches Session-Timeout nach Inaktivität (clientseitig) | Niedrig | ⏳ Offen |
| `npm audit` in CI/CD-Pipeline integrieren | Mittel | ⏳ Offen |
| Anthropic AVV / DPA abschließen | Hoch | ⏳ Offen |

---

## Änderungshistorie

| Datum | Änderung | Bearbeiter |
|---|---|---|
| 2026-04-20 | Erstversion | Patrick Kindlmayr |
