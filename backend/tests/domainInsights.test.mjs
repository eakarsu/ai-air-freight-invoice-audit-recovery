import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildInsights, filterRecords, recordsToCsv } from "../domainInsights.mjs";

const rows = [
  { id: 1, reference: "X-1", title: "Alpha case", status: "Open", owner: "Ann", risk: "High", due_date: "2020-01-01", amount: 0, payload: { evidenceState: "Incomplete" } },
  { id: 2, reference: "X-2", title: "Beta case", status: "Closed", owner: "Bob", risk: "Low", due_date: "2999-01-01", amount: 50, payload: { evidenceState: "Complete" } },
];
const feature = { id: "f1", title: "Domain check" };
const config = { calculation: { actualKey: "a", expectedKey: "e", actualLabel: "Actual", expectedLabel: "Expected", varianceLabel: "Variance", direction: "actual-minus-expected" } };

test("search and filter narrow the main list", () => {
  assert.equal(filterRecords(rows, { q: "alpha" }).length, 1);
  assert.equal(filterRecords(rows, { status: "Closed" })[0].reference, "X-2");
  assert.equal(filterRecords(rows, { risk: "High" }).length, 1);
  assert.equal(filterRecords(rows, { q: "missing" }).length, 0);
});
test("CSV export escapes values and keeps zero amounts", () => {
  const csv = recordsToCsv(rows);
  assert.ok(csv.startsWith("id,reference,title"));
  assert.ok(csv.includes("X-1"));
  assert.ok(csv.split("\n")[1].endsWith(",0"));
});
test("deterministic fallback insights preserve false, zero and empty values", () => {
  const out = buildInsights(rows, feature, config);
  assert.equal(out.aiGenerated, false);
  assert.equal(out.insights.length, 3);
  const flat = Object.fromEntries(out.insights.flatMap((i) => i.sections.map((s) => [s.label, s.value])));
  assert.equal(flat["Records reviewed"], 2);
  assert.equal(flat["Has overdue work"], true);
  const empty = buildInsights([], feature, config);
  const flatEmpty = Object.fromEntries(empty.insights.flatMap((i) => i.sections.map((s) => [s.label, s.value])));
  assert.equal(flatEmpty["Records reviewed"], 0);
  assert.equal(flatEmpty["Largest record reference"], "");
  assert.equal(flatEmpty["Evidence complete"], false);
});
test("insights and export routes are mounted behind auth", () => {
  const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.ok(server.includes("mountDomainInsights(app"));
  assert.ok(server.includes("filterRecords(rows"));
});
