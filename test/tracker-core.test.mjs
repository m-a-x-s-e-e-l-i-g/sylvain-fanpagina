import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMssTiming,
  normalizeSporthiveDetail,
  parseMssEventList,
  parseMssParticipantResponse,
  parseMssRaceCatalog,
  parseMssSearchResponse,
  selectMssEvent
} from "../server/tracker-core.mjs";

function asAssignment(id, html) {
  const escaped = html.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
  return `document.getElementById('${id}').innerHTML='${escaped}';`;
}

test("discovers the matching MSS event without a fixed event ID", () => {
  const events = parseMssEventList(`
    <table>
      <tr id="row8000" onclick="document.location.href='front/index.php?eventid=8000&ignoreuseragent=true'"><td>Other Race</td><td>26-09-2026</td><td>NED</td></tr>
      <tr id="row8055" onclick="document.location.href='front/index.php?eventid=8055&ignoreuseragent=true'"><td>DTS Bosbaan</td><td>26-09-2026</td><td>NED</td></tr>
    </table>
  `);
  assert.equal(events.length, 2);
  assert.equal(selectMssEvent(events)?.id, "8055");
});

test("extracts MSS race/distance IDs from the event page", () => {
  const races = parseMssRaceCatalog(`
    <select name="results_distance">
      <option value="1">Olympic Distance</option>
      <option value="2">Olympic Distance Relay</option>
      <option value="3">Sprint</option>
      <option value="4">Sprint Relay</option>
    </select>
  `);
  assert.deepEqual(races, [
    { id: "1", name: "Olympic Distance" },
    { id: "2", name: "Olympic Distance Relay" },
    { id: "3", name: "Sprint" },
    { id: "4", name: "Sprint Relay" }
  ]);
});

test("selects a participant from the MSS quick-search response", () => {
  const source = asAssignment("search_results", `
    <table><tr id="search_row_1995628954">
      <td>113</td><td>Sylvain Leupen</td><td>NL</td><td></td>
      <td>Olympic Distance</td><td>MU30</td><td></td><td></td><td></td>
    </tr></table>
  `);
  const participants = parseMssSearchResponse(source);
  assert.equal(participants[0].participantId, "1995628954");
  assert.equal(participants[0].bib, "113");
  assert.equal(participants[0].name, "Sylvain Leupen");
  assert.equal(participants[0].race, "Olympic Distance");
});

