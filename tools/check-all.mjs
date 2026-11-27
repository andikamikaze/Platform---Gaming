#!/usr/bin/env node
/**
 * Orchestrator: jalankan semua fase pengecekan dan gabungkan hasilnya.
 *   npm run check
 *   npm run check -- --filter snake --skip-rooms
 */
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Report, projectRoot, reportsDir } from "./lib/report.mjs";
import { hasFlag } from "./lib/args.mjs";

const phases = [
  { name: "mount", script: "tools/check-mount.mjs", skipFlag: "skip-mount" },
  { name: "browser", script: "tools/check-browser.mjs", skipFlag: "skip-browser" },
  { name: "room", script: "tools/check-rooms.mjs", skipFlag: "skip-rooms" },
];

const combined = new Report("Pre-publish check");
const passthrough = process.argv.slice(2).filter((arg) => !arg.startsWith("--skip-"));

for (const phase of phases) {
  if (hasFlag(phase.skipFlag)) {
    combined.skip(phase.name, "phase", { detail: "dilewati lewat flag" });
    console.log(`\n=== LEWAT: ${phase.name} ===`);
    continue;
  }
  console.log(`\n=== ${phase.name.toUpperCase()} ===`);
  const env = { ...process.env };
  if (phase.name === "room" && hasFlag("skip-rooms")) env.SKIP_ROOM_TEST = "1";
  const result = spawnSync(process.execPath, [path.join(projectRoot, phase.script), ...passthrough], {
    cwd: projectRoot,
    stdio: "inherit",
    env,
  });
  try {
    const data = JSON.parse(await readFile(path.join(reportsDir, "check-report.json"), "utf8"));
    for (const item of data.results) combined.add(item);
  } catch (error) {
    combined.fail(phase.name, "phase", {
      errors: [`Tidak bisa membaca laporan fase (exit ${result.status}): ${error.message}`],
    });
  }
}

console.log("\n=== RINGKASAN ===");
combined.print();
const written = await combined.write();
console.log(`Laporan gabungan: ${path.relative(projectRoot, written.jsonPath)}`);
console.log(`Laporan Markdown : ${path.relative(projectRoot, written.mdPath)}`);
process.exitCode = combined.ok ? 0 : 1;
