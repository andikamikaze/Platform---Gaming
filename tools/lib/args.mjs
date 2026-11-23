export function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

export function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline !== undefined) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const next = process.argv[index + 1];
  return next && !next.startsWith("--") ? next : fallback;
}

export function filterIds() {
  return getArg("filter").split(",").map((id) => id.trim()).filter(Boolean);
}

export function matchesFilter(id, ids) {
  return !ids.length || ids.includes(id);
}
