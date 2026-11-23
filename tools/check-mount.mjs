#!/usr/bin/env node
/**
 * Fase 2 — mount smoke test untuk semua game.
 * Tiap game × mode dijalankan di proses Node terpisah (isolasi + timeout).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Report, projectRoot } from "./lib/report.mjs";
import { filterIds, matchesFilter, getArg } from "./lib/args.mjs";

const MODES = ["ai", "room-host", "room-guest"];
const workerPath = path.join(projectRoot, "tools", "lib", "mount-one.mjs");
const timeoutMs = Number(getArg("timeout", "15000")) || 15000;
const jobs = Math.min(16, Math.max(1, Number(getArg("jobs", "6")) || 6));
const filter = filterIds();
const report = new Report("Mount check");

const { GAMES } = await import(`${pathToFileURL(path.join(projectRoot, "JS", "games-manifest.js")).href}?t=${Date.now()}`);
const queue = [];
for (const game of GAMES) {
  if (!matchesFilter(game.id, filter)) continue;
  for (const mode of MODES) queue.push({ id: game.id, mode, kind: game.kind });
}

console.log(`Mount check: ${queue.length} skenario · ${jobs} worker · timeout ${timeoutMs}ms`);

function runWorker({ id, mode }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [workerPath, "--id", id, "--mode", mode], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGKILL");
      finish({ errors: [`Timeout ${timeoutMs}ms — kemungkinan loop tak berhenti.`], warnings: [] });
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });

    function finish(extra = {}) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const start = stdout.indexOf("__MGP_RESULT__");
      const end = stdout.indexOf("__MGP_END__", start);
      let parsed = null;
      if (start >= 0 && end >= 0) {
        try {
          parsed = JSON.parse(stdout.slice(start + "__MGP_RESULT__".length, end).trim());
        } catch (error) {
          parsed = { errors: [`Gagal parsing hasil worker: ${error.message}`], warnings: [] };
        }
      }
      resolve({
        errors: [...(parsed?.errors || []), ...extra.errors || []],
        warnings: [...(parsed?.warnings || []), ...extra.warnings || []],
        destroyed: Boolean(parsed?.destroyed),
        rendered: Boolean(parsed?.rendered),
        durationMs: parsed?.durationMs || 0,
        stderr: stderr.trim(),
      });
    }

    child.on("error", (error) => finish({ errors: [`Gagal spawn worker: ${error.message}`] }));
    child.on("close", (code) => {
      if (code !== 0 && !stdout.includes("__MGP_RESULT__")) {
        finish({ errors: [`Worker keluar dengan code ${code}. ${stderr.split(/\r?\n/).filter(Boolean).slice(-2).join(" | ")}`.trim()] });
      } else {
        finish({});
      }
    });
  });
}

let cursor = 0;
async function workerLoop() {
  while (cursor < queue.length) {
    const item = queue[cursor++];
    const result = await runWorker(item);
    const errors = [...result.errors];
    if (!result.destroyed && !errors.length) errors.push("destroy()/close() tidak dipanggil.");
    report.add({
      phase: "mount",
      id: `${item.id}/${item.mode}`,
      status: errors.length ? "fail" : result.warnings.length ? "warn" : "pass",
      errors,
      warnings: result.warnings,
      detail: `${item.kind} · ${result.rendered ? "rendered" : "no-render"} · ${result.durationMs}ms`,
      durationMs: result.durationMs,
    });
  }
}

await Promise.all(Array.from({ length: jobs }, workerLoop));

report.print();
const written = await report.write();
console.log(`Laporan: ${path.relative(projectRoot, written.mdPath)}`);
process.exitCode = report.ok ? 0 : 1;
