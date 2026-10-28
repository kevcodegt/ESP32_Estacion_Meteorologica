import assert from "node:assert/strict";
import test from "node:test";
import { DASHBOARD_HTML } from "../src/dashboard.js";

test("updates live data every second without reloading the page", () => {
  assert.match(DASHBOARD_HTML, /var POLL_INTERVAL_MS = 1000/);
  assert.match(DASHBOARD_HTML, /window\.setTimeout\(liveLoop, POLL_INTERVAL_MS\)/);
  assert.doesNotMatch(DASHBOARD_HTML, /setInterval\(tick, POLL_INTERVAL_MS\)/);
});

test("shows low-light readings with decimal precision", () => {
  assert.match(DASHBOARD_HTML, /number\(latest\.lightLux, 1\)/);
  assert.match(DASHBOARD_HTML, /"lightLux", 1\)/);
});

test("includes desktop, tablet and phone responsive layouts", () => {
  assert.match(DASHBOARD_HTML, /@media \(max-width: 1024px\)/);
  assert.match(DASHBOARD_HTML, /@media \(max-width: 560px\)/);
  assert.match(DASHBOARD_HTML, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(DASHBOARD_HTML, /\.metrics \{ grid-template-columns: repeat\(2, 1fr\); \}/);
  assert.match(DASHBOARD_HTML, /\.metrics \{ grid-template-columns: 1fr; \}/);
});
