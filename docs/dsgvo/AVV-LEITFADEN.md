# Auftragsverarbeitungsverträge (AVV) – Abschluss-Leitfaden
**Art. 28 DSGVO | Belegmanager | Mehr.Wert Gruppe GmbH**
**Stand: April 2026**

---

## Überblick

Ein AVV (Auftragsverarbeitungsvertrag) ist nach Art. 28 DSGVO **zwingend erforderlich**, wenn ein externer Dienstleister im Auftrag personenbezogene Daten verarbeitet. Alle unten gelisteten Anbieter sind Auftragsverarbeiter des Belegmanagers.

> **Wichtig für Österreich:** Zusätzlich zum DSGVO-AVV kann eine Meldung bei der österreichischen Datenschutzbehörde (DSB) erforderlich sein, wenn besonders sensible Daten verarbeitet werden. Buchführungsdaten gelten als normale (nicht besonders sensible) Daten – eine DSB-Meldung ist daher für den Belegmanager-Basisbetrieb nicht erforderlich.

---

## 1. Supabase (Datenbank, Auth, Storage)

### Status: AVV abzuschließen
### Risiko: KRITISCH – Herzstück der Infrastruktur

**Was Supabase verarbeitet:**
- Alle Benutzerdaten (Auth)
- Alle mandantenbezogenen Geschäftsdaten
- Hochgeladene Belegdokumente (Storage)

**Drittlandtransfer:** Nein – EU-Frankfurt (eu-central-1)

**AVV abschließen:**
1. Einloggen in das Supabase Dashboard: https://supabase.com/dashboard
2. Navigieren zu: **Organization Settings → Legal**
3. Den **Data Processing Agreement (DPA)** digital unterzeichnen
4. Download des signierten DPA als PDF

**Alternativ:** Supabase stellt die DPA-Vorlage auch unter https://supabase.com/privacy bereit. Für EU-Kunden ist der DPA bereits in den Terms of Service integriert (self-serve). Für Enterprise: sales@supabase.io.

**Zu dokumentieren:** Datum der Unterzeichnung, Version des DPA, zuständige Ansprechperson.

---

## 2. Stripe (Zahlungsabwicklung)

### Status: AVV abzuschließen
### Risiko: HOCH – Zahlungsdaten

**Was Stripe verarbeitet:**
- Kundendaten für Abonnement-Verwaltung (Name, E-Mail des Mandanten-Admins)
- Zahlungsdaten (Kreditkartendaten NUR bei Stripe, nie im Belegmanager)
- Rechnungshistorie

**Drittlandtransfer:** Stripe Inc. ist US-Unternehmen, nutzt aber EU-Rechenzentren und SCCs.

**AVV abschließen:**
1. Stripe Dashboard: https://dashboard.stripe.com
2. **Settings → Compliance → Data processing agreement**
3. DPA direkt im Dashboard bestätigen (self-service)
4. PDF herunterladen und archivieren

**Hinweis:** Stripe ist auch PCI-DSS Level 1 zertifiziert – Kreditkartendaten berühren den Belegmanager-Server nie (Stripe.js / hosted fields).

**Link zur Stripe DPA:** https://stripe.com/de/legal/dpa

---

## 3. Postmark (E-Mail-Belegeingang, transaktionale E-Mails)

### Status: AVV abzuschließen
### Risiko: MITTEL – E-Mail-Inhalte enthalten ggf. Rechnungsdaten

**Was Postmark verarbeitet:**
- Eingehende E-Mails an testphase@belegmanager.at (Rechnungsanhänge)
- Ausgehende Systembenachrichtigungen (falls genutzt)
- Absender-E-Mail-Adressen der Lieferanten

**Drittlandtransfer:** ActiveCampaign (Mutterfirma von Postmark) ist US-Unternehmen. Postmark betreibt Server in den USA und EU.

**AVV abschließen:**
1. Postmark Account Settings: https://account.postmarkapp.com
2. **Account → Privacy / GDPR → Data Processing Agreement**
3. DPA anfordern oder bestätigen

**Alternative:** Postmark-DPA direkt anfordern: privacy@postmarkapp.com
**Link:** https://postmarkapp.com/gdpr

**Empfehlung EU-Server:** In den Postmark-Einstellungen die **EU-Region** für den Inbound-Stream konfigurieren, um Drittlandtransfer zu minimieren.

---

## 4. Vercel (Hosting / CDN)

