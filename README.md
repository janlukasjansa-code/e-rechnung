# E-Rechnung erstellen (XRechnung 3.0) – kostenlos, im Browser

Ein Tool für Freelancer und Kleinunternehmer: Rechnung ausfüllen, XRechnung-XML herunterladen, fertig.

- XRechnung 3.0 (UN/CEFACT CII), konform zu EN 16931
- Kleinunternehmerregelung (§ 19 UStG) mit einem Klick
- Läuft komplett lokal im Browser: keine Anmeldung, keine Daten auf Servern
- Geprüft mit den offiziellen Prüfregeln (EN 16931 + XRechnung-Schematron, via Mustangproject-Validator)

Starten: `index.html` im Browser öffnen.

Tests: `node test/samples.js` erzeugt Beispielrechnungen in `test/`, die mit
`java -jar Mustang-CLI.jar --action validate --source test/<datei>.xml` geprüft werden.
