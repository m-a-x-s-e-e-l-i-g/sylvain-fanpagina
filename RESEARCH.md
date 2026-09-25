# DTS Bosbaan public timing research

Research date: **25 September 2026** (Europe/Amsterdam), one day before the event.

## Current finding

The 2026 event and athlete are already public in **MSS Live**, but the event is not yet published or indexed in the public Sporthive event search.

- Event: `DTS Bosbaan`, 26-09-2026, NED
- MSS event ID discovered from the public event list: `8055`
- Athlete: `Sylvain Leupen`
- MSS participant ID: `1995628954`
- Bib/start number: `113`
- Race/distance: `Olympic Distance` (MSS distance ID `1`)
- Category: `Mannen 16-29` (`MU30` in quick search)
- Start group: `OD 08.30`
- Official/actual start field: `08:30:00`
- Current state: registered, no timing data yet

None of those IDs or the bib are hardcoded in the application. They are evidence recorded here; the runtime rediscovers them from the event list, event page, name search, and participant response.

## Provider map

Sporthive's current public client settings are available at:

```text
GET https://sporthive.com/api/clientSettings
```

Relevant values returned on 25 September 2026:

```json
{
  "eventResultApiUrl": "https://eventresults-api.speedhive.com",
  "liveTimingApiUrl": "https://lt-api.speedhive.com",
  "liveTimingNotificationsApiUrl": "https://notifications.speedhive.com",
  "searchApiUrl": "https://search.speedhive.com"
}
```

This matters because older code and search results often refer to `eventresults-api.sporthive.com`. The current website points to the `speedhive.com` hosts.

## Event discovery

### MSS Live — working for DTS Bosbaan 2026

```text
GET https://live.ultimate.dk/desktop/index.php
```

Authentication: **none**.

The HTML event table contains rows whose `onclick` URL includes `eventid`. The application parses every row and matches event name, date, and country. On the research date it found:

```text
DTS Bosbaan | 26-09-2026 | NED | eventid=8055
```

The ID is therefore discovered, not configured.

### Sporthive full-text search — working, event not present yet

```text
GET https://search.speedhive.com/api/search
  ?term=DTS%20Bosbaan
  &category=Active
  &type=Events
  &count=50
  &offset=0
  &fuzzy=true
```

Authentication: **none**. The request needs the same public `Origin`/`Referer` headers as the Sporthive site when made server-side.

The response is JSON containing event search results. Searches for both `DTS Bosbaan` and the historic name `DTS Amsterdamse Bos` returned older editions and other current DTS events, but not the 26 September 2026 Bosbaan event. The tracker retries this discovery every five minutes, so it will automatically switch on the Sporthive fallback when the event appears.

Search enums observed in the current Sporthive JavaScript bundle:

```text
type: Events, PracticeLocations, Profiles, Organizations, Championships,
      LiveEvents, Participants
category: Motorized, Active, ActiveEvent, ActiveRace
```

### Sporthive date-window event list — working, event not present yet

```text
GET https://eventresults-api.speedhive.com/api/v0.2.3/eventresults/events
  ?startDate=2026-09-25T00:00:00Z
  &endDate=2026-09-27T23:59:59Z
  &country=NL
  &count=100
```

Authentication: **none**. Response: JSON list of active events. Multiple Dutch events for 26 September were returned, but not DTS Bosbaan.

This versioned endpoint is also implemented by the open-source `speedhive-go` client. Full-text search is the better primary discovery method because naming/location metadata are more useful than guessing sport filters.

## Event structure and categories

### MSS event page

```text
GET https://live.ultimate.dk/desktop/front/index.php
  ?eventid={discoveredEventId}
  &ignoreuseragent=true
```

Authentication: **none**.

The `results_distance` selector currently lists:

| MSS distance ID | Race/distance |
|---:|---|
| 1 | Olympic Distance |
| 2 | Olympic Distance Relay |
| 3 | Sprint |
| 4 | Sprint Relay |

Leaderboard groups visible on the page are OD Wave 1/2/3, OD Relay, Sprint Wave 1/2/3, and Sprint Relay.

Category options currently exposed by the page are:

| Code | Category |
|---|---|
| S_M | Mannen |
| S_W | Vrouwen |
| S_X | Anders |
| C_FU30 | Vrouwen 16-29 |
| C_F30 | Vrouwen 30-39 |
| C_F40 | Vrouwen 40-49 |
| C_F50 | Vrouwen 50-59 |
| C_F60 | Vrouwen 60 en ouder |
| C_MU30 | Mannen 16-29 |
| C_M30 | Mannen 30-39 |
| C_M40 | Mannen 40-49 |
| C_M50 | Mannen 50-59 |
| C_M60 | Mannen 60 en ouder |

