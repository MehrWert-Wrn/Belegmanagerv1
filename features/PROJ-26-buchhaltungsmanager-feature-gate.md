# PROJ-26: Buchhaltungsmanager Feature-Gate

## Status: Planned
**Created:** 2026-04-17
**Last Updated:** 2026-04-17

## Dependencies
- Requires: PROJ-1 (Authentifizierung) – Auth-Kontext für Mandant-Check
- Requires: PROJ-2 (Mandant-Onboarding) – `mandanten`-Tabelle muss existieren
- Requires: PROJ-19 (Admin Panel) – Admin-UI für manuelle Aktivierung (Phase 2)
- Requires: PROJ-16 (SaaS-Billing via Stripe) – Stripe-Webhook für Plan-Upgrade-Trigger (Phase 2)

---

## Overview

Das Feature-Gate steuert die Sichtbarkeit des gesamten Buchhaltungsmanagers. Es verhindert, dass unfertige Buchhaltungsmanager-Funktionen für reguläre Mandanten sichtbar sind.

**Phase 1 (jetzt):** Globaler Dev-Flag via Umgebungsvariable – Buchhaltungsmanager sichtbar nur wenn `BUCHHALTUNG_ENABLED=true` im Server-Kontext gesetzt ist.

**Phase 2 (nach Fertigstellung):** Pro-Mandant-Aktivierung durch Software-Admin (manuell im Admin-Panel) ODER automatisch via Stripe-Webhook wenn Mandant auf "Professional"-Plan upgradet. Durch den User (Admin) wird Phase 2 manuell freigegeben.

---

## User Stories

### US-1: Dev-Flag (Phase 1)
Als Entwickler möchte ich den Buchhaltungsmanager über eine Umgebungsvariable aktivieren können, damit die UI nur am Dev-Server sichtbar ist und bestehende Mandanten nicht betroffen sind.

**Acceptance Criteria:**
- [ ] Umgebungsvariable `BUCHHALTUNG_ENABLED` steuert globale Sichtbarkeit
- [ ] Wenn `BUCHHALTUNG_ENABLED=true`: Buchhaltungsmanager-Navigation und -UI für alle Mandanten sichtbar (Dev-Modus)
- [ ] Wenn `BUCHHALTUNG_ENABLED` nicht gesetzt oder `false`: keinerlei Buchhaltungsmanager-UI sichtbar, keine API-Routen erreichbar (404 oder 403)
- [ ] Flag wird ausschließlich serverseitig geprüft (nie im Frontend-Bundle exponiert)
- [ ] Alle PROJ-27/28/29-Komponenten prüfen das Flag – kein Bypass möglich

### US-2: Neues DB-Feld für Pro-Mandant-Aktivierung (Phase 1 vorbereiten)
Als Entwickler möchte ich das Datenbankschema für Phase 2 bereits vorbereiten, damit kein späteres Schema-Breaking-Change notwendig ist.

**Acceptance Criteria:**
- [ ] Neues Feld `mandanten.buchhaltung_enabled: boolean DEFAULT false`
- [ ] RLS: Mandant kann Feld nicht selbst setzen (nur Admin/Service Role)
- [ ] Migration wird deployed, aber das Feld hat noch keinen Effekt auf die UI (Phase 2)

### US-3: Admin aktiviert Buchhaltungsmanager pro Mandant (Phase 2)
Als Software-Admin möchte ich im Admin-Panel für jeden Mandanten den Buchhaltungsmanager aktivieren oder deaktivieren können.

**Acceptance Criteria:**
- [ ] In `/admin/mandanten/[id]`: neuer Abschnitt „Buchhaltungsmanager"
- [ ] Toggle: Aktiviert / Deaktiviert mit Bestätigungsdialog
- [ ] Aktivierung/Deaktivierung wird in `admin_audit_log` geloggt
- [ ] Nach Aktivierung: Mandant sieht Buchhaltungsmanager-Navigation beim nächsten Seitenaufruf

### US-4: Stripe-Webhook triggert Freischaltung (Phase 2)
Als Mandant möchte ich durch Upgrade auf den „Professional"-Plan automatisch Zugang zum Buchhaltungsmanager erhalten, ohne auf manuelle Admin-Freischaltung warten zu müssen.

**Acceptance Criteria:**
- [ ] Stripe-Webhook `customer.subscription.updated`: wenn neuer Plan = Professional → `mandanten.buchhaltung_enabled = true`
- [ ] Stripe-Webhook `customer.subscription.deleted` oder Downgrade auf Basic → `mandanten.buchhaltung_enabled = false`
- [ ] Mandant sieht nach Upgrade sofort (bei nächstem Seitenaufruf) den Buchhaltungsmanager

### US-5: Gate-Check in allen Buchhaltungsmanager-Routes (Phase 1 + 2)
Als System möchte ich sicherstellen, dass Mandanten ohne Freischaltung keinen Zugriff auf Buchhaltungsmanager-Daten haben, auch wenn sie direkt URLs aufrufen.

**Acceptance Criteria:**
- [ ] Alle `/buchhaltung/*`-Routes prüfen serverseitig: `BUCHHALTUNG_ENABLED=true` (Phase 1) UND später `mandanten.buchhaltung_enabled=true` (Phase 2)
- [ ] Zugriff ohne Freischaltung → HTTP 403 (API) oder Redirect auf `/dashboard` (Pages)
- [ ] Middleware oder shared Guard-Funktion – keine doppelte Implementierung pro Route

---

## Edge Cases

- Dev-Flag gesetzt, Mandant hat `buchhaltung_enabled=false` in DB → In Phase 1 trotzdem sichtbar (Dev-Override), in Phase 2 nicht sichtbar
- Admin deaktiviert Buchhaltungsmanager für aktiven Mandanten → laufende Vorkontierungen bleiben in DB erhalten, nur UI wird ausgeblendet; kein Datenverlust
- Stripe-Downgrade während Mandant aktiv im Buchhaltungsmanager ist → nächster API-Aufruf gibt 403, saubere Fehlermeldung „Dein Plan unterstützt diese Funktion nicht mehr"
- `BUCHHALTUNG_ENABLED` versehentlich in Production gesetzt → alle Mandanten sehen Buchhaltungsmanager, obwohl nicht alle freigeschaltet. Daher: in Phase 2 muss ZUSÄTZLICH `mandanten.buchhaltung_enabled=true` gelten

---

## Technical Requirements

- Security: `BUCHHALTUNG_ENABLED` niemals via `NEXT_PUBLIC_`-Prefix exponieren
- Security: Gate-Check serverseitig in Layout oder Middleware, nie nur client-seitig
- RLS: `buchhaltung_enabled`-Feld nur via Service Role schreibbar
- Rückwärtskompatibilität: Bestehende Mandanten ohne das Feld (NULL) = `false` behandeln

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
