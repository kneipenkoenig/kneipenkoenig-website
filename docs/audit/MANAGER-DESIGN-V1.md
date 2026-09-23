# Manager: Events & Tickets – erster interaktiver Entwurf

Referenz: die am 23.09.2026 vom Nutzer gelieferten Ticket-Tailor-Screenshots. Umsetzung in Kneipenkönig-Farben, Bebas Neue/Open Sans, deutschsprachiger Navigation und kompakter dunkler Arbeitsoberfläche. Die Screenshots dienen als Funktions-/Layoutreferenz; Namen, E-Mails und Bestellungen daraus wurden nicht importiert.

## Prüfen

Lokale Vorschau: `http://127.0.0.1:8766/prototypes/ticketing/manager.html`

Start über `node prototypes/ticketing/serve.cjs`. Änderungen werden unter dem eigenen Demo-Key `kk-ticketing-manager-demo-v1` in localStorage gespeichert. „Demo zurücksetzen“ löscht nur diese Manager-Demo-Daten. Keine echte Eventverwaltung, keine externe API, kein Versand. Der bestehende Manager bleibt unverändert. Verkaufsprototyp und Manager-Vorschau besitzen derzeit getrennte Datenstände.

## Bereits bedienbar

- Übersicht mit aus Demo-Buchungen berechneten Kennzahlen; Events suchen, Status filtern, vergangene/kommende Events anzeigen.
- Event erstellen, Stammdaten/Termin/Location/Beschreibung ändern, speichern, Verkauf in der Demo pausieren/veröffentlichen.
- Ticketarten anlegen/bearbeiten: Preis, Kontingent, Teamgröße, Mindest-/Höchstmenge, Verkaufsstatus und Restmengenoption.
- Ticketgruppen mit gemeinsamem Limit und Bundles mit enthaltenen Ticketmengen konfigurieren.
- Manuelle Demo-Bestellung mit Event-/Ticket-/Gruppenlimit und Teamgrößenprüfung; Suche und getrennter Check-in mit Rücknahme.
- Einlassliste als CSV exportieren, einfache Auswertung nach Ticketart drucken.
- Wartelistenangebot simulieren; Reminder-/Follow-up-Vorlagen lokal bearbeiten.
- Bestätigungstext mit Vorschau und PDF-/Apple-/Google-Wallet-Ausgabeoptionen konfigurieren.
- Formular-Kernfelder und zusätzliche Textfelder mit Pflichtfeldoption verwalten.
- Quizvorbereitung aus Demo-Bestellungen darstellen; Übernahme simulieren, getrennt vom Einlass.
- Event duplizieren mit neuem Datum und optionaler Übernahme von Ticketkonfiguration, Formular/Bestätigung und Mailvorlagen.

Schnellbedienung: sichtbare Zeilenaktionen, Bearbeitung in seitlichem Dialog, feste Eventnavigation, Speichern-Leiste, `Strg/Cmd+S` zum Speichern des offenen Formulars und `/` zur Suche. Dialoge verwenden natives Modal-Verhalten. Ungespeicherte Formularänderungen werden beim normalen Linkwechsel abgefragt.

## Duplizieren – fachliche Regeln

Neue Event-ID und neue IDs für Ticketarten, Gruppen, Bundles, Zusatzfelder und Reminder. Gruppen-/Bundle-Verweise werden auf die neuen Ticketarten umgeschrieben. Event wird immer als Entwurf angelegt; Datum ist neu anzugeben, Verkaufszeitraum neu zu prüfen.

Keine Übernahme von Bestellungen, Kundendaten, Zahlungen, ausgestellten Tickets, Zugangscodes, Check-ins, Wartelisteneinträgen, Statistik oder Quizsession. Bestehendes Event unverändert. In Produktion erfolgt das Kopieren transaktional mit Idempotency-Key, serverseitiger Eventberechtigung und Audit. Kein doppelter API-Klick darf zwei Kopien erzeugen.

## Noch nicht angebundene Funktionen aus den Referenzen

| Funktion | Stand / nächster Schritt |
|---|---|
| Bild-/Medienverwaltung und Rich Text | Noch Textfeld; Upload/Assetauswahl und sichere Formatierung beim Manager-Anschluss |
| Wiederkehrende Events | Einzelnes Duplizieren vorhanden; Serienplanung mit separater Kapazität je Termin danach |
| Zeitgesteuerte Sichtbarkeit, „erst nach Ticketart X“, Gutscheinauswahl | Nicht implementiert; erweitert Ticket-Regelmodell und Checkout-Tests |
| Globales Formular | Pro Event konfigurierbar; zentrale Formularversion mit bewussten Event-Overrides noch offen |
| Bestellstorno, Rückerstattung, Reservierung/Import | Gehören zum sicheren Backend-Kern; keine scheinbar funktionierenden Zahlungsbuttons in der Demo |
| Echte Einlasskamera/QR-Verifikation | Demo-Bestellungen können eingecheckt werden; Scanner und Tokenprüfung noch offen |
| E-Mail-Planung und Versand | Nur Vorlagen; Queue, Outbox, Empfänger-/Zustellstatus und Wiederholung fehlen noch |
| Ticket-PDF, Apple/Google Wallet | Ausgabeoptionen und Mailvorschau vorhanden; kein PDF/Pass erzeugt, keine Zertifikate konfiguriert |
| Öffentlicher Eventlink/Embed | Manager-Vorschaulink kopierbar; echte Veröffentlichung auf www.kneipenkoenig.de folgt |
| Produkte, freiwillige Beiträge, feingranulare Gebühren | Noch nicht implementiert; vom notwendigen Ticketing-Erstumfang getrennt |
| Website-Aufrufe, Verlaufsdiagramme, Attribution | Keine erfundenen Analytics; erst mit echter Messung |

PDF und Wallet werden gemäß Nutzerwunsch **Bestandteil des produktiven Erstumfangs**, nicht P3. Versand: nach bestätigt erfolgreicher Onlinezahlung, bei erlaubter Barzahlung nach bestätigter Buchung mit offenem Zahlungsstatus. Mail enthält Event, Datum, Einlass, Beginn, Location/Adresse, Käufer/Team, Gruppengröße, Bestellnummer, Betrag, Zahlungsstatus, Quizzugang und Ticket-PDF-Anhang. Separate Wallet-Links erzeugen Passdarstellungen derselben Berechtigung. Wiederholter Download/Ausdruck gewährt keinen weiteren Eintritt. E-Mail-/PDF-/Pass-Erstellung braucht persistente Jobs, Retry und Status im Manager; keine vorgetäuschten Zustellbestätigungen.

## Nachweise

`node tests/ticketing-manager.cjs`: erfolgreich bei Desktop 1440 px und Mobil 390 px. Geprüft: Suche, Ticketpreis, Bundle, tiefes Duplizieren einschließlich referenzieller IDs, keine übernommenen Orders/Wartelisten, Veröffentlichung erst nach Verkaufszeitraum, Persistenz über Reload, manuelle Order, Check-in, CSV-Download, alle Eventbereiche, Quizübernahme und Mailvorschau. Keine externen Requests oder JavaScript-Seitenfehler. Desktop-Eventliste und Eventeditor visuell geprüft; Screenshots unter `docs/audit/preview/manager-*.png`.

Die Tests beweisen Verhalten des lokalen Entwurfs, keine Backend-, Payment- oder RLS-Sicherheit. Vor produktiver Integration gelten unverändert die Transaktions-, Authentisierungs- und Migrationsanforderungen des Audits.
