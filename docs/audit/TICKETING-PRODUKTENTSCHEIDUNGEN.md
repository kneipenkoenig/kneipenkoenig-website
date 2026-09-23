# Verbindliche Produktentscheidungen

Stand: Interview vom 23.09.2026. Diese bestätigten Nutzerentscheidungen haben Vorrang vor bisherigen Prototypannahmen und Planungsvorschlägen.

## Tickets und Teams

- Ausschließlich Teamtickets, z. B. 4er- oder 6er-Tickets. Keine Einzeltickets.
- Maximale Teamtickets je Bestellung global einstellbar, pro Event überschreibbar. Ein konkreter Standardwert wurde noch nicht festgelegt.
- Teamname beim Kauf optional.
- Käufer können Teamnamen über einen geschützten Link ergänzen oder ändern. Bei mehreren Teamtickets müssen die zugehörigen Teams einzeln adressierbar sein.
- Änderungsfrist in Stunden oder Tagen vor Quizstart einstellbar; globale Vorgabe mit Event-Ausnahme gemäß bestätigtem Gesprächsstand. Danach Bearbeitung durch Mitarbeitende im Manager.
- Automatische Erinnerung für Teams ohne Namen zu einem einstellbaren Zeitpunkt. Frist und Versandzeitpunkt müssen gemeinsam plausibilisiert werden. Der Nutzer hat noch keine Standardwerte festgelegt.
- Nach Ablauf der Namensfrist erhalten weiterhin namenlose Teams automatisch einen innerhalb des Events eindeutigen Ersatznamen wie „Team 01“. Bereits belegte Namen überspringen; Vergabe atomar und wiederholbar ohne Umbenennung bereits benannter Teams umsetzen. Diese Teams dürfen unter den übrigen Zutrittsregeln mitspielen. Mitarbeitende können den Namen später im Manager ändern.
- Teamnamen innerhalb desselben Quizabends eindeutig. Technische Normalisierung für Groß-/Kleinschreibung und Leerzeichen vor Speicherung/Prüfung festlegen. Nicht über verschiedene Veranstaltungen hinweg sperren.
- Keine Abfrage der tatsächlichen Personenzahl. Die gewählte Ticketgröße bestimmt die Kapazität, z. B. vier oder sechs Plätze. Tatsächliche Anwesenheit darf daraus nicht als gemessene Personenzahl abgeleitet werden.

## Check-in und Quizbeitritt

- Check-in insgesamt global ein-/ausschaltbar, pro Event überschreibbar.
- Wenn aktiv: Ein Scan checkt das gesamte Teamticket ein. Keine personenbezogene Einlasszählung.
- Wenn aktiv: Quizbeitritt erst nach erfolgreichem Check-in erlaubt. Die vorbereitende Namensbearbeitung bleibt vor dem Einlass möglich.
- Offene Barzahlung blockiert den Check-in nicht. Zahlungsstatus bleibt separat sichtbar; Check-in bestätigt keine Zahlung.
- Wenn deaktiviert: Quizbeitritt über Ticketcode ohne vorherigen Check-in möglich; Ticketgültigkeit und passende Quizsession werden trotzdem geprüft.
- Die Zutrittsregel muss serverseitig im Ticket-Exchange und beim tatsächlichen Quizbeitritt durchgesetzt werden. Eine versteckte Schaltfläche reicht nicht aus.

## Events duplizieren

- Eventkonfiguration einschließlich Ticketarten, Preisen, Texten und Einstellungen übernehmen.
- Keine Buchungen oder Teilnehmer übernehmen; keine Zahlungs-, Check-in- oder Versandhistorie kopieren.
- Kopie beginnt als Entwurf mit neuem Datum und eigenen IDs. Zeitabhängige Verkaufs- und Versandtermine müssen zum neuen Datum passen und vor Veröffentlichung geprüft werden.

## Warteliste

- Zeitlich begrenztes bevorzugtes Kaufrecht für das erste passende wartende Team ist optional; keine verpflichtende Automatik.
- Gleichzeitige Benachrichtigung aller passenden Wartenden bei freier Kapazität ist ebenfalls optional; keine verpflichtende Automatik.
- E-Mail als Pflichtfeld und WhatsApp-Nummer als freiwilliges Feld im Wartelistenformular abfragen. Eine Eintragung ohne WhatsApp muss möglich sein.
- WhatsApp zunächst manuell: Ein Button im Manager öffnet WhatsApp mit einem vorbereiteten Nachrichtentext für die hinterlegte Nummer. Mitarbeitende prüfen und senden die Nachricht selbst. Kein automatischer WhatsApp-Versand; das Öffnen des Buttons darf nicht als erfolgreicher Versand protokolliert werden.

## Konsequenzen für bisherige Artefakte

- Verkaufsprototyp: bisherige konkrete Personenzahl-Auswahl entfällt; stattdessen Teamticket-Typ wählen. Mehrere Teamtickets benötigen eigene optionale Teamnamen.
- Registration-Vertrag: `group_size` als tatsächliche Personenzahl entfällt zugunsten von `ticket_capacity`; Teamname darf bis zur festgelegten Frist fehlen. Danach eindeutigen Ersatznamen vergeben; dessen Vergabe verhindert keinen Quizbeitritt, bestehende Ticketgültigkeits- und Check-in-Regeln gelten weiterhin.
- Vorbereitung/Statistiken: „Gebuchte Plätze“ aus Ticketkapazitäten anzeigen; nicht „erwartete Personen“ als vermeintlich exakten Wert.
- Globale Vorgaben beim Erstellen eines Events als Snapshot übernehmen. Änderungen an globalen Vorgaben gelten nur für neue Events; bereits angelegte Events behalten ihre bisherigen Einstellungen. Bestehende Events können im Manager gezielt aktualisiert werden. Event-spezifische Anpassungen bleiben möglich. Duplikate übernehmen gemäß Duplizierungsregel die Einstellungen des Quell-Events.
- Erinnerungen über persistente Versandjobs; nur weiterhin namenlose, gültige Teamtickets berücksichtigen. Bereits benannte Teams nicht erneut erinnern. Linkrechte auf die jeweiligen Teamdaten beschränken.
- Lokaler Manager- und Verkaufsprototyp teilen jetzt die Demo-Daten. Teamticket-Auswahl, optionale Namen, Änderungslinks mit Frist, Ersatznamen, globale Snapshots, Check-in-Regeln und Wartelistenkontakte sind umgesetzt. Der Registration-Vertrag verwendet `ticket_capacity`, nullable Teamnamen und `check_in_required`.
- Erinnerungen und Wartelistenautomatiken sind konfigurierbar; echter Hintergrundversand, Reservierungen und produktive Link-/Quiz-Zugriffskontrolle bleiben Backend-Aufgaben. PDF-Mailanhang und Wallet-Pässe sind noch nicht erzeugt; Browserdruck/PDF-Speichern ist verfügbar.
