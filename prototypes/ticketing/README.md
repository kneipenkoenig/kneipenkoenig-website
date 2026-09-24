# Kneipenkönig – Ticketing-Prototyp

Lokaler Design- und Ablaufentwurf. Kein Zahlungssystem, keine externen API-Aufrufe, keine echten Reservierungen und keine E-Mails. Beispieldaten werden lokal im Browser gespeichert.

Vom Repository-Verzeichnis starten:

```powershell
node prototypes/ticketing/serve.cjs
```

Vorschau: http://127.0.0.1:8766/

Manager-Vorschau: http://127.0.0.1:8766/prototypes/ticketing/manager.html

Verkauf und Manager teilen ihre Demo-Daten lokal im selben Browserprofil. Manager-Browsertest: `node tests/ticketing-manager.cjs`.

Ausprobieren: Quizabend auswählen → Teamticketarten hinzufügen → optionale Teamnamen → Beispielkontakt → Demo-Buchung. Im Manager einchecken; danach mit dem Ticketcode in die lokale Quiz-Lobby. Unter „Vorgaben“ und „Teilnahme & Regeln“ lassen sich die bestätigten Produktregeln ausprobieren.

Alle Termine, Kontingente und Preise sind Beispieldaten. QR-Code enthält ausschließlich einen Demo-Hinweis. Die bewusst einfachen DEMO-Codes sind keine Vorlage für produktive Tokens. Die Registrierung ist auf ein Teamticket mit einem Team-Buzzer ausgelegt.

Browserprüfung bei laufendem Server:

```powershell
node tests/ticketing-prototype.cjs
```

Der Test verwendet den bestehenden lokalen Playwright-Runtimepfad und Microsoft Edge. Für eine spätere CI-Einbindung müssen diese Testabhängigkeiten regulär im Projekt deklariert werden. Keine neue npm-Abhängigkeit wurde installiert. Backend und Website bleiben unverändert.

## Umgesetzt nach dem Produktinterview

Verkauf und Manager verwenden jetzt denselben lokalen Browserdatenbestand (`kk-ticketing-manager-demo-v1`). Eingaben bleiben nach dem Neuladen erhalten. Ausschließlich Beispieldaten verwenden. Zurücksetzen aller Daten ist im Manager möglich; „Neu starten“ im Verkauf leert nur den laufenden Warenkorb.

- Mehrere Teamtickets mit eigener Ticketgröße, Preis, optionalem Teamnamen, Demo-Code und individuellem Namenslink. Keine tatsächliche Personenzahl.
- Neue globale Vorgaben unter „Vorgaben“; bestehende Events behalten ihren Snapshot. Pro Event „Teilnahme & Regeln“; globale Vorgaben können gezielt ins Formular übernommen werden.
- Maximalzahl Teamtickets pro Bestellung; Event-, Ticketart- und Gruppenlimits werden gemeinsam in der lokalen Buchung geprüft. Keine serverseitige Reservierung.
- Namensfrist und Erinnerungszeit in Stunden, Plausibilitätsprüfung, eindeutige Namen pro Event; Ersatznamen bei Fristablauf. Mitarbeiter können Namen nachträglich ändern.
- Konfigurierbarer Check-in vor Quizbeitritt; offene Barzahlung blockiert ihn nicht. Zahlungsstatus wird dabei nicht verändert.
- Warteliste mit E-Mail-Pflicht und optionaler WhatsApp-Nummer. Manager öffnet einen vorbereiteten WhatsApp-Text; Versand bleibt manuell.
- Optionen für bevorzugtes Kaufrecht und Sammelbenachrichtigung. Beide zunächst deaktiviert. Bei gleichzeitigem Einsatz hat eine aktive Reservierung Vorrang.
- Duplikate kopieren Einstellungen und Ticketdefinitionen, keine Buchungen oder Kontakte. Neue IDs, Entwurf und neu zu prüfender Verkaufszeitraum.


### Bewusste Grenzen der lokalen Vorschau

Kein produktives Backend, keine echte Quizsession, keine Zahlungen, keine versendeten E-Mails oder Wallet-Pässe. Namenslinks sind nur im selben Browserprofil nutzbar; sie sind keine produktive Zugriffskontrolle. Erinnerung und Wartelistenautomatiken sind konfigurierbar, aber nicht als Hintergrundversand implementiert. Ersatznamen werden beim Laden und im offenen Manager spätestens bei der nächsten 30-Sekunden-Prüfung vergeben. Bei geschlossenem Browser laufen keine Jobs. Druck/PDF-Speichern erfolgt über den Browser, nicht als automatisch erzeugter Mailanhang.

`rules.js` enthält gemeinsam verwendete Regeln, `store.js` migriert vorhandene Demo-Daten. Die Beispieldaten verwenden zunächst 5 Teamtickets pro Bestellung, 24 Stunden Namensfrist, 48 Stunden Erinnerung und 24 Stunden Kaufrecht; diese Werte sind änderbare Demo-Startwerte, keine vom Nutzer festgelegten Standards.

Verifikation: `node tests/ticketing-manager.cjs` und `node tests/ticketing-prototype.cjs`, jeweils Desktop (1440px) und Mobil (390px).

Zusätzlicher Regeltest: `node tests/ticketing-rules.cjs` prüft gemeinsame Kontingente, Berliner Sommer-/Winterzeit, Fristgrenzen, idempotente Ersatznamen, Namenseindeutigkeit, Quiz-Zugang und WhatsApp-Linkbildung.

## Manager-Erweiterungen vom 24.09.2026

- Zeiten für Einlass, Beginn und Ende stehen nur in 15-Minuten-Schritten zur Auswahl.
- Der Verkauf beginnt standardmäßig mit der Veröffentlichung. Ein optionales Datumsfenster verwendet als Start den heutigen Tag und als Ende den Eventtag.
- „Tische insgesamt“ ist das maßgebliche gemeinsame Limit. Ein 4er- oder 6er-Ticket verbraucht jeweils einen Tisch. Eigene Typ-Limits sind nur für Locations mit fest vorgegebenen Tischtypen sinnvoll.
- Tische können zurückgehalten werden. Sie sind im öffentlichen Verkauf nicht verfügbar, können aber im Manager persönlich oder für Wartelisten-Teams vergeben werden. Die Gesamtzahl der Tische bleibt dabei zwingend begrenzt.
- Interne Bestellungen können mit global gepflegten Zahlungskennzeichen wie „Abendkasse“ offen erfasst werden. Einlass und Zahlung bleiben getrennt.
- „A4 Teamliste / PDF“ erstellt eine kompakte Druckansicht mit maximal 30 Teams je Seite; der Browser speichert sie über den Druckdialog als PDF.
- Globale Ticketvorlagen lassen sich bei einzelnen Events auswählen und danach eventbezogen anpassen.
- Für Bestätigung, Ticket, Reminder und Nachfassmails stehen drei CI-konforme E-Mail-Designs zur Auswahl: Quiztheke, Papierticket und Lichterabend. Sie sind global voreinstellbar und pro Event überschreibbar.