### Status: AVV abzuschließen
### Risiko: MITTEL – Request-Logs, IP-Adressen

**Was Vercel verarbeitet:**
- HTTP-Request-Logs (IP-Adressen, User Agents, Timestamps)
- Serverless Function Logs
- Deployment-Artifacts (Next.js Build)

**Drittlandtransfer:** Vercel Inc. ist US-Unternehmen. CDN-Nodes global (auch außerhalb EU). Serverless Functions können auf EU-Regionen beschränkt werden.

**AVV abschließen:**
1. Vercel Dashboard: https://vercel.com/dashboard
2. **Team Settings → Privacy / Legal → DPA**
3. DPA digital unterzeichnen

**Link zur Vercel DPA:** https://vercel.com/legal/dpa

**Empfehlung:** In den Project Settings die **Region auf `fra1` (Frankfurt)** setzen, um Server-seitige Verarbeitung in der EU zu halten. Das CDN bleibt global – dies ist unvermeidbar, betrifft aber nur statische Assets (kein direkter Zugriff auf personenbezogene Daten).

---

## 5. Anthropic (Claude API / OCR)

### Status: AVV dringend abzuschließen
### Risiko: HOCH – Rechnungsdokumente werden analysiert

**Was Anthropic verarbeitet:**
- Inhalte der hochgeladenen Belege (Base64-Bild oder Text) zur OCR-Extraktion
- Anfrage-Metadaten (API-Key, Timestamps)

**Drittlandtransfer:** Anthropic ist US-Unternehmen (San Francisco). Server in den USA.

**AVV / DPA abschließen:**
1. Anthropic Console: https://console.anthropic.com
2. **Settings → Privacy / DPA** (bei Enterprise-Accounts verfügbar)
3. Für Self-Serve: privacy@anthropic.com kontaktieren

**Link:** https://www.anthropic.com/legal/privacy

**Alternativen prüfen:**
- Anthropic bietet für EU-Kunden zunehmend EU-Datenresidenz an – prüfen ob verfügbar
- Falls kein DPA möglich: OCR-Alternative mit EU-Hosting evaluieren (z.B. Azure Document Intelligence, EU-Region)

**Sofortmaßnahme (bis DPA abgeschlossen):**
Im OCR-Aufruf sicherstellen, dass die Daten nicht für Trainings genutzt werden – Anthropic's API Data Privacy Policy gilt für API-Kunden (kein Training auf API-Daten standardmäßig, aber DPA ist trotzdem Pflicht).

---

## 6. FinAPI (automatischer Kontoauszug-Import)

### Status: AVV prüfen (falls PROJ-20 aktiv genutzt)
### Risiko: HOCH – Bankverbindungsdaten, PSD2

**Was FinAPI verarbeitet:**
- Bankzugangsdaten (via FinAPI WebForm, nicht direkt im Belegmanager)
- Kontoumsätze, Salden
- IBAN/BIC des Mandanten

**Drittlandtransfer:** FinAPI GmbH ist deutsches Unternehmen, Daten in der EU.

**AVV abschließen:**
- FinAPI stellt einen AVV bereit: https://www.finapi.io/datenschutz
- Im FinAPI-Kundenportal oder per E-Mail: support@finapi.io

---

## Dokumentations-Checkliste

Nach Abschluss jedes AVV das folgende Dokument aktualisieren:

| Anbieter | AVV abgeschlossen | Datum | Version | Archivpfad |
|---|---|---|---|---|
| Supabase | ⬜ | | | docs/dsgvo/avv/ |
| Stripe | ⬜ | | | docs/dsgvo/avv/ |
| Postmark | ⬜ | | | docs/dsgvo/avv/ |
| Vercel | ⬜ | | | docs/dsgvo/avv/ |
| Anthropic | ⬜ | | | docs/dsgvo/avv/ |
| FinAPI | ⬜ | | | docs/dsgvo/avv/ |

> Unterschriebene AVV-PDFs lokal unter `docs/dsgvo/avv/` ablegen (NICHT in Git commiten – Ordner in .gitignore eintragen).

---

## .gitignore-Eintrag (jetzt hinzufügen)

```
# DSGVO-Dokumente mit personenbezogenen Daten oder Vertragsdetails
docs/dsgvo/avv/
```

---

## Änderungshistorie

| Datum | Änderung | Bearbeiter |
|---|---|---|
| 2026-04-20 | Erstversion | Patrick Kindlmayr |
