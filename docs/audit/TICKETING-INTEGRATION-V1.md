> Aktualisierung nach Produktinterview: Die verbindlichen Regeln stehen in [TICKETING-PRODUKTENTSCHEIDUNGEN.md](TICKETING-PRODUKTENTSCHEIDUNGEN.md). Verkauf und Manager teilen jetzt lokale Demo-Daten; Namenslinks, Fristen und Eintrittsregeln sind lokal umgesetzt, produktive Dienste bleiben offen.

# Ticketing v1 – Integrationsvertrag und Anschlussprüfung

Stand: 23.09.2026. Ergebnis des ersten Umsetzungsschritts: klickbarer lokaler Prototyp und maschinenlesbarer Registration-Vertrag. Die beschriebenen API-Routen und Adapter sind **noch nicht implementiert**. Keine Änderung an Manager, Quiz-App, Produktiv-Website oder Datenbank.

## 1. Tatsächliche Anschlussstellen

| System | Gelesener Stand | Konkrete Erkenntnis |
|---|---|---|
| Website | `4344a19` | Statische Website, Worker und direkte Supabase-Abfragen; Produktionspfade unverändert |
| Manager | `a1f9ec1`, lokales Repository | Statische HTML-App; `saveEvent` schreibt Event und Tickettypen nacheinander direkt über PostgREST |
| Quiz-App | `819404d`, `E:/kneipenkoenig-app` | React/TypeScript + Express + Socket.IO, bestehende Spieler-Token, Supabase mit `kk_`-Tabellen |

Belege:

- [Manager: saveEvent](<C:/Users/DerKneipenkönig/OneDrive - Lettevents/Dokumente/03 KneipenkoenigManager/kneipenkoenig-manager/index.html:5285>) schreibt weiterhin `price` und `max_tickets` auf Events sowie Preise/Kontingente auf Tickettypen. Die im Audit beschriebene Schemadrift betrifft also auch den Manager. Event und Tickettypen sind keine atomare Mutation. `max_quantity = 0` wird durch `|| null` zu unbegrenzt.
- [Manager: DB-Header](<C:/Users/DerKneipenkönig/OneDrive - Lettevents/Dokumente/03 KneipenkoenigManager/kneipenkoenig-manager/index.html:4943>) verwendet einen Publishable Key, keinen Service-Key trotz Variablenname. Ein Microsoft-Login in der Oberfläche wird dadurch nicht automatisch zum autorisierten Supabase-Benutzer. Aktive DB-Policies müssen vor einer Migration überprüft werden: entweder funktionieren diese Writes nicht oder es existieren weitere, im Website-Schema nicht dokumentierte Rechte. Kein Live-Datenzugriff getestet.
- [Quiz: GameSession](<E:/kneipenkoenig-app/packages/shared/src/types/game.ts:58>) trennt Session-ID und Quiz-ID; `location_id` und `scoremaster_quiz_id` sind optionale Zahlen. Deshalb Ticketing-Event, Quizinhalt und laufendes Spiel nicht gleichsetzen.
- [Quiz: player:join](<E:/kneipenkoenig-app/server/src/socket/playerHandlers.ts:48>) und [Socket-Vertrag](<E:/kneipenkoenig-app/packages/shared/src/types/socket-events.ts:90>) kennen PIN, Session, Spieler-Token, Gerätetoken und Transfercode. Ein eigenes Ticketfeld gehört erst nach verifiziertem Exchange dazu; vorhandene Schutzprüfung nicht umgehen.
- [Quiz: playerToken](<E:/kneipenkoenig-app/server/src/auth/playerToken.ts:1>) stellt Session-/Player-gebundene JWTs mit Tokenversion aus. Der bestehende Wiederbeitritt soll erhalten bleiben. Ticketing erhält keinen Zugriff auf den JWT-Signierschlüssel der Quiz-App.
- [Quiz: Join-Info](<E:/kneipenkoenig-app/server/src/routes/games.ts:73>) ermittelt laufende Session und Location; [Join-Tests](<E:/kneipenkoenig-app/server/src/socket/joinFlow.test.ts:1>) decken unberechtigte Session-ID und fremde Token bereits ab. Neue Tickettests ergänzen diese Fälle.

Das ist eine gezielte Anschlussprüfung, kein vollständiges Audit der beiden zusätzlichen Anwendungen. Kein Nachweis der aktuell deployed Commits oder aktiven DB-Migrationen.

Zusätzlich existieren in der Quiz-App bereits `kk_gastro_quiz_plans` (Vorbereitung mit `scheduled_at`, `location_id`, Konfiguration und Snapshot) und `kk_gastro_events` (lizenzierter Spieldurchlauf mit eindeutiger `session_id`). Belege: [Gastro-Routen](<E:/kneipenkoenig-app/server/src/routes/gastro.ts:21>) und [Gastro-Schema](<E:/kneipenkoenig-app/supabase/gastro_launch.sql:29>). Diese Betreiber-/Lizenzobjekte werden nicht in allgemeine Verkaufs-Events umgedeutet. Ein optionales Mapping vom Ticketing-Event zum Gastro-Plan kann denselben Vorbereitungsablauf nutzen; Berechtigungen und Lizenzverbrauch bleiben im Gastro-Modul. Vor neuer Vorbereitungs-UI zuerst entscheiden, ob der Abend über Quizmaster oder Gastro-Betreiber läuft.

