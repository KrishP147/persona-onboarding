// End-to-end walkthrough in real Chrome (fake mic), with screenshots and timings.
// Usage: pnpm e2e [baseUrl]   (dev server running; uses the installed Chrome)
import puppeteer, { type Page } from "puppeteer-core";
import { promises as fs } from "fs";
import path from "path";

const BASE = process.argv[2] ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = path.join("harness", "e2e", new Date().toISOString().replace(/[:.]/g, "-"));

const results: { step: string; ok: boolean; note?: string }[] = [];
const check = (step: string, ok: boolean, note?: string) => {
  results.push({ step, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"} ${step}${note ? `  (${note})` : ""}`);
};

let shot = 0;
async function snap(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${String(++shot).padStart(2, "0")}-${name}.png`) });
}

const bodyHas = (page: Page, text: string, timeout = 30000) =>
  page
    .waitForFunction((t) => document.body.innerText.toLowerCase().includes(t), { timeout }, text.toLowerCase())
    .then(() => true)
    .catch(() => false);

async function agentBubbleCount(page: Page) {
  return page.evaluate(() => document.querySelectorAll("[data-role='agent']").length);
}

async function sendText(page: Page, text: string) {
  await page.click("input[aria-label='Message']");
  await page.type("input[aria-label='Message']", text);
  await page.keyboard.press("Enter");
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required", "--window-size=1300,900"],
    defaultViewport: { width: 1300, height: 900 },
  });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
  check("intro asks for a name", await bodyHas(page, "what do you want to call me?", 20000));
  check("intro has the legal link", await bodyHas(page, "yourpersona.com/legal", 1000));
  await snap(page, "intro");

  // your own message shows instantly, with a receipt
  const before = await agentBubbleCount(page);
  const t0 = Date.now();
  await sendText(page, "Julia");
  const instant = await page
    .waitForFunction(() => [...document.querySelectorAll("[data-role='user']")].some((e) => e.textContent?.includes("Julia")), { timeout: 400 })
    .then(() => true)
    .catch(() => false);
  check("own message appears instantly", instant);
  check("receipt shows sent/delivered", await page.$("[aria-label='sent'],[aria-label='delivered']").then(Boolean));
  await page.waitForFunction((n) => document.querySelectorAll("[data-role='agent']").length > n, { timeout: 30000 }, before).catch(() => {});
  const firstReplyMs = Date.now() - t0;
  check("agent replies", (await agentBubbleCount(page)) > before, `${firstReplyMs}ms to first bubble`);
  check("reply delay feels human (0.6s to 8s)", firstReplyMs > 600 && firstReplyMs < 8000, `${firstReplyMs}ms`);
  check("receipt is seen", await page.$("[aria-label='seen']").then(Boolean));
  check("no eyes on a short message", !(await page.$("[aria-label='reaction']")));

  const saveBtn = await page.waitForSelector("xpath/.//button[normalize-space()='Save']", { timeout: 15000 }).catch(() => null);
  check("contact card has a save button", !!saveBtn);
  if (saveBtn) {
    // The thread may still be smooth-scrolling; click the element itself, not a screen position.
    await new Promise((r) => setTimeout(r, 600));
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Save")?.click());
    check("header shows the name once saved", await page.waitForFunction(() => document.querySelector("header")?.textContent?.includes("Julia"), { timeout: 3000 }).then(() => true).catch(() => false));
  }
  await snap(page, "named");

  // call
  await sendText(page, "sure, call me");
  check("text says calling you now", await bodyHas(page, "calling you now", 30000));
  const tCall = Date.now();
  const accept = await page.waitForSelector("button[aria-label='Accept']", { timeout: 10000 }).catch(() => null);
  const ringDelay = Date.now() - tCall;
  check("phone rings a beat later", !!accept && ringDelay > 1500, `${ringDelay}ms`);
  if (accept) {
    await snap(page, "ringing");
    await accept.click();
    const hang = await page.waitForSelector("button[aria-label='Hang up']", { timeout: 10000 }).catch(() => null);
    check("call connects", !!hang);
    const side = await page.evaluate(() => {
      const chat = document.querySelector("header")?.getBoundingClientRect();
      const call = document.querySelector("button[aria-label='Hang up']")?.getBoundingClientRect();
      return chat && call ? call.left > chat.right : false;
    });
    check("call is a second phone beside the chat", side);
    const caption = await page
      .waitForFunction(() => !!document.querySelector("[data-caption='agent']")?.textContent?.trim(), { timeout: 25000 })
      .then(() => true)
      .catch(() => false);
    check("agent caption appears while speaking", caption);
    await snap(page, "on-call");
    const voiceInChat = await page.evaluate(() => [...document.querySelectorAll("[data-role='agent']")].some((e) => e.textContent?.toLowerCase().includes("on call")));
    check("call lines stay out of the chat", !voiceInChat);
    const agentBefore = await agentBubbleCount(page);
    await page.click("button[aria-label='Hang up']");
    const recap = await page.waitForFunction((n) => document.querySelectorAll("[data-role='agent']").length > n, { timeout: 30000 }, agentBefore).then(() => true).catch(() => false);
    check("a short text follows the hangup", recap);
    await new Promise((r) => setTimeout(r, 2500));
    await snap(page, "after-call");
    // hanging up must not trigger another call
    await new Promise((r) => setTimeout(r, 5000));
    check("no call back after hanging up", !(await page.$("button[aria-label='Accept']")));
  }

  // a silent call: the agent checks in, then says a real goodbye out loud before hanging up
  const callBtn = await page.$("header button[aria-label='Call']");
  if (callBtn) {
    await page.evaluate(() => {
      const w = window as unknown as { __captions: string[] };
      w.__captions = [];
      new MutationObserver(() => {
        const t = document.querySelector("[data-caption='agent']")?.textContent?.trim();
        if (t && w.__captions[w.__captions.length - 1] !== t) w.__captions.push(t);
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    const agentBefore2 = await agentBubbleCount(page);
    await callBtn.click();
    const connected = await page.waitForSelector("button[aria-label='Hang up']", { timeout: 15000 }).then(() => true).catch(() => false);
    check("you can call it back from the header", connected);
    // silence ladder: ~6s per check-in, three strikes, then goodbye
    const ended = await page.waitForFunction(() => !document.querySelector("button[aria-label='Hang up']"), { timeout: 90000 }).then(() => true).catch(() => false);
    const captions = await page.evaluate(() => (window as unknown as { __captions: string[] }).__captions);
    check("silent call ends on its own", ended, `${captions.length} captions`);
    check("goodbye is spoken before hanging up", captions.some((c) => /\b(bye|text you|talk soon|let you go)\b/i.test(c)), captions.slice(-2).join(" | "));
    const texted = await page.waitForFunction((n) => document.querySelectorAll("[data-role='agent']").length > n, { timeout: 30000 }, agentBefore2).then(() => true).catch(() => false);
    check("a text follows the silent call", texted);
    await snap(page, "after-silent-call");
  }

  // reload keeps everything, restart clears it
  await page.reload({ waitUntil: "networkidle2" });
  check("reload keeps the thread", await bodyHas(page, "calling you now", 10000));
  await page.click("xpath/.//button[normalize-space()='Restart']");
  await page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("restart starts fresh", !(await bodyHas(page, "calling you now", 3000)) && (await bodyHas(page, "what do you want to call me?", 20000)));

  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  await fs.writeFile(path.join(OUT, "RESULTS.md"), results.map((r) => `- ${r.ok ? "PASS" : "FAIL"} ${r.step}${r.note ? ` (${r.note})` : ""}`).join("\n") + "\n");
  console.log(`\n${results.length - failed.length}/${results.length} passed → ${OUT}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
