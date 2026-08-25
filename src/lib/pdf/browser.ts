import type { Browser } from "puppeteer-core";

// On Vercel we launch @sparticuz/chromium; locally we use the developer's
// installed Chrome so no 60MB binary download is needed in dev.
export async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  return puppeteer.launch({ channel: "chrome", headless: true });
}
