# PR1 — sichere Testanleitung (Deutsch)

Basis: Andis Homey-App 1.1.43; Arbeitsbranch
`feature/a2-pr1-mqtt-gate-safety-20261103`.

**WICHTIG: PR1 ist ein eigenständiger Upstream-Beitrag, NICHT die komplette
CORE-Version des Eigentümers.** Gleiche Homey-App-ID. Auf dem produktiven Homey
nicht einfach installieren, denn sonst ersetzt die unfertige Teilversion die
vollständige Integrationsfassung und blendet deren Spezialfunktionen aus.

## 1. Automatisch testen — ohne Homey/Mäher

Auf einem PC (Git und Node.js verfügbar):

```bash
git clone --branch feature/a2-pr1-mqtt-gate-safety-20261103 --single-branch https://github.com/daCream87/com.mova-dreame.mower.git pr1-test
cd pr1-test
npm ci
npm test
npm install --global homey
homey app validate --level publish
```

Aktueller geprüfter Stand: `8fd934addfd9f0a69c222969572f2972940cdbd4`.
GitHub Actions: https://github.com/daCream87/com.mova-dreame.mower/actions/runs/41715297046
Ergebnis 30/30 Tests, Syntaxprüfung und Publish-Validierung grün.
Das beweist KEINE rechtzeitige Reaktion auf den realen MOVA-A2-Motor oder die
tatsächliche Toröffnung.

## 2. Optionale Homey-Diagnose nur auf einem getrennten Test-Homey

Nur wenn ein **separater Test-Homey** vorhanden ist, auf dem die produktive
vollständige CORE-Installation nicht überschrieben wird:

```bash
homey login
homey select
homey app run
```

`homey app run` zeigt die Logs live und entfernt die Test-App bei Beenden.
`homey app install` installiert dagegen dauerhaft ohne den Live-Log-Kanal.

- Garagenautomatik zunächst AUS, keine Tor-Flows aktivieren, Mäher stationär
  und physisch gegen eine Fahrt zum Tor gesichert.
- MQTT-Verbindung und `[mqtt-action]`-Meldungen prüfen.
- META allein soll keinen Motor-, Start-, Stop-, Resume- oder Torbefehl erzeugen.
- `2:56 active_or_continue` ohne verifizierten Außenkontext MUSS
  `activity_observed` bzw. `continue_ambiguous` ergeben und darf nicht
  den Garagenstart-Owner aufrufen.
- `2:50 TASK o=109` muss Wartungsauftrag anzeigen; ohne expliziten
  `point`-Index bleibt die Nummer unbekannt.

## 3. Hardwaretest nur nach separater Sicherheitsfreigabe

Das bewegte Tor und die Mäher-Motoren erfordern eine **unabhängige physische
Schutzmaßnahme**. Reaktive MQTT-Pause/STOP kann bei Broker-, Cloud- und
Netzwerk-Latenz nicht garantieren, vor einer geschlossenen Tür zu stoppen.

Ein Test mit aktivem Mäher ist erst sinnvoll, wenn:
- unabhängige sichere Offenstellung / physische Sperre des Torfahrweges
  hergestellt ist und eine Person mit direkter Stop-Möglichkeit vor Ort ist;
- der exakte Build geprüft, alle vorherigen Flows/Capabilities inventarisiert
  und ein Rückweg auf die vollständige Integrationsversion vorbereitet ist;
- kein selbstständiger Start auf eine wirklich geschlossene Torfläche möglich
  ist, wenn Homey/MQTT versagen.

Dann getrennt erfassen:
1. Manuelles Pause/Fortsetzen auf freier Rasenfläche, Status- und MQTT-META
   und **kein unbeabsichtigtes Toröffnen**.
2. Hersteller-App-Wartungspunkt P1: TASK `109`, Pause/Continue, Ende; keine
   erdachte P2–P5 Nummer. P2–P5-Lernen folgt PR2.
3. Hersteller-App-Start am Dock bei freiem, unabhängig abgesichertem Torweg:
   Zeiten für MQTT `IN_STATION/u1`, PAUSE ACK, STOP ACK, native Ruhe,
   Toröffnungs-Kontakt und Neustart protokollieren.
4. Hersteller-App-Rückkehr: frühe Erkennung, sichere Wegentscheidung,
   physisch geöffneter Zugang vor Einfahrt. Bei Unsicherheit stoppen.
5. Mit Garagenmodus AUS: normale Start/Pause/Fortsetzen/Stop/Dock-Funktionen
   und bestehende Flows müssen wie upstream 1.1.43 bleiben.

## 4. Ergebnis melden

Für jeden hardware-relevanten Durchlauf: Branch + SHA, Uhrzeit,
Garagenmodus, Tor-Kontakt, native Dockzustände, Original-App-Aktion,
`[mqtt-action]`- und `[mqtt-guard]`-Logs, tatsächliche Mäherbewegung,
Fehlfunktion und Stop- oder Wiederherstellungsmaßnahme.

Wenn Test 1/2 schon seltsame Aktionen zeigt: keinen Tor-Test durchführen.
Wenn kein getrennter Test-Homey existiert, **nicht die Teil-PR1-App auf den
Produktiv-Homey installieren**. Erst die vollständige, geprüfte CORE-Version
mit demselben PR1-Modul in einem separaten Integrations-Build einsetzen.

## Status

PR1 ist automatisch prüfbar, aber vor realem Gerät noch nicht abgenommen.
Kamera gehört nicht zu CORE; PR2 ergänzt native Wartungspunkte P1–P5,
Map/Repair/Shuffle, PR3 native Sperrzonen inkl. Lifecycle, PR4 CORE-Overview.
