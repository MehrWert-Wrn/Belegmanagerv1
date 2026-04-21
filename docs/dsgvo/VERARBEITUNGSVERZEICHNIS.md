# Verarbeitungsverzeichnis (Art. 30 DSGVO)
**Belegmanager | Mehr.Wert Gruppe GmbH**
**Stand: April 2026**

---

## Verantwortlicher

**Mehr.Wert Gruppe GmbH**
[Adresse eintragen]
[PLZ, Ort]
Österreich

Kontakt Datenschutz: [E-Mail eintragen]

---

## 1. Nutzerverwaltung & Authentifizierung

| Feld | Inhalt |
|---|---|
| **Zweck** | Identifikation und Authentifizierung von Benutzern |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) |
| **Betroffene** | Registrierte Nutzer (Mandanten-Admins und Buchhalter) |
| **Datenkategorien** | E-Mail-Adresse, Passwort-Hash, Name, Rolle, Anmeldezeitpunkt |
| **Speicherdauer** | Bis zur Konto-Löschung + 30 Tage Backup-Retention |
| **Empfänger** | Supabase (Auftragsverarbeiter, EU-Frankfurt) |
| **Drittlandtransfer** | Nein (EU-Frankfurt) |

---

## 2. Belegverwaltung

| Feld | Inhalt |
|---|---|
| **Zweck** | Digitale Ablage und Verwaltung von Eingangsrechnungen und Belegen |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung); Art. 6 Abs. 1 lit. c DSGVO (BAO § 132 Aufbewahrungspflicht 7 Jahre) |
| **Betroffene** | Mitarbeiter des Mandanten; Lieferanten (Name/IBAN auf Belegen) |
| **Datenkategorien** | Rechnungsdokumente (PDF/Bild), Metadaten (Lieferant, Betrag, Datum, UID, IBAN), OCR-Extraktionsdaten |
| **Speicherdauer** | 7 Jahre (BAO-Pflicht) nach Erstellung; dann vollständige Löschung |
| **Empfänger** | Supabase Storage (EU-Frankfurt); Anthropic Claude API (OCR, keine Datenspeicherung laut DPA) |
| **Drittlandtransfer** | Anthropic (USA) – SCCs erforderlich, siehe AVV-Leitfaden |

---

## 3. Transaktionen & Kontoauszug-Import

| Feld | Inhalt |
|---|---|
| **Zweck** | Automatisches Matching von Zahlungsausgängen mit Belegen zur Buchhaltungsvorbereitung |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung); Art. 6 Abs. 1 lit. c DSGVO (BAO) |
| **Betroffene** | Kontoinhaber (Mandant); Zahlungsempfänger |
| **Datenkategorien** | Kontonummer (IBAN), Transaktionsdaten (Betrag, Datum, Verwendungszweck, Gegenkonto), Bankbezeichnung |
| **Speicherdauer** | 7 Jahre (BAO) |
| **Empfänger** | Supabase (EU-Frankfurt); FinAPI (EU, bei Nutzung des automatischen Imports) |
| **Drittlandtransfer** | Nein |

---

## 4. E-Mail-Belegeingang (PROJ-30)

| Feld | Inhalt |
|---|---|
| **Zweck** | Automatischer Empfang und Verarbeitung von Belegen via E-Mail |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) |
| **Betroffene** | Absender der E-Mails (typisch: Lieferanten oder Mitarbeiter) |
| **Datenkategorien** | Absender-E-Mail, Betreff, Anhänge (Rechnungsdokumente), Verarbeitungszeitpunkt |
| **Speicherdauer** | E-Mail-Rohdaten: nicht dauerhaft gespeichert (nur Anhänge und Metadaten); Belege: 7 Jahre |
| **Empfänger** | Postmark (USA) – E-Mail-Weiterleitung; Supabase (EU-Frankfurt) |
| **Drittlandtransfer** | Postmark (USA) – SCCs erforderlich |

---

## 5. Abonnement & Billing

| Feld | Inhalt |
|---|---|
| **Zweck** | Verwaltung von SaaS-Abonnements und Zahlungen |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung); Art. 6 Abs. 1 lit. c DSGVO (UGB Buchführungspflicht) |
| **Betroffene** | Mandanten-Admins |
| **Datenkategorien** | Stripe Customer ID, Subscription ID, Zahlungsstatus, Abrechnungszeitraum (keine Kreditkartendaten – diese verarbeitet Stripe direkt) |
| **Speicherdauer** | 7 Jahre (UGB) |
| **Empfänger** | Stripe Inc. (USA/EU) |
| **Drittlandtransfer** | Stripe (USA) – SCCs + Stripe DPA vorhanden |

---

## 6. Support-Tickets

| Feld | Inhalt |
|---|---|
| **Zweck** | Kundenservice und technischer Support |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) |
| **Betroffene** | Nutzer die Tickets erstellen |
| **Datenkategorien** | Name, E-Mail, Ticketinhalt, Nachrichtenverlauf |
| **Speicherdauer** | 2 Jahre nach Ticket-Abschluss |
| **Empfänger** | Supabase (EU-Frankfurt) |
| **Drittlandtransfer** | Nein |

---

## 7. Admin-Panel & Impersonation

| Feld | Inhalt |
|---|---|
| **Zweck** | Support und Verwaltung durch autorisierten Mehr.Wert-Mitarbeiter |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung – Support-Leistung) |
| **Betroffene** | Alle Mandanten bei Impersonation |
| **Datenkategorien** | Alle mandantenbezogenen Daten (nur im aktiven Impersonation-Kontext) |
| **Speicherdauer** | Audit-Log der Impersonations: 1 Jahr |
| **Empfänger** | Nur Mehr.Wert-interne Admins |
| **Drittlandtransfer** | Nein |

---

## Änderungshistorie

| Datum | Änderung | Bearbeiter |
|---|---|---|
| 2026-04-20 | Erstversion | Patrick Kindlmayr |
