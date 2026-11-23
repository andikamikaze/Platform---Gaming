import { chromium } from "playwright";

/** Pakai Chrome lokal bila tersedia, otherwise Chromium bawaan Playwright. */
export async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch (_) {
    return await chromium.launch({ headless: true });
  }
}
