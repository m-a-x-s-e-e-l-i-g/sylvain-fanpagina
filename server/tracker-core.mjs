const TARGET = Object.freeze({
  athlete: "Sylvain Leupen",
  eventName: "DTS Bosbaan",
  eventAliases: ["DTS Bosbaan", "DTS Amsterdamse Bos"],
  dateIso: "2026-09-26",
  dateMss: "26-09-2026",
  location: "Bosbaan, Amsterdam, Netherlands",
  country: "NED"
});

const ENDPOINTS = Object.freeze({
  mssList: "https://live.ultimate.dk/desktop/index.php",
  mssData: "https://live.ultimate.dk/desktop/front/data.php",
  sporthiveSearch: "https://search.speedhive.com/api/search",
  sporthiveResults: "https://eventresults-api.speedhive.com/sporthive"
});

const USER_AGENT = "DTS-Bosbaan-public-tracker/1.0 (+public timing viewer)";
const caches = new Map();
let lastGoodResponse = null;

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function decodeHtml(value) {
  const named = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    auml: "ä", Auml: "Ä", ouml: "ö", Ouml: "Ö", uuml: "ü", Uuml: "Ü",
    eacute: "é", Eacute: "É", oslash: "ø", Oslash: "Ø", aring: "å", Aring: "Å"
  };
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (whole, name) => named[name] ?? whole);
}