The tracker parses the distance selector at runtime and maps Sylvain's returned race name to the matching ID. It does not assume `1`.

### Sporthive event/race endpoints — verified against DTS 2025

The official DTS site links the prior event as `7377353852758000640`. This provided a real fixture for checking the current public routes:

```text
GET https://eventresults-api.speedhive.com/sporthive/events/{eventId}
GET https://eventresults-api.speedhive.com/sporthive/events/{eventId}/races
GET https://eventresults-api.speedhive.com/sporthive/races/{raceId}
GET https://eventresults-api.speedhive.com/sporthive/races/{raceId}/participants?page=0&size=5
```

Authentication: **none**. All returned JSON for the 2025 event.

The 2025 race list contains OD, OD Relay, Sprint, Sprint KPN, Sprint Relay, and a `Tussentijden` race. The exact 2026 Sporthive list cannot be known until that event is published, which is why the application discovers it at runtime.

## Athlete discovery

### MSS quick search — working for Sylvain

```text
GET https://live.ultimate.dk/desktop/front/data.php
  ?eventid={discoveredEventId}
  &mode=search
  &searchmode=quick
  &search_quick=Sylvain%20Leupen
  &language=us
  &search_time=Finish
  &search_sortby=%5BTIMEFIELD%5D
  &search_sorttype=ASC
  ...empty advanced filters...
```

Authentication: **none**.

The response is JavaScript, not JSON. It assigns a generated HTML table to `search_results`. The exact result was:

```json
{
  "participantId": "1995628954",
  "bib": "113",
  "name": "Sylvain Leupen",
  "nation": "NL",
  "race": "Olympic Distance",
  "category": "MU30"
}
```

The runtime parser collects all rows and only auto-selects an exact, normalized full-name match. If multiple exact matches exist it returns an `ambiguous` state instead of guessing.

### Sporthive event-scoped participant search — verified against DTS 2025

```text
GET https://eventresults-api.speedhive.com/sporthive/search
  ?term={name}
  &category=ActiveEvent
  &type=Participants
  &eventid={eventId}
  &count=20
  &offset=0
  &fuzzy=false
```

Authentication: **none**.

This returned a participant's bib and 64-bit race ID when tested with a known 2025 participant. It currently returns no 2026 Sylvain record because the 2026 Sporthive event is not published.

## Participant timing

### MSS participant detail — working

```text
GET https://live.ultimate.dk/desktop/front/data.php
  ?eventid={discoveredEventId}
  &mode=participantinfo
  &pid={discoveredParticipantId}
  &language=us
```

Authentication: **none**.

Like search, this returns JavaScript that assigns HTML to `PARTICIPANTINFO`. Sylvain's current record contains city, distance, category, age, start group, official start, and actual start, but no split rows yet.

The same endpoint was tested with a publicly visible completed record from the event. It exposes:

- net and gross finish time;
- overall, gender, and category ranks;
- segment headings for Swim, T1, Bike, T2, and Run;
- cumulative elapsed time and overall/gender/category position at every timing point;
- segment duration, speed, and ranks;
- individual split duration, speed, and ranks;
- time of day for every mat crossing.

For Olympic Distance the published timing points are currently:

```text
End Swim
Start Bike
Bike Lap 1
Bike Lap 2
Bike Lap 3
Bike Lap 4
Bike Lap 5
End Bike
Start Run
Run Lap 0
Run Lap 1
Finish
```

So intermediate bike and run splits are available and update as mat crossings are recorded. This is timing-mat data, not GPS location.

### Sporthive bib detail — verified against DTS 2025

```text
GET https://eventresults-api.speedhive.com/sporthive/races/{raceId}/bibs/{bib}
```

Authentication: **none**.

The JSON response includes overall/category/gender positions, gun time, Swim/T1/Bike/T2/Run leg durations and ranks, plus nested bike and run splits. This is the application's structured fallback once the 2026 event and participant appear in Sporthive.

### Retired/incorrect route patterns

These older patterns were tested on the current `eventresults-api.speedhive.com` host with valid 2025 event/race data and returned HTTP 404:

```text
/api/events/{eventId}/races/{raceId}/classifications/search
/api/events/{eventId}/races/{raceId}/bib/{bib}
```

They should not be used by a new client.

## Other MSS data endpoints

The event page itself uses ordinary `XMLHttpRequest` calls to the same `data.php` script:

```text
# Live wave/category standings
GET .../data.php?eventid={id}&mode=leaderboard&leaderboardid={n}
  &distance={distanceId}&olddistance={distanceId}&category={categoryCode}
  &records=100&show=standings&language=us

# Event-wide results table
GET .../data.php?eventid={id}&mode=results
  &distance={distanceId}&category={categoryCode}&language=us
```

