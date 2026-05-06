export const metadata = {
  title: 'Datenschutzerklärung – Belegmanager Scan App',
  description: 'Datenschutzerklärung der Belegmanager Scan App für iOS und Android',
};

export default function AppDatenschutzPage() {
  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px', fontFamily: 'sans-serif', color: '#1a1a1a', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#08525E', marginBottom: 8 }}>
        Datenschutzerklärung
      </h1>
      <p style={{ color: '#4A6B75', marginBottom: 32 }}>
        Belegmanager Scan App · iOS &amp; Android · Stand: Mai 2026
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#08525E', marginBottom: 12 }}>1. Verantwortlicher</h2>
        <p>
          Mehr.Wert Gruppe GmbH<br />
          Österreich<br />
          E-Mail: office@online-mehrwert.at
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#08525E', marginBottom: 12 }}>2. Welche Daten werden verarbeitet?</h2>
        <p>Die App verarbeitet folgende Daten:</p>
        <ul style={{ paddingLeft: 24, marginTop: 8 }}>
          <li><strong>Kameradaten:</strong> Fotos von Belegen/Rechnungen, die Sie mit der Kamera aufnehmen. Die Bilder werden ausschließlich für den Upload in Ihren Belegmanager-Account verwendet.</li>
          <li><strong>Fotos aus der Galerie:</strong> Bilder oder PDFs, die Sie manuell aus Ihrer Gerätegalerie auswählen.</li>
          <li><strong>Anmeldedaten:</strong> E-Mail-Adresse und Passwort für die Authentifizierung über Ihren bestehenden Belegmanager-Account.</li>
          <li><strong>Biometrische Daten (optional):</strong> Face ID oder Fingerabdruck – ausschließlich zur lokalen Gerätesperre. Biometrische Daten verlassen Ihr Gerät nicht und werden nicht übertragen.</li>
          <li><strong>Belegmetadaten:</strong> Von Ihnen eingegebene Informationen wie Datum, Betrag, Lieferant, Anmerkungen und Tags.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#08525E', marginBottom: 12 }}>3. Zweck der Verarbeitung</h2>
        <ul style={{ paddingLeft: 24 }}>
          <li>Digitalisierung und Verwaltung von Belegen und Rechnungen</li>
          <li>Automatische Texterkennung (OCR) zur Datenextraktion</li>
          <li>Synchronisation mit dem Belegmanager Web-Account des Nutzers</li>
          <li>Sichere Authentifizierung und Zugriffskontrolle</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#08525E', marginBottom: 12 }}>4. Datenspeicherung</h2>
        <p>
          Alle Daten werden auf Servern von <strong>Supabase</strong> in der EU-Region <strong>Frankfurt (Deutschland)</strong> gespeichert. Die Speicherung erfolgt DSGVO-konform. Es findet keine Weitergabe an Dritte statt, außer an die für den Betrieb notwendigen Auftragsverarbeiter (Supabase Inc., USA – mit EU-Standardvertragsklauseln).
        </p>
        <p style={{ marginTop: 8 }}>
          Lokal auf Ihrem Gerät werden gespeichert: Authentifizierungs-Token (verschlüsselt im iOS Secure Enclave / Android Keystore), App-Einstellungen (kein Personenbezug).
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#08525E', marginBottom: 12 }}>5. Berechtigungen</h2>
        <ul style={{ paddingLeft: 24 }}>
          <li><strong>Kamera:</strong> Erforderlich zum Fotografieren von Belegen. Wird nur aktiv, wenn Sie die Scan-Funktion nutzen.</li>
          <li><strong>Fotomediathek:</strong> Erforderlich zum Importieren bestehender Fotos. Wird nur aktiv, wenn Sie manuell einen Import starten.</li>
          <li><strong>Face ID / Biometrie (iOS):</strong> Optional, für schnellen App-Zugang. Kann in den Einstellungen deaktiviert werden.</li>
          <li><strong>Fingerabdruck / Biometrie (Android):</strong> Optional, für schnellen App-Zugang. Kann in den Einstellungen deaktiviert werden.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#08525E', marginBottom: 12 }}>6. Ihre Rechte (DSGVO)</h2>
        <p>Sie haben das Recht auf:</p>
        <ul style={{ paddingLeft: 24 }}>
          <li>Auskunft über gespeicherte Daten (Art. 15 DSGVO)</li>
          <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
          <li>Löschung Ihrer Daten (Art. 17 DSGVO)</li>
          <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
          <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
          <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)</li>
        </ul>
        <p style={{ marginTop: 8 }}>
          Anfragen richten Sie bitte an: <strong>office@online-mehrwert.at</strong>
        </p>
        <p style={{ marginTop: 8 }}>
          Sie haben außerdem das Recht, Beschwerde bei der österreichischen Datenschutzbehörde einzulegen:<br />
          Österreichische Datenschutzbehörde · Barichgasse 40-42 · 1030 Wien · <a href="https://www.dsb.gv.at" style={{ color: '#1D8A9E' }}>www.dsb.gv.at</a>
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#08525E', marginBottom: 12 }}>7. Datenlöschung</h2>
        <p>
          Belege und Metadaten werden auf Wunsch gelöscht. Zur vollständigen Kontolöschung wenden Sie sich an office@online-mehrwert.at. Die Löschung erfolgt innerhalb von 30 Tagen.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#08525E', marginBottom: 12 }}>8. Kontakt</h2>
        <p>
          Bei Fragen zum Datenschutz:<br />
          <strong>Mehr.Wert Gruppe GmbH</strong><br />
          E-Mail: office@online-mehrwert.at
        </p>
      </section>

      <p style={{ fontSize: 13, color: '#8EA8B0', borderTop: '1px solid #E2EEF0', paddingTop: 24, marginTop: 32 }}>
        Diese Datenschutzerklärung gilt für die Belegmanager Scan App (iOS &amp; Android). Stand: Mai 2026.
      </p>
    </main>
  );
}