test("normalizes full triathlon splits from MSS participant markup", () => {
  const profile = `
    <span class="participant_value_big">Sylvain Leupen</span>
    <span>Race no</span> <span class="participant_value_big">113</span>
    <table>
      <tr><td class="participant_hdr_small">Distance</td><td>Olympic Distance</td></tr>
      <tr><td class="participant_hdr_small">Category</td><td>Mannen 16-29</td></tr>
      <tr><td class="participant_hdr_small">Net time</td><td>02:08:30 (finish time)</td></tr>
      <tr><td class="participant_hdr_small">Rank overall</td><td>12</td></tr>
      <tr><td class="participant_hdr_small">Rank category</td><td>3</td></tr>
      <tr><td class="split_segment">swim</td></tr>
      <tr><td class="split_time">End Swim</td><td class="details_racetime">24:00</td><td class="details_racetime">30</td><td class="details_racetime">25</td><td class="details_racetime">8</td><td class="details_segmenttime">24:00</td><td class="details_segmenttime">1:36 min/100m</td><td class="details_segmenttime">30</td><td class="details_segmenttime">25</td><td class="details_segmenttime">8</td><td class="details_splittime">24:00</td><td class="details_splittime">1:36 min/100m</td><td class="details_splittime">30</td><td class="details_splittime">25</td><td class="details_splittime">8</td><td class="split_time">08:54:00</td></tr>
      <tr><td class="split_segment">t1</td></tr>
      <tr><td class="split_time">Start Bike</td><td class="details_racetime">26:00</td><td class="details_racetime">28</td><td class="details_racetime">23</td><td class="details_racetime">7</td><td class="details_segmenttime">2:00</td><td class="details_segmenttime">-</td><td class="details_segmenttime">10</td><td class="details_segmenttime">9</td><td class="details_segmenttime">3</td><td class="split_time">08:56:00</td></tr>
      <tr><td class="split_segment">bike</td></tr>
      <tr><td class="split_time">Bike Lap 1</td><td class="details_racetime">46:00</td><td class="details_racetime">22</td><td class="details_racetime">19</td><td class="details_racetime">6</td><td class="details_segmenttime">20:00</td><td class="details_segmenttime">36 km/h</td><td class="details_segmenttime">15</td><td class="details_segmenttime">14</td><td class="details_segmenttime">4</td><td class="details_splittime">20:00</td><td class="details_splittime">36 km/h</td><td class="details_splittime">15</td><td class="details_splittime">14</td><td class="details_splittime">4</td><td class="split_time">09:16:00</td></tr>
      <tr><td class="split_time">End Bike</td><td class="details_racetime">1:26:00</td><td class="details_racetime">18</td><td class="details_racetime">16</td><td class="details_racetime">5</td><td class="details_segmenttime">1:00:00</td><td class="details_segmenttime">40 km/h</td><td class="details_segmenttime">12</td><td class="details_segmenttime">11</td><td class="details_segmenttime">3</td><td class="details_splittime">20:00</td><td class="details_splittime">40 km/h</td><td class="details_splittime">12</td><td class="details_splittime">11</td><td class="details_splittime">3</td><td class="split_time">09:56:00</td></tr>
      <tr><td class="split_segment">t2</td></tr>
      <tr><td class="split_time">Start Run</td><td class="details_racetime">1:27:30</td><td class="details_racetime">18</td><td class="details_racetime">16</td><td class="details_racetime">5</td><td class="details_segmenttime">1:30</td><td class="details_segmenttime">-</td><td class="details_segmenttime">14</td><td class="details_segmenttime">12</td><td class="details_segmenttime">4</td><td class="split_time">09:57:30</td></tr>
      <tr><td class="split_segment">run</td></tr>
      <tr><td class="split_time">Run Lap 1</td><td class="details_racetime">1:47:30</td><td class="details_racetime">14</td><td class="details_racetime">13</td><td class="details_racetime">4</td><td class="details_segmenttime">20:00</td><td class="details_segmenttime">4:00 min/km</td><td class="details_segmenttime">8</td><td class="details_segmenttime">8</td><td class="details_segmenttime">2</td><td class="details_splittime">20:00</td><td class="details_splittime">4:00 min/km</td><td class="details_splittime">8</td><td class="details_splittime">8</td><td class="details_splittime">2</td><td class="split_time">10:17:30</td></tr>
      <tr><td class="split_time">Finish</td><td class="details_racetime">2:08:30</td><td class="details_racetime">12</td><td class="details_racetime">11</td><td class="details_racetime">3</td><td class="details_segmenttime">41:00</td><td class="details_segmenttime">4:06 min/km</td><td class="details_segmenttime">9</td><td class="details_segmenttime">9</td><td class="details_segmenttime">2</td><td class="details_splittime">21:00</td><td class="details_splittime">4:12 min/km</td><td class="details_splittime">10</td><td class="details_splittime">10</td><td class="details_splittime">3</td><td class="split_time">10:38:30</td></tr>
    </table>
  `;
  const parsed = parseMssParticipantResponse(asAssignment("PARTICIPANTINFO", profile));
  const timing = normalizeMssTiming(parsed);
  assert.equal(parsed.splits.length, 7);
  assert.equal(timing.state, "finished");
  assert.equal(timing.overallTime, "02:08:30");
  assert.equal(timing.swim.time, "24:00");
  assert.equal(timing.t1.time, "2:00");
  assert.equal(timing.bike.time, "1:00:00");
  assert.equal(timing.bike.splits[0].label, "Bike Lap 1");
  assert.equal(timing.t2.time, "1:30");
  assert.equal(timing.run.time, "41:00");
  assert.equal(timing.finish.position, 12);
});

test("normalizes the structured Sporthive fallback response", () => {
  const timing = normalizeSporthiveDetail({
    gunTime: "02:03:04",
    overallPosition: 9,
    categoryPosition: 2,
    legs: [
      { name: "Swim", legDuration: "00:22:10", rank: 18, splits: [] },
      { name: "T1", legDuration: "00:01:30", splits: [] },
      { name: "Bike", legDuration: "01:01:00", rank: 8, splits: [{ name: "Bike 20 km", duration: "00:30:00", totalDuration: "00:53:40", rank: 10 }] },
      { name: "T2", legDuration: "00:01:00", splits: [] },
      { name: "Run", legDuration: "00:37:24", rank: 6, splits: [] }
    ]
  });
  assert.equal(timing.state, "finished");
  assert.equal(timing.bike.splits[0].label, "Bike 20 km");
  assert.equal(timing.categoryPosition, 2);
});
