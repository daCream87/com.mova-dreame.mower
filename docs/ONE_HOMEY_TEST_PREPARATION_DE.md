# Ein Homey Pro – Sicherer Testvorlauf (3. November 2026)

## Aktueller Stand
Dieser Integrationsbranch enthält **die vollständige CORE-Codebasis** von
`integration/a2-full-core-andi-fixes-20261103` und zusätzlich die **rein
lesende** PR1-MQTT-Auftragsklassifizierung.

- Original-App-Wartungspunktfahrt `TASK 109` wird separat vom generischen
  Mähstatus protokolliert. Eine eindeutig übertragene Punktnummer P1 / P2
  bleibt getrennt, fehlende Nummern werden nicht erraten.
- Pause, Fortsetzen und aktive Fahrt erscheinen als passive Diagnosen.
- Logpräfix `[mqtt-action-observer]`.
- **Keine zweite PAUSE/STOP- oder Garagentor-Steuerung** eingefügt.
  Es steuert weiterhin ausschließlich der bestehende CORE-Garagencontroller.
- Kamera/Video sind NICHT enthalten.
- Dieser Branch ist noch **nicht für eine Installation am realen Mäher**
  oder als finaler Upstream-PR abgenommen.

## Warum PR1 auf dem einzigen Homey nicht separat installieren?
Standalone PR1 hat dieselbe Homey-App-ID wie die vollständige CORE-Version.
`homey app run` und `homey app install` können die bereits vorhandene App
ersetzen. Da PR1 nur einen Teilumfang enthält, fehlen anschließend weitere
CORE-Funktionen. Keine parallele Installation mit derselben App-ID.

## Vor jeder künftigen Installation
1. **Exakten installierten Quellstand/ZIP separat sichern.** Das GitHub-
   Integrationsbranch ist kein Beleg für den tatsächlich installierten Build.
2. **Homey-Backup erstellen:** Homey-App -> Mehr -> Backups -> Backup
   erstellen (bei vorhandener Backup-Berechtigung), oder offizieller
   lokaler USB-Backupweg. Die Homey-Pro-Cloud sichert gerade **nicht** die
   App-Binärdateien von per Entwicklerwerkzeug installierten Apps. Bei einer
   vollständigen Wiederherstellung kann ein Zurücksetzen notwendig sein.
3. Bestehende Geräte, Fähigkeiten, Flows und Einstellungen dokumentieren;
   nach dem Update prüfen, dass alle vorhanden und funktionsfähig bleiben.
4. Beim Test muss die genaue Build-SHA im Log stehen; keine Installation des
   abgespeckten PR1-Arbeitsbranches auf dem Produktivgerät.

## Was kann man ohne den Mäher testen?
- `npm ci`
- `npm test`
- `homey app validate --level publish`
- GitHub Actions mit derselben Testsuite auf diesem Branch.
Diese Prüfungen ersetzen **keinen** echten Fahr- oder Torsicherheitstest.

## Erste Live-Diagnose auf dem Homey (erst nach abgeschlossener Prüfung)
- Kein tatsächlicher Test auf eine physisch geschlossene Torfläche, solange
  MQTT die einzige Stopp-Sicherung ist.
- Auf freier Fläche mit unmittelbar erreichbarem Stopp die Original-App-
  Aktionen Pause/Fortsetzen protokollieren; keine unerwünschte Torbewegung.
- P1 und P2 je separat in einer freigegebenen sicheren Testzone anfahren,
  dabei jeweils native `TASK 109`-Einträge und den exakten beobachteten Index
  prüfen. Wenn MQTT keinen Index enthält, muss dies als `point_unknown`
  erscheinen statt P1 zu erfinden.
- Mit abgesichertem, unabhängig freiem Torweg erst danach Starts und Rückkehr
  sowie MQTT->PAUSE->STOP->Tor-Sensorkontakt-Reaktionszeiten testen.
- Homey-Live-Log im PC-Terminal mitspeichern; Zugangsdaten und Tokens entfernen.

## Derzeit noch offen
- Es fehlt die vollständige Korrektur von Andis kritischen Einwänden
  (Native-Map-Lebenszyklus, Geometrieidentität, Race Conditions, Migration).
- Die P1/P2-Klassifizierung ist ein passives Signal, keine vollständige
  Anlern-/Positionsfreigabe oder automatische Punktnavigation.
- Der vollständige Integrationsbranch muss noch den gemeinsamen
  Regressionstest und Homey-Publish-Test bestehen.
- Die physische Anhalte-Reaktionszeit ist nicht nachgewiesen.
- Ein produktiver Mäher-Test sollte erst nach unabhängiger Sicherung und
  vorbereiteter Rückinstallation der jetzigen Version stattfinden.

**Fazit:** Vorbereitung ohne Risiko für den einzigen Homey: Code auf GitHub
prüfen, alte App sichern, Homey-Backup anlegen, noch nichts überschreiben.