## 2. Verbindliche Identitäten

| Feld | Typ | Bedeutung |
|---|---|---|
| event_id | UUID | Kaufbare Veranstaltung aus dem Manager |
| location_id | positive Integer | Bestehende `locations.location_id` |
| quiz_id | UUID/null | Quizinhalt in `kk_quizzes`, vor Vorbereitung auch null |
| game_session_id | UUID/null | Konkreter Durchlauf in `kk_game_sessions`; entsteht ggf. erst am Abend |
| scoremaster_quiz_id | positive Integer/null | Separater Ergebnisabend in `quizes` |
| registration_id | UUID | Eine Team-Anmeldung für genau ein Event |
| event_team_id | UUID | Teamidentität innerhalb des Events |
| scoremaster_team_id | positive Integer/null | Verifiziert zugeordnetes Stammteam in `teams` |
| ticket_id | UUID | Berechtigung dieser Registration; kein Zugangstoken |
| player_id | UUID/null | Spieler-/Teaminstanz der Quiz-App in dieser Session |

Nach Produktinterview: **ausschließlich Teamtickets (z. B. 4er/6er), mehrere pro Bestellung nach globalem beziehungsweise Event-Limit, ein Team-Buzzer je Teamticket**. Jedes Teamticket erzeugt eine Registration. Keine Erfassung der tatsächlichen Personenzahl. Käufer und Teamspieler bleiben getrennt; kein automatisches Stammteam-Matching nur über Namen.

Die Quiz-App begrenzt Nicknames derzeit auf **2–20 Zeichen** ([Konstanten](<E:/kneipenkoenig-app/packages/shared/src/constants.ts:13>)) und lehnt doppelte Namen sowie bestimmte Wörter ab. Der v1-Vertrag und Prototyp übernehmen die Längengrenze. Bei Bestandsnamen über 20 Zeichen oder Kollisionen braucht der Adapter eine ausdrücklich bestätigte kurze Spielbezeichnung; kein stilles Abschneiden und kein Zusammenführen fremder Teams. Dieselbe Namensprüfung muss später beim Checkout über geteilte Regeln gelten; die aktuelle lokale Demo prüft nur Länge und Pflichtfeld.

Das Event/Session-Mapping bekommt eine eigene Tabelle mit UNIQUE(event_id, game_session_id). Registration-to-player wird je Session eindeutig: UNIQUE(registration_id, game_session_id). Nicht eine Registration global an nur eine Quizsession binden; ein Event kann mehrere Sessions haben.

## 3. Registration-Vertrag

Die Datei `docs/contracts/registration.v1.schema.json` definiert eine vollständige Projektion für Quizvorbereitung. Ein Consumer akzeptiert nur Schema-Version 1 und strikt höhere `version` je Registration. Gleiche Version mit unterschiedlichem Payload-Hash ist ein Konflikt, kein stilles Überschreiben. Zustellungen dürfen doppelt und in anderer Reihenfolge eintreffen.

Vertrag für `registration.upserted` bzw. `registration.cancelled`: Envelope `{message_id, type, occurred_at, registration}`. Absender authentisieren; Registry-Datensatz innerhalb einer Transaktion upserten und Inbox-Eintrag mit `message_id UNIQUE` committen. Der öffentliche Ticketcode-Endpunkt gibt diese interne Projektion nicht aus. Kontaktdaten sind in diesem Sync-Vertrag bewusst nicht enthalten; der Manager bezieht sie aus einem separaten berechtigten Bestellendpunkt.

Ticketing ist führend für Event-Anmeldung, optionalen Teamnamen, Ticketkapazität, Ticketstatus und Einlass. Die Quiz-App besitzt Player-ID, Session und Spielzustand. Mapping wird im Adapter geführt; Quiz-App meldet Sessionzuordnung über eine eigene autorisierte Mutation zurück, nicht durch Überschreiben eines Ticketing-Snapshots. Jede Eventverschiebung/Location-/Teamänderung erhöht die betroffene Projektionsversion. Storno bleibt als Tombstone erhalten.

## 4. API-Skizze für nächste Implementierung

| Route | Authentisierung | Wirkung |
|---|---|---|
| `PUT /v1/admin/events/:id` | Verifiziertes Manager-Login mit Eventrolle + If-Match | Event und Tickettypen in einer Transaktion, Konflikt bei veralteter Version |
| `GET /v1/admin/events/:id/registrations` | Mitarbeiter/Eventrolle | Vorbereitungsliste ohne Zahlungs-/Tokengeheimnisse |
| `POST /v1/checkouts` | Rate-Limit, Client-Idempotency-Key, Capability | Serverpreis, atomarer Hold, PaymentAttempt |
| `POST /api/ticket-access/exchange` auf Quiz-Backend | Rate-Limit + Ticketcode als Body, Origin-Regeln | Verifiziert Berechtigung beim Ticketing; keine Namen/Session-ID vom Client übernehmen |
| interne `POST /v1/integrations/quiz/redeem` | Dienstidentität, Request-ID, feste Audience | Kurzlebige Einmalberechtigung auf genau Registration/Session ausstellen |
| `player:join` mit neuem `ticketGrant` | Verifikation durch Quiz-Backend | Berechtigung atomar verbrauchen, bestehendem Player zuordnen oder einmal anlegen |

