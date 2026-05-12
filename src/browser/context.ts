import { BrowserContext, Page } from "playwright-core";

export interface PageSnapshot {
  url: string;
  title: string;
  html: string;
  screenshot?: Buffer;
  timestamp: number;
}

export class BrowserSession {
  readonly context: BrowserContext;
  private pages: Map<string, Page> = new Map();
  private activePageId: string | null = null;

  constructor(context: BrowserContext) {
    this.context = context;
  }

  async newPage(url?: string): Promise<string> {
    const page = await this.context.newPage();
    const id = `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.pages.set(id, page);
    this.activePageId = id;
    if (url)
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    return id;
  }

  getActivePage(): Page {
    if (!this.activePageId) throw new Error("No active page.");
    const page = this.pages.get(this.activePageId);
    if (!page) throw new Error(`Page ${this.activePageId} not found.`);
    return page;
  }

  setActivePage(id: string): void {
    if (!this.pages.has(id)) throw new Error(`Page ${id} not found.`);
    this.activePageId = id;
  }

  getPageIds(): string[] {
    return Array.from(this.pages.keys());
  }

  async navigate(url: string, waitUntil?: "load" | "domcontentloaded" | "networkidle"): Promise<void> {
    await this.getActivePage().goto(url, {
      waitUntil: waitUntil ?? "domcontentloaded",
      timeout: 30000,
    });
  }

  async click(selector: string, timeout = 10000): Promise<void> {
    await this.getActivePage().locator(selector).click({ timeout });
  }

  async type(selector: string, text: string, submit = false): Promise<void> {
    const page = this.getActivePage();
    await page.locator(selector).fill(text);
    if (submit) {
      await page.keyboard.press("Enter");
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    }
  }

  async extract(selector: string, attributes: string[] = ["textContent"]): Promise<Record<string, string | null>[]> {
    const page = this.getActivePage();
    const elements = await page.locator(selector).all();
    const results: Record<string, string | null>[] = [];
    for (const el of elements) {
      const row: Record<string, string | null> = {};
      for (const attr of attributes) {
        if (attr === "textContent") row[attr] = await el.textContent();
        else if (attr === "innerHTML") row[attr] = await el.innerHTML();
        else row[attr] = await el.getAttribute(attr);
      }
      results.push(row);
    }
    return results;
  }

  async screenshot(fullPage = false): Promise<Buffer> {
    return this.getActivePage().screenshot({ fullPage, type: "png" });
  }

  async evaluate<T>(script: string): Promise<T> {
    return this.getActivePage().evaluate(script);
  }

  async scrollDown(pixels = 500): Promise<void> {
    await this.getActivePage().mouse.wheel(0, pixels);
  }

  async scrollToBottom(): Promise<void> {
    await this.getActivePage().evaluate("window.scrollTo(0, document.body.scrollHeight)");
  }

  async waitForSelector(selector: string, timeout = 10000): Promise<void> {
    await this.getActivePage().waitForSelector(selector, { timeout });
  }

  async waitForLoadState(state: "load" | "domcontentloaded" | "networkidle" = "networkidle"): Promise<void> {
    await this.getActivePage().waitForLoadState(state, { timeout: 30000 });
  }

  async getSnapshot(): Promise<PageSnapshot> {
    const page = this.getActivePage();
    return {
      url: page.url(),
      title: await page.title(),
      html: await page.content(),
      timestamp: Date.now(),
    };
  }

  async close(): Promise<void> {
    for (const [, page] of this.pages) await page.close();
    this.pages.clear();
    this.activePageId = null;
    await this.context.close();
  }

  get pageCount(): number {
    return this.pages.size;
  }
}
