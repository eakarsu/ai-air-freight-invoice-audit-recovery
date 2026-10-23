// Deterministic domain insights over saved feature_records. No provider call is made.
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export function filterRecords(rows, { q = "", status = "", risk = "" } = {}) {
  const needle = String(q || "").trim().toLowerCase();
  return (rows || []).filter((row) => {
    if (status && row.status !== status) return false;
    if (risk && row.risk !== risk) return false;
    if (!needle) return true;
    const hay = [row.reference, row.title, row.owner, row.status, row.risk, JSON.stringify(row.payload || {})].join(" ").toLowerCase();
    return hay.includes(needle);
  });
}
function esc(v) { let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v); if (/^[=+@\t\r-]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
export function recordsToCsv(rows) {
  const cols = ["id", "reference", "title", "status", "owner", "risk", "due_date", "amount"];
  return [cols.join(","), ...(rows || []).map((r) => cols.map((c) => esc(c === "due_date" && r[c] ? String(r[c]).slice(0, 10) : r[c])).join(","))].join("\n");
}
export function buildInsights(rows, feature, config) {
  const list = rows || [];
  const calc = config?.calculation || {};
  const totalAmount = list.reduce((s, r) => s + num(r.amount), 0);
  const highRisk = list.filter((r) => ["High", "Critical"].includes(r.risk)).length;
  const open = list.filter((r) => !["Approved", "Closed"].includes(r.status)).length;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = list.filter((r) => r.due_date && String(r.due_date).slice(0, 10) < today && !["Approved", "Closed"].includes(r.status)).length;
  const actual = list.reduce((s, r) => s + num(r.payload?.[calc.actualKey]), 0);
  const expected = list.reduce((s, r) => s + num(r.payload?.[calc.expectedKey]), 0);
  const variance = calc.direction === "expected-minus-actual" ? Math.max(0, expected - actual) : Math.max(0, actual - expected);
  const states = ["Complete", "Incomplete", "Exception"].map((s) => ({ s, n: list.filter((r) => r.payload?.evidenceState === s).length }));
  const top = [...list].sort((a, b) => num(b.amount) - num(a.amount))[0];
  const base = { aiGenerated: false, source: "Deterministic fallback \u2014 computed locally from saved records; no provider call was made." };
  return { ...base, featureId: feature.id, insights: [
    { id: "value-variance", title: `${feature.title} \u2014 value variance focus`, ...base, sections: [
      { label: "Records reviewed", value: list.length }, { label: calc.actualLabel || "Actual amount total", value: actual },
      { label: calc.expectedLabel || "Expected amount total", value: expected }, { label: calc.varianceLabel || "Variance", value: variance },
      { label: "Largest record reference", value: top?.reference ?? "" }, { label: "Largest record amount", value: top ? num(top.amount) : 0 } ] },
    { id: "attention-queue", title: `${feature.title} \u2014 overdue and high-risk queue`, ...base, sections: [
      { label: "Open records", value: open }, { label: "High or critical risk records", value: highRisk },
      { label: "Overdue open records", value: overdue }, { label: "Has overdue work", value: overdue > 0 } ] },
    { id: "evidence-completeness", title: `${feature.title} \u2014 evidence completeness`, ...base, sections: [
      ...states.map(({ s, n }) => ({ label: `Evidence ${s}`, value: n })),
      { label: "Total represented value", value: totalAmount }, { label: "Evidence complete", value: list.length > 0 && states[1].n === 0 && states[2].n === 0 } ] },
  ] };
}
export function mountDomainInsights(app, { pool, auth, featureById, config }) {
  app.get("/api/features/:id/records/export", auth, async (req, res, next) => {
    try {
      const feature = featureById(req.params.id);
      const format = String(req.query.format || "json").toLowerCase();
      if (!["csv", "json"].includes(format)) throw Object.assign(new Error("Choose csv or json export format"), { status: 422 });
      const rows = (await pool.query("SELECT * FROM feature_records WHERE feature_id=$1 ORDER BY updated_at DESC,id DESC", [feature.id])).rows;
      const filtered = filterRecords(rows, { q: req.query.q, status: req.query.status, risk: req.query.risk });
      res.setHeader("Content-Disposition", `attachment; filename="${feature.id}-records.${format}"`);
      if (format === "csv") { res.type("text/csv").send(recordsToCsv(filtered)); } else { res.type("application/json").send(JSON.stringify(filtered, null, 2)); }
    } catch (e) { next(e); }
  });
  app.get("/api/features/:id/insights", auth, async (req, res, next) => {
    try {
      const feature = featureById(req.params.id);
      const rows = (await pool.query("SELECT * FROM feature_records WHERE feature_id=$1 ORDER BY updated_at DESC,id DESC", [feature.id])).rows;
      res.json(buildInsights(rows, feature, config));
    } catch (e) { next(e); }
  });
}