Die Dienstidentität ist z.B. eine signierte Anfrage mit Zeitfenster und Replay-ID; fester Provider/Key-Rotation und mTLS/Plattform-Identity sind bei Deployplanung abzuwägen. Keine fremden Redirect-URLs oder frei gewählte `player_id`. Eine erratene Bestellnummer ist niemals eine Credential.

Exchange-Recovery: Idempotency-Key für denselben Geräteversuch, kurzer persistenter Exchange-Datensatz, Status `issued/consumed/revoked`, Response niemals ohne Credential abrufbar. Verbindungsabbruch nach Verbrauch darf nicht die erneute Anmeldung erzwingen: die Quiz-App gibt für denselben autorisierten Versuch denselben Player zurück. Nach erfolgreichem Join verwendet das Gerät den bestehenden Spieler-Token. Das bestehende Token dauert derzeit 30 Tage; bei Storno genügt Grant-Widerruf nicht: bestehende Player-Tokenversion rotieren/Sessionberechtigung sperren und verbundene Geräte entsprechend entziehen. Diese Änderung braucht Tests im Quiz-Repo.

Vor Spielstart dürfen Registrations schon in der Vorbereitung existieren, ohne einen verbundenen Player vorzutäuschen. Wenn keine Session freigegeben ist, `409 session_not_ready` und freundliche Warteansicht. Ticketcode-Eingabe erzeugt keinen Check-in. Im Offline-Spielbetrieb ist eine neue Online-Ticketprüfung nicht verfügbar: Pilot benötigt Online-Einlass oder eine ausdrücklich getrennte manuelle Notfallregel.

## 5. Designprototyp

Dateien unter `prototypes/ticketing`. Lokal starten mit `node prototypes/ticketing/serve.cjs`, Vorschau auf `http://127.0.0.1:8766/`. Ausschließlich gebundener Loopback-Server, keine externen API-Aufrufe oder Persistenz von Eingaben. Beispieldaten gehen beim Neuladen verloren. QR enthält nur einen Hinweis auf die Demo. Codes `DEMO-0001` usw. sind absichtlich erkennbare lokale Beispieldaten, keine Vorlagen für echte Sicherheitstokens.

Enthalten: Eventfilter, Eventdetail, Teamticket-Auswahl mit optionalen Teamnamen, validierte Kontaktdaten, Zahlungsmethoden-Vorschau, digitales Ticket, Druckansicht, Code-Eingabe, Quiz-Lobby, lokale Vorbereitungsliste, getrennter Demo-Check-in und Wartelistenablauf. Optik: bestehende Schriften/Markenblau, dunkle warme Flächen, echte Fotos, helles Ticket. Öffentliche Termindaten/Preise sind ausdrücklich Beispiele.

## 6. Nächste technische Umsetzung

1. Aktives Supabase-Schema und Deploy-Stand verifizieren; Verträge von Manager und Website auf ein Modell führen.
2. Sicheren neuen Worker-Kern mit Staging-Konfiguration, Migrationen, Checkout-Idempotenz und Bestands-RPC implementieren.
3. Manager-Schreibzugriffe hinter die autorisierte API verlegen; vorhandenen Eventeditor anpassen.
4. Registration-Outbox/Inbox und Vorschau im echten Quiz-Stammtisch implementieren.
5. Ticket-Exchange in bestehenden Player-Join integrieren; Tests für Wiederbeitritt, Storno, fremde Session, Replay und Serverrestart ergänzen.
6. Geprüfte Oberflächen an diese realen Endpunkte anschließen. Demo-Markierung erst bei vollständiger Staging-Abnahme entfernen.

## 7. Prüfstand des Prototyps

`node tests/ticketing-prototype.cjs` erfolgreich mit Edge/Playwright bei 1440 und 390 Pixel Breite: Ortsfilter, Pflichtfeldprüfung, Erhalt des Teamnamens bei Größenänderung, Checkout, Ticket, ungültiger/gültiger Code, Lobby, Vorbereitung, getrennte Einlassaktion, erneuter Kauf und Warteliste. Keine JavaScript-Seitenfehler und keine externen Netzwerkrequests in diesen Abläufen. Screenshots für Eventliste, Zahlungsübersicht, Ticket und Vorbereitung unter `docs/audit/preview`; Eventübersicht Desktop und Ticket mobil zusätzlich visuell geprüft. Syntaxprüfung des Frontend-JavaScripts erfolgreich. Diese Tests prüfen die Demo, keine Live-Zahlung oder Backend-Sicherheit.