Authentication: **none**.

The event-wide results endpoint displayed apparently preloaded or stale completed records before race day while Sylvain's participant record was blank and the live wave leaderboards had no results. The tracker therefore uses the athlete-specific detail as the source of truth and does not infer Sylvain's status from unrelated event-wide rows.

## Dedicated Speedhive live-timing hosts

The current Sporthive bundle also contains these public routes under `https://lt-api.speedhive.com/api/`:

```text
GET /events?userName=&sport=&countryCode=&paidOnly=true
GET /events/{id}?sessions=...
GET /events/{id}/sessions/{sessionId}/data
GET /events/{id}/active
GET /events/{id}/trackmap
GET /events/{id}/announcements
GET /events/{id}/weather
GET /events/{id}/stats
GET /events/{id}/sponsors
```

Authentication: not required for the event list request tested. The returned list was the separate Speedhive/Orbits-style motorised live-timing product; DTS Bosbaan was absent. It is not used for this active-sport tracker.

`https://notifications.speedhive.com` responds as an Azure Function host, but neither the public event-results flow nor MSS page exposed a usable public push subscription for this event.

## Polling versus WebSocket/SSE

No WebSocket or `EventSource` use was found in the current Sporthive event-results bundle or MSS event page.

MSS uses `XMLHttpRequest`, evaluates the returned JavaScript, and refreshes its leaderboards on an approximately 60-second countdown. Athlete detail is an ordinary HTTP request. Polling is therefore the appropriate public mechanism.

The tracker uses:

- 15 seconds while split data indicates `racing`;
- 60 seconds when registered but not started / no timing yet;
- 5 minutes when the event is not published or the athlete is finished;
- a five-minute cache for event discovery;
- a 30-minute cache for the race catalog;
- a two-minute cache for name-to-participant discovery;
- no cache for the athlete's timing detail itself beyond a short CDN response cache.

Only one athlete-detail request is made per active refresh. This is deliberately much lighter than polling all leaderboards or all participants.

## CORS and architecture decision

| Endpoint family | Browser CORS observed |
|---|---|
| `eventresults-api.speedhive.com` | Allows `https://sporthive.com`; a localhost origin returned 403 |
| `search.speedhive.com` | Allows `https://sporthive.com`; a localhost origin returned 401 |
| `live.ultimate.dk` MSS | Responds to public GETs but sends no `Access-Control-Allow-Origin` header |

Direct frontend fetches are therefore not viable. The project includes a tiny server-side proxy/discovery function for Netlify and Vercel. It exposes one normalized, read-only `/api/tracker` response and requires no database or secrets.

## Status model and failure handling

- `event_pending`: no exact event has appeared in public timing yet;
- `athlete_pending`: event exists, exact athlete record does not yet;
- `ambiguous`: multiple exact normalized name matches; the app refuses to guess;
- `not_started`: registered but no timing point exists yet;
- `racing`: one or more timing points exist, no finish yet;
- `finished`: athlete-specific finish/net time exists;
- `error`: both upstreams are temporarily unreachable and there is no previous result.

The browser and server both retain the last good payload. A transient upstream failure shows a stale-data warning rather than replacing valid timing with an empty screen.

## Limitations

1. The MSS protocol is public but undocumented and returns executable JavaScript/HTML instead of JSON. Its markup can change; parser fixtures cover the currently observed structure.
2. Sporthive has not published the 2026 event as of this research date, so no 2026 Sporthive event/race ID exists to report yet. Automatic retry is implemented.
3. Intermediate points represent physical timing mats. There is no public continuous GPS position.
4. MSS event-wide results looked preloaded/inconsistent before race day; athlete-specific detail is used instead.
5. Public providers can rate-limit, remove older events, or change endpoints without notice.
6. Live positions may change as later waves and timing corrections arrive. The organiser's final result is authoritative.
7. The official DTS site currently links results only through 2025. Its 2026 event page confirms the date, location/course, and that MYLAPS ProChip timing is used, but it does not yet expose a 2026 Sporthive link.

## Public references

- Official DTS Bosbaan page: <https://www.dutchtriathlons.nl/en-gb/dts-bosbaan>
- MSS Live public event list: <https://live.ultimate.dk/desktop/index.php>
- MSS Live Android listing: <https://play.google.com/store/apps/details?id=dk.bitlizard.ultimatelive>
- Sporthive client settings: <https://sporthive.com/api/clientSettings>
- Public 2025 DTS Sporthive event used as a route fixture: <https://sporthive.com/events/s/7377353852758000640>
- Open-source Speedhive client: <https://github.com/ysmilda/speedhive-go>
