import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const projectRoot = path.dirname(toolsDir);
export const reportsDir = path.join(projectRoot, "reports");

const ICONS = { pass: "✔", fail: "✖", warn: "⚠", skip: "–" };

export class Report {
  constructor(name) {
    this.name = name;
    this.results = [];
    this.startedAt = Date.now();
    this.finishedAt = null;
  }

  add({ phase, id = "-", status = "pass", durationMs = 0, errors = [], warnings = [], detail = "" }) {
    this.results.push({
      phase,
      id,
      status,
      durationMs: Math.round(durationMs),
      errors: errors.map(normalizeMessage),
      warnings: warnings.map(normalizeMessage),
      detail: detail ? String(detail) : "",
    });
    return this;
  }

  pass(phase, id, opts = {}) { return this.add({ phase, id, status: "pass", ...opts }); }
  fail(phase, id, opts = {}) { return this.add({ phase, id, status: "fail", ...opts }); }
  warn(phase, id, opts = {}) { return this.add({ phase, id, status: "warn", ...opts }); }
  skip(phase, id, opts = {}) { return this.add({ phase, id, status: "skip", ...opts }); }

  count(status) { return this.results.filter((item) => item.status === status).length; }
  get failures() { return this.results.filter((item) => item.status === "fail"); }
  get warnings() { return this.results.filter((item) => item.status === "warn"); }
  get ok() { return this.failures.length === 0; }

  phaseSummary(phase) {
    const items = this.results.filter((item) => item.phase === phase);
    return {
      phase,
      total: items.length,
      pass: items.filter((i) => i.status === "pass").length,
      fail: items.filter((i) => i.status === "fail").length,
      warn: items.filter((i) => i.status === "warn").length,
      skip: items.filter((i) => i.status === "skip").length,
    };
  }

  toJSON() {
    this.finishedAt = this.finishedAt || Date.now();
    return {
      name: this.name,
      startedAt: new Date(this.startedAt).toISOString(),
      finishedAt: new Date(this.finishedAt).toISOString(),
      durationMs: this.finishedAt - this.startedAt,
      ok: this.ok,
      totals: {
        pass: this.count("pass"),
        fail: this.count("fail"),
        warn: this.count("warn"),
        skip: this.count("skip"),
      },
      phases: [...new Set(this.results.map((item) => item.phase))].map((phase) => this.phaseSummary(phase)),
      results: this.results,
    };
  }

  toMarkdown() {
    const data = this.toJSON();
    const lines = [
      `# ${data.name}`,
      "",
      `- Status: **${data.ok ? "LULUS" : "GAGAL"}**`,
      `- Waktu: ${data.startedAt} → ${data.finishedAt} (${(data.durationMs / 1000).toFixed(1)} detik)`,
      `- Hasil: ${data.totals.pass} lulus · ${data.totals.fail} gagal · ${data.totals.warn} warning · ${data.totals.skip} dilewati`,
      "",
      "## Ringkasan per fase",
      "",
      "| Fase | Total | Lulus | Gagal | Warning | Lewat |",
      "| --- | ---: | ---: | ---: | ---: | ---: |",
      ...data.phases.map((p) => `| ${p.phase} | ${p.total} | ${p.pass} | ${p.fail} | ${p.warn} | ${p.skip} |`),
      "",
      "## Item gagal / warning / dilewati",
      "",
    ];

    const notable = this.results.filter((item) => item.status !== "pass");
    if (!notable.length) {
      lines.push("_Tidak ada._", "");
    } else {
      lines.push("| Status | Fase | Item | Detail |", "| --- | --- | --- | --- |");
      for (const item of notable) {
        const messages = [...item.errors, ...item.warnings, item.detail].filter(Boolean);
        const detail = messages.join(" · ").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").slice(0, 300);
        lines.push(`| ${ICONS[item.status]} ${item.status} | ${item.phase} | \`${item.id}\` | ${detail} |`);
      }
      lines.push("");
    }
    lines.push("## Semua hasil", "", "| Status | Fase | Item | ms |", "| --- | --- | --- | ---: |");
    for (const item of this.results) {
      lines.push(`| ${ICONS[item.status]} ${item.status} | ${item.phase} | ${item.id} | ${item.durationMs} |`);
    }
    lines.push("");
    return lines.join("\n");
  }

  async write(dir = reportsDir) {
    await mkdir(dir, { recursive: true });
    const jsonPath = path.join(dir, "check-report.json");
    const mdPath = path.join(dir, "check-report.md");
    await writeFile(jsonPath, JSON.stringify(this.toJSON(), null, 2), "utf8");
    await writeFile(mdPath, this.toMarkdown(), "utf8");
    this.finish();
    return { jsonPath, mdPath };
  }

  finish() {
    if (!this.finishedAt) this.finishedAt = Date.now();
  }

  print() {
    const data = this.toJSON();
    console.log(`\n${this.name}`);
    for (const phase of data.phases) {
      const bad = phase.fail;
      const icon = bad ? ICONS.fail : ICONS.pass;
      console.log(
        `  ${icon} ${phase.phase.padEnd(10)} ${String(phase.pass).padStart(3)}/${String(phase.total).padEnd(3)} lulus` +
        `  (${phase.fail} gagal, ${phase.warn} warning, ${phase.skip} lewat)`
      );
    }
    for (const item of this.failures) {
      console.log(`     ${ICONS.fail} ${item.phase}/${item.id}: ${(item.errors[0] || item.detail || "gagal")}`);
    }
    console.log(
      `  Total: ${data.totals.pass} lulus · ${data.totals.fail} gagal · ${data.totals.warn} warning · ${data.totals.skip} lewat` +
      `  · ${(data.durationMs / 1000).toFixed(1)} detik`
    );
  }
}

function normalizeMessage(error) {
  if (error == null) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return `${error.name}: ${error.message}`.trim();
  if (error.message) return String(error.message);
  return String(error);
}
