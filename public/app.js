const elements = {
  body: document.body,
  identity: document.querySelector("#identity"),
  statusLabel: document.querySelector("#status-label"),
  statusMessage: document.querySelector("#status-message"),
  overallTime: document.querySelector("#overall-time"),
  overallPosition: document.querySelector("#overall-position"),
  categoryPosition: document.querySelector("#category-position"),
  lastPoint: document.querySelector("#last-point"),
  courseList: document.querySelector("#course-list"),
  sourceLabel: document.querySelector("#source-label"),
  lastUpdated: document.querySelector("#last-updated"),
  refreshButton: document.querySelector("#refresh-button"),
  refreshNote: document.querySelector("#refresh-note"),
  notice: document.querySelector("#notice")
};

const stateLabels = {
  racing: "Racing",
  finished: "Finished",
  not_started: "Not started",
  event_pending: "Event not published",
  athlete_pending: "Athlete not found yet",
  ambiguous: "Multiple matches",
  error: "Timing unavailable"
};

const phaseDefinitions = [
  { key: "swim", label: "Swim", marker: "S" },
  { key: "t1", label: "T1", marker: "1" },
  { key: "bike", label: "Bike", marker: "B" },
  { key: "t2", label: "T2", marker: "2" },
  { key: "run", label: "Run", marker: "R" },
  { key: "finish", label: "Finish", marker: "F" }
];

let timerId = null;
let nextRefreshAt = null;
let lastPayload = null;

function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function ordinal(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const mod100 = number % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[number % 10] ?? "th");
  return `${number}${suffix}`;
}

function formatChecked(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(iso));
}

function phaseData(timing, key) {
  if (!timing) return { time: null, position: null, splits: [] };
  if (key === "finish") {
    return {
      time: timing.finish?.elapsed ?? timing.overallTime,
      position: timing.finish?.position ?? timing.overallPosition,
      splits: []
    };
  }
  return timing[key] ?? { time: null, position: null, splits: [] };
}

function createSplitRow(split) {
  const row = document.createElement("div");
  row.className = "split-row";
  const label = document.createElement("span");
  label.textContent = split.label || "Intermediate";
  const time = document.createElement("strong");
  time.textContent = valueOrDash(split.elapsed || split.time);
  const extra = document.createElement("span");
  extra.textContent = split.position ? ordinal(split.position) : (split.speed || "");
  row.append(label, time, extra);
  return row;
}

function renderCourse(timing) {
  elements.courseList.replaceChildren();
  for (const definition of phaseDefinitions) {
    const data = phaseData(timing, definition.key);
    const row = document.createElement("article");
    row.className = "leg";
    row.dataset.key = definition.key;
    row.dataset.hasTime = Boolean(data.time);

    const marker = document.createElement("span");
    marker.className = "leg-marker";
    marker.textContent = definition.marker;
    marker.setAttribute("aria-hidden", "true");

    const main = document.createElement("div");
    main.className = "leg-main";
    const name = document.createElement("span");
    name.className = "leg-name";
    name.textContent = definition.label;
    const time = document.createElement("strong");
    time.className = "leg-time";
    time.textContent = valueOrDash(data.time);
    const position = document.createElement("span");
    position.className = "leg-position";
    position.textContent = data.position ? `${ordinal(data.position)} at this point` : "Position —";
    main.append(name, time, position);

    if (Array.isArray(data.splits) && data.splits.length) {
      const splits = document.createElement("div");
      splits.className = "splits";
      for (const split of data.splits) splits.append(createSplitRow(split));
      main.append(splits);
    }
    row.append(marker, main);
    elements.courseList.append(row);
  }
}

function setNotice(message) {
  elements.notice.hidden = !message;
  elements.notice.textContent = message || "";
}

function render(payload) {
  lastPayload = payload;
  const athlete = payload.athlete ?? { name: "Sylvain Leupen" };
  const timing = payload.timing;
  elements.body.dataset.state = payload.state || "error";
  elements.statusLabel.textContent = stateLabels[payload.state] ?? "Waiting for timing";
  elements.statusMessage.textContent = payload.message || "Waiting for the next public update.";
  elements.overallTime.textContent = valueOrDash(timing?.overallTime);
  elements.overallPosition.textContent = ordinal(timing?.overallPosition);
  elements.categoryPosition.textContent = ordinal(timing?.categoryPosition);
  elements.lastPoint.textContent = timing?.lastPoint?.label || "—";
  elements.lastUpdated.textContent = formatChecked(payload.fetchedAt);
  elements.sourceLabel.textContent = payload.providers?.primary || "Not available yet";

  const identity = [
    `Bib ${valueOrDash(athlete.bib)}`,
    athlete.race || "Race —",
    athlete.category || "Category —"
  ];
  elements.identity.replaceChildren(...identity.map((text) => {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
  }));

  const providerNote = payload.providers?.sporthive === "not_published" && payload.providers?.mss === "available"
    ? "Sporthive has not published this event yet; current data comes from MSS Live."
    : null;
  setNotice(payload.stale ? `Showing the last good result. ${payload.refreshError || "The latest refresh failed."}` : providerNote);
  renderCourse(timing);
  scheduleRefresh(Number(payload.nextRefreshSeconds) || 60);
}

function scheduleRefresh(seconds) {
  window.clearInterval(timerId);
  nextRefreshAt = Date.now() + seconds * 1000;
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
    elements.refreshNote.textContent = remaining > 0 ? `Next check in ${remaining}s` : "Refreshing…";
    if (remaining <= 0) {
      window.clearInterval(timerId);
      loadTracker();
    }
  };
  tick();
  timerId = window.setInterval(tick, 1000);
}

async function loadTracker() {
  elements.refreshButton.disabled = true;
  elements.refreshButton.textContent = "Refreshing…";
  try {
    const response = await fetch("/api/tracker", { headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`Timing service returned ${response.status}`);
    const payload = await response.json();
    render(payload);
    try { localStorage.setItem("dts-bosbaan-last-good", JSON.stringify(payload)); } catch { /* storage is optional */ }
  } catch (error) {
    if (!lastPayload) {
      try {
        const cached = JSON.parse(localStorage.getItem("dts-bosbaan-last-good") || "null");
        if (cached) render({ ...cached, stale: true, refreshError: error.message });
      } catch { /* use empty state below */ }
    }
    elements.body.dataset.state = "error";
    elements.statusLabel.textContent = "Timing unavailable";
    elements.statusMessage.textContent = "A refresh failed. The tracker will try again automatically.";
    setNotice(lastPayload ? `Showing the last result. ${error.message}` : error.message);
    scheduleRefresh(60);
  } finally {
    elements.refreshButton.disabled = false;
    elements.refreshButton.textContent = "Refresh now";
  }
}

elements.refreshButton.addEventListener("click", () => {
  window.clearInterval(timerId);
  loadTracker();
});

renderCourse(null);
loadTracker();