function stripTags(value) {
  return decodeHtml(String(value ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeJavaScriptString(value) {
  return String(value ?? "")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
}

function extractAssignedHtml(source, elementId) {
  const escapedId = elementId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `document\\.getElementById\\(['\"]${escapedId}['\"]\\)\\.innerHTML='((?:\\\\.|[^'])*)';`,
    "is"
  );
  const match = String(source ?? "").match(pattern);
  return decodeJavaScriptString(match?.[1] ?? "");
}

function extractCells(rowHtml) {
  return [...String(rowHtml).matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => stripTags(match[1]));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePosition(value) {
  const match = String(value ?? "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function emptyPosition() {
  return { overall: null, gender: null, category: null };
}

function valuesToPosition(values, offset = 0) {
  return {
    overall: parsePosition(values[offset]),
    gender: parsePosition(values[offset + 1]),
    category: parsePosition(values[offset + 2])
  };
}

export function parseMssEventList(html) {
  const events = [];
  const rowPattern = /<tr\b([^>]*\bid=["']row(\d+)["'][^>]*)>([\s\S]*?)<\/tr>/gi;
  for (const match of String(html ?? "").matchAll(rowPattern)) {
    const eventId = match[1].match(/eventid=(\d+)/i)?.[1] ?? match[2];
    const cells = extractCells(match[3]);
    if (cells.length < 2) continue;
    events.push({
      id: eventId,
      name: cells[0] ?? "",
      date: cells[1] ?? "",
      country: cells[2] ?? "",
      sourceUrl: `https://live.ultimate.dk/desktop/front/index.php?eventid=${encodeURIComponent(eventId)}&ignoreuseragent=true`
    });
  }
  return events;
}

export function selectMssEvent(events, target = TARGET) {
  return events
    .filter((event) => event.date === target.dateMss)
    .filter((event) => normalize(event.name).includes("dts") && normalize(event.name).includes("bosbaan"))
    .filter((event) => !target.country || normalize(event.country).includes(normalize(target.country)))
    .sort((a, b) => normalize(a.name).localeCompare(normalize(b.name)))[0] ?? null;
}

export function parseMssRaceCatalog(html) {
  const select = String(html ?? "").match(/<select\b[^>]*\bname=["']results_distance["'][^>]*>([\s\S]*?)<\/select>/i)?.[1] ?? "";
  return [...select.matchAll(/<option\b[^>]*\bvalue=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi)]
    .map((match) => ({ id: match[1], name: stripTags(match[2]) }))
    .filter((race) => race.id && race.name);
}

export function parseMssSearchResponse(source) {
  const html = extractAssignedHtml(source, "search_results");
  const participants = [];
  const rowPattern = /<tr\b[^>]*\bid=["']search_row_(\d+)["'][^>]*>([\s\S]*?)<\/tr>/gi;
  for (const match of html.matchAll(rowPattern)) {
    const cells = extractCells(match[2]);
    if (cells.length < 2) continue;
    participants.push({
      participantId: match[1],
      bib: cells[0] || null,
      name: cells[1] || null,
      nation: cells[2] || null,
      club: cells[3] || null,
      race: cells[4] || null,
      category: cells[5] || null,
      time: cells[6] || null,
      genderPosition: parsePosition(cells[7]),
      categoryPosition: parsePosition(cells[8])
    });
  }
  return participants;
}

function extractParticipantValue(html, label) {
  const pattern = new RegExp(
    `<td[^>]*class=["'][^"']*participant_hdr_small[^"']*["'][^>]*>\\s*${escapeRegExp(label)}\\s*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
    "i"
  );
  return stripTags(String(html ?? "").match(pattern)?.[1] ?? "") || null;
}

function extractBigValue(html, label) {
  const pattern = new RegExp(
    `${escapeRegExp(label)}[\\s\\S]{0,160}?class=["'][^"']*participant_value_big[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`,
    "i"
  );
  return stripTags(String(html ?? "").match(pattern)?.[1] ?? "") || null;
}

function parseSplitRows(html) {
  const rows = [];
  let segment = null;
  const tokenPattern = /<td\b[^>]*class=["'][^"']*split_segment[^"']*["'][^>]*>([\s\S]*?)<\/td>|<tr\b[^>]*>\s*<td\b[^>]*class=["'][^"']*split_time[^"']*["'][^>]*>([\s\S]*?)<\/td>([\s\S]*?)<\/tr>/gi;

  for (const token of String(html ?? "").matchAll(tokenPattern)) {
    if (token[1] !== undefined) {
      segment = stripTags(token[1]);
      continue;
    }

    const rowHtml = `<td class="split_time">${token[2]}</td>${token[3]}`;
    const byClass = new Map();
    for (const cell of rowHtml.matchAll(/<td\b[^>]*class=["']([^"']*)["'][^>]*>([\s\S]*?)<\/td>/gi)) {
      const className = cell[1].trim();
      const value = stripTags(cell[2]);
      if (!byClass.has(className)) byClass.set(className, []);
      byClass.get(className).push(value);
    }

    const timeCells = [...(byClass.get("split_time") ?? [])];
    const raceValues = byClass.get("details_racetime") ?? [];
    const segmentValues = byClass.get("details_segmenttime") ?? [];
    const splitValues = byClass.get("details_splittime") ?? [];
    const location = timeCells.shift() ?? "";
    const timeOfDay = timeCells.at(-1) ?? null;

    if (!location) continue;
    rows.push({
      segment,
      location,
      cumulativeTime: raceValues[0] || null,
      cumulativePosition: valuesToPosition(raceValues, 1),
      segmentTime: segmentValues[0] || null,
      segmentSpeed: segmentValues[1] || null,
      segmentPosition: valuesToPosition(segmentValues, 2),
      splitTime: splitValues[0] || null,
      splitSpeed: splitValues[1] || null,
      splitPosition: valuesToPosition(splitValues, 2),
      timeOfDay
    });
  }
  return rows;
}

export function parseMssParticipantResponse(source) {
  const html = extractAssignedHtml(source, "PARTICIPANTINFO");
  const nameMatch = html.match(/class=["'][^"']*participant_value_big[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  const netTime = extractParticipantValue(html, "Net time");
  return {
    rawHtmlAvailable: Boolean(html),
    name: stripTags(nameMatch?.[1] ?? "") || null,
    bib: extractBigValue(html, "Race no"),
    city: extractParticipantValue(html, "City"),
    race: extractParticipantValue(html, "Distance"),
    category: extractParticipantValue(html, "Category"),
    age: extractParticipantValue(html, "Age"),
    startGroup: extractParticipantValue(html, "Startgroup"),
    officialStartTime: extractParticipantValue(html, "Official Start time"),
    actualStartTime: extractParticipantValue(html, "Actual Start time"),
    netTime: netTime ? netTime.replace(/\s*\(finish time\)\s*/i, "").trim() : null,
    grossTime: extractParticipantValue(html, "Gross time"),
    overallPosition: parsePosition(extractParticipantValue(html, "Rank overall")),
    genderPosition: parsePosition(extractParticipantValue(html, "Rank gender")),
    categoryPosition: parsePosition(extractParticipantValue(html, "Rank category")),
    splits: parseSplitRows(html)
  };
}

function selectLast(rows, predicate = () => true) {
  return [...rows].filter(predicate).at(-1) ?? null;
}

function compactSplit(row) {
  if (!row) return null;
  return {
    label: row.location,
    elapsed: row.cumulativeTime,
    time: row.splitTime || row.segmentTime,
    speed: row.splitSpeed || row.segmentSpeed,
    position: row.cumulativePosition?.overall ?? row.splitPosition?.overall ?? row.segmentPosition?.overall ?? null,
    timeOfDay: row.timeOfDay
  };
}

export function normalizeMssTiming(participant) {
  const rows = participant.splits ?? [];
  const segmentRows = (name) => rows.filter((row) => normalize(row.segment) === normalize(name));
  const swimRows = segmentRows("Swim");
  const t1Rows = segmentRows("T1");
  const bikeRows = segmentRows("Bike");
  const t2Rows = segmentRows("T2");
  const runRows = segmentRows("Run");
  const finish = selectLast(runRows, (row) => normalize(row.location).includes("finish"));
  const swimEnd = selectLast(swimRows);
  const bikeEnd = selectLast(bikeRows, (row) => normalize(row.location).includes("end bike")) ?? selectLast(bikeRows);
  const runEnd = finish ?? selectLast(runRows);

  const state = (participant.netTime || finish)
    ? "finished"
    : rows.length > 0
      ? "racing"
      : "not_started";

  return {
    state,
    overallTime: participant.netTime || finish?.cumulativeTime || null,
    overallPosition: participant.overallPosition ?? finish?.cumulativePosition?.overall ?? null,
    categoryPosition: participant.categoryPosition ?? finish?.cumulativePosition?.category ?? null,
    genderPosition: participant.genderPosition ?? finish?.cumulativePosition?.gender ?? null,
    swim: {
      time: swimEnd?.segmentTime || swimEnd?.cumulativeTime || null,
      position: swimEnd?.segmentPosition?.overall ?? swimEnd?.cumulativePosition?.overall ?? null,
      splits: swimRows.map(compactSplit)
    },
    t1: {
      time: selectLast(t1Rows)?.segmentTime || selectLast(t1Rows)?.splitTime || null
    },
    bike: {
      time: bikeEnd?.segmentTime || null,
      position: bikeEnd?.segmentPosition?.overall ?? bikeEnd?.cumulativePosition?.overall ?? null,
      splits: bikeRows.filter((row) => row !== bikeEnd).map(compactSplit)
    },
    t2: {
      time: selectLast(t2Rows)?.segmentTime || selectLast(t2Rows)?.splitTime || null
    },
    run: {
      time: runEnd?.segmentTime || null,
      position: runEnd?.segmentPosition?.overall ?? runEnd?.cumulativePosition?.overall ?? null,
      splits: runRows.filter((row) => row !== finish).map(compactSplit)
    },
    finish: finish ? compactSplit(finish) : null,
    lastPoint: compactSplit(rows.at(-1))
  };
}

export function normalizeSporthiveDetail(detail) {
  const legs = Array.isArray(detail?.legs) ? detail.legs : [];
  const leg = (name) => legs.find((item) => normalize(item.name ?? item.legName) === normalize(name));
  const normalizeLeg = (item) => ({
    time: item?.legDuration ?? item?.duration ?? null,
    position: item?.rank ?? item?.totalPosition ?? null,
    splits: (item?.splits ?? []).map((split) => ({
      label: split.name ?? split.location ?? "Split",
      elapsed: split.totalDuration ?? split.time ?? null,
      time: split.duration ?? split.splitDuration ?? null,
      speed: split.speed ?? null,
      position: split.rank ?? split.totalPosition ?? null,
      timeOfDay: null
    }))
  });
  const swim = normalizeLeg(leg("Swim"));
  const bike = normalizeLeg(leg("Bike"));
  const run = normalizeLeg(leg("Run"));
  const t1 = normalizeLeg(leg("T1"));
  const t2 = normalizeLeg(leg("T2"));
  const finished = Boolean(detail?.gunTime || detail?.finishTime || detail?.overallPosition);
  const hasTiming = legs.some((item) => item?.legDuration || item?.duration || item?.splits?.length);
  return {
    state: finished ? "finished" : hasTiming ? "racing" : "not_started",
    overallTime: detail?.gunTime ?? detail?.netTime ?? detail?.finishTime ?? null,
    overallPosition: detail?.overallPosition ?? null,
    categoryPosition: detail?.categoryPosition ?? null,
    genderPosition: detail?.genderPosition ?? null,
    swim,
    t1: { time: t1.time },
    bike,
    t2: { time: t2.time },
    run,
    finish: finished ? {
      label: "Finish",
      elapsed: detail?.gunTime ?? detail?.netTime ?? detail?.finishTime ?? null,
      time: run.time,
      speed: null,
      position: detail?.overallPosition ?? null,
      timeOfDay: null
    } : null,
    lastPoint: null
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12_000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}`);
  }
  return response;
}

async function fetchText(url, headers = {}) {
  const response = await fetchWithTimeout(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,*/*", ...headers }
  });
  return response.text();
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json",
      origin: "https://sporthive.com",
      referer: "https://sporthive.com/"
    }
  });
  return response.json();
}

async function memo(key, ttlMs, loader) {
  const now = Date.now();
  const current = caches.get(key);
  if (current?.value !== undefined && current.expiresAt > now) return current.value;
  if (current?.promise) return current.promise;
  const promise = loader()
    .then((value) => {
      caches.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((error) => {
      caches.delete(key);
      throw error;
    });
  caches.set(key, { promise, expiresAt: now + ttlMs });
  return promise;
}

async function discoverMssEvent() {
  return memo("mss-event", 5 * 60_000, async () => {
    const html = await fetchText(ENDPOINTS.mssList);
    return selectMssEvent(parseMssEventList(html));
  });
}

function sporthiveCandidateScore(event) {
  const name = normalize(event?.name);
  const location = normalize(event?.location);
  let score = 0;
  if (name.includes("dts")) score += 4;
  if (name.includes("bosbaan")) score += 5;
  if (name.includes("amsterdamse bos")) score += 3;
  if (location.includes("amsterdam")) score += 2;
  return score;
}

async function discoverSporthiveEvent() {
  return memo("sporthive-event", 5 * 60_000, async () => {
    const searches = TARGET.eventAliases.map(async (term) => {
      const query = new URLSearchParams({
        term,
        category: "Active",
        type: "Events",
        count: "50",
        offset: "0",
        fuzzy: "true"
      });
      const data = await fetchJson(`${ENDPOINTS.sporthiveSearch}?${query}`);
      return data.events ?? data.Events ?? [];
    });
    const settled = await Promise.allSettled(searches);
    const candidates = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const unique = [...new Map(candidates.map((event) => [event.entityId ?? event.id, event])).values()];
    return unique
      .filter((event) => String(event.startTime ?? event.date ?? "").startsWith(TARGET.dateIso))
      .filter((event) => sporthiveCandidateScore(event) >= 7)
      .sort((a, b) => sporthiveCandidateScore(b) - sporthiveCandidateScore(a))[0] ?? null;
  });
}

function makeMssSearchUrl(eventId) {
  const query = new URLSearchParams({
    eventid: eventId,
    mode: "search",
    searchmode: "quick",
    search_quick: TARGET.athlete,
    language: "us",
    search_bib: "",
    search_firstname: "",
    search_lastname: "",
    search_club: "",
    search_city: "",
    search_nation: "",
    search_distance: "",
    search_category: "",
    search_time: "Finish",
    search_sortby: "[TIMEFIELD]",
    search_sorttype: "ASC"
  });
  return `${ENDPOINTS.mssData}?${query}`;
}

async function discoverMssAthlete(eventId) {
  return memo(`mss-athlete:${eventId}`, 2 * 60_000, async () => {
    const source = await fetchText(makeMssSearchUrl(eventId));
    const candidates = parseMssSearchResponse(source);
    const exact = candidates.filter((candidate) => normalize(candidate.name) === normalize(TARGET.athlete));
    return { candidates, exact };
  });
}

async function fetchMssRaceCatalog(event) {
  return memo(`mss-races:${event.id}`, 30 * 60_000, async () => {
    const html = await fetchText(event.sourceUrl);
    return parseMssRaceCatalog(html);
  });
}

async function fetchMssParticipant(eventId, participantId) {
  const query = new URLSearchParams({
    eventid: eventId,
    mode: "participantinfo",
    pid: participantId,
    language: "us"
  });
  const source = await fetchText(`${ENDPOINTS.mssData}?${query}`);
  return parseMssParticipantResponse(source);
}

async function discoverSporthiveAthlete(event) {
  const eventId = event?.entityId ?? event?.id;
  if (!eventId) return null;
  const query = new URLSearchParams({
    term: TARGET.athlete,
    category: "ActiveEvent",
    type: "Participants",
    eventid: String(eventId),
    count: "20",
    offset: "0",
    fuzzy: "false"
  });
  const search = await fetchJson(`${ENDPOINTS.sporthiveResults}/search?${query}`);
  const participants = search.participants ?? search.Participants ?? [];
  const exact = participants.filter((participant) => normalize(participant.name ?? `${participant.firstName ?? ""} ${participant.lastName ?? ""}`) === normalize(TARGET.athlete));
  if (exact.length !== 1) return { participants, exact };
  const participant = exact[0];
  const raceId = participant.raceId ?? participant.RaceId;
  const bib = participant.bib ?? participant.bibNumber ?? participant.Bib;
  if (!raceId || !bib) return { participants, exact };
  const detail = await fetchJson(`${ENDPOINTS.sporthiveResults}/races/${encodeURIComponent(raceId)}/bibs/${encodeURIComponent(bib)}`);
  return { participants, exact, participant, detail, raceId, bib };
}

function providerSummary(mssEvent, sporthiveEvent, errors = []) {
  return {
    primary: mssEvent ? "MSS Live" : sporthiveEvent ? "Sporthive" : null,
    mss: mssEvent ? "available" : "not_published",
    sporthive: sporthiveEvent ? "available" : "not_published",
    notes: errors.map((error) => error instanceof Error ? error.message : String(error))
  };
}

function basePayload(state, providers, message) {
  const seconds = state === "racing" ? 15 : state === "finished" ? 300 : state === "event_pending" ? 300 : 60;
  return {
    ok: state !== "error",
    state,
    message,
    fetchedAt: new Date().toISOString(),
    nextRefreshSeconds: seconds,
    event: {
      name: `${TARGET.eventName} 2026`,
      date: TARGET.dateIso,
      location: TARGET.location,
      mssId: null,
      sporthiveId: null,
      sourceUrl: null
    },
    athlete: { name: TARGET.athlete },
    timing: null,
    providers
  };
}

export async function getTrackerData() {
  const [mssResult, sporthiveResult] = await Promise.allSettled([
    discoverMssEvent(),
    discoverSporthiveEvent()
  ]);
  const mssEvent = mssResult.status === "fulfilled" ? mssResult.value : null;
  const sporthiveEvent = sporthiveResult.status === "fulfilled" ? sporthiveResult.value : null;
  const discoveryErrors = [mssResult, sporthiveResult]
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);
  const providers = providerSummary(mssEvent, sporthiveEvent, discoveryErrors);

  if (!mssEvent && !sporthiveEvent) {
    const payload = basePayload("event_pending", providers, "The event has not appeared in the public timing services yet.");
    if (lastGoodResponse) return { ...lastGoodResponse, stale: true, refreshError: payload.message, fetchedAt: payload.fetchedAt };
    return payload;
  }

  if (mssEvent) {
    try {
      const found = await discoverMssAthlete(mssEvent.id);
      if (found.exact.length > 1) {
        const payload = basePayload("ambiguous", providers, "More than one exact athlete match was found; no record was selected automatically.");
        payload.event = { ...payload.event, mssId: mssEvent.id, sourceUrl: mssEvent.sourceUrl };
        payload.candidates = found.exact;
        return payload;
      }
      if (found.exact.length === 1) {
        const searchRecord = found.exact[0];
        const [participant, raceCatalog] = await Promise.all([
          fetchMssParticipant(mssEvent.id, searchRecord.participantId),
          fetchMssRaceCatalog(mssEvent)
        ]);
        const timing = normalizeMssTiming(participant);
        const selectedRace = raceCatalog.find((race) => normalize(race.name) === normalize(participant.race || searchRecord.race));
        const payload = basePayload(
          timing.state,
          providers,
          timing.state === "finished" ? "Official live timing shows a finish." : timing.state === "racing" ? "Live timing is updating." : "Registered; no timing mat has recorded a split yet."
        );
        payload.event = {
          ...payload.event,
          mssId: mssEvent.id,
          sporthiveId: sporthiveEvent?.entityId ?? sporthiveEvent?.id ?? null,
          sourceUrl: mssEvent.sourceUrl,
          races: raceCatalog
        };
        payload.athlete = {
          name: participant.name || searchRecord.name || TARGET.athlete,
          bib: participant.bib || searchRecord.bib,
          category: participant.category || searchRecord.category,
          race: participant.race || searchRecord.race,
          startGroup: participant.startGroup,
          officialStartTime: participant.officialStartTime,
          actualStartTime: participant.actualStartTime,
          city: participant.city,
          age: participant.age,
          participantId: searchRecord.participantId,
          raceId: selectedRace?.id ?? null
        };
        payload.timing = timing;
        lastGoodResponse = payload;
        return payload;
      }
    } catch (error) {
      providers.notes.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (sporthiveEvent) {
    try {
      const found = await discoverSporthiveAthlete(sporthiveEvent);
      if (found?.exact?.length === 1 && found.detail) {
        const person = found.participant;
        const timing = normalizeSporthiveDetail(found.detail);
        const payload = basePayload(timing.state, providers, "Timing loaded from Sporthive.");
        payload.event = {
          ...payload.event,
          mssId: mssEvent?.id ?? null,
          sporthiveId: sporthiveEvent.entityId ?? sporthiveEvent.id,
          sourceUrl: `https://sporthive.com/events/s/${encodeURIComponent(sporthiveEvent.entityId ?? sporthiveEvent.id)}`
        };
        payload.athlete = {
          name: person.name ?? `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim(),
          bib: found.bib,
          category: person.categoryName ?? person.category,
          race: person.raceName ?? null,
          raceId: found.raceId
        };
        payload.timing = timing;
        lastGoodResponse = payload;
        return payload;
      }
    } catch (error) {
      providers.notes.push(error instanceof Error ? error.message : String(error));
    }
  }

  const payload = basePayload("athlete_pending", providers, "The event is public, but Sylvain's exact participant record is not available yet.");
  payload.event = {
    ...payload.event,
    mssId: mssEvent?.id ?? null,
    sporthiveId: sporthiveEvent?.entityId ?? sporthiveEvent?.id ?? null,
    sourceUrl: mssEvent?.sourceUrl ?? null
  };
  if (lastGoodResponse) return { ...lastGoodResponse, stale: true, refreshError: payload.message, fetchedAt: payload.fetchedAt };
  return payload;
}

export { TARGET };
