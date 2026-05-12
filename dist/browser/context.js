export class BrowserSession {
    context;
    pages = new Map();
    activePageId = null;
    constructor(context) {
        this.context = context;
    }
    async newPage(url) {
        const page = await this.context.newPage();
        const id = `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.pages.set(id, page);
        this.activePageId = id;
        if (url)
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        return id;
    }
    getActivePage() {
        if (!this.activePageId)
            throw new Error("No active page.");
        const page = this.pages.get(this.activePageId);
        if (!page)
            throw new Error(`Page ${this.activePageId} not found.`);
        return page;
    }
    setActivePage(id) {
        if (!this.pages.has(id))
            throw new Error(`Page ${id} not found.`);
        this.activePageId = id;
    }
    getPageIds() {
        return Array.from(this.pages.keys());
    }
    async navigate(url, waitUntil) {
        await this.getActivePage().goto(url, {
            waitUntil: waitUntil ?? "domcontentloaded",
            timeout: 30000,
        });
    }
    async click(selector, timeout = 10000) {
        await this.getActivePage().locator(selector).click({ timeout });
    }
    async type(selector, text, submit = false) {
        const page = this.getActivePage();
        await page.locator(selector).fill(text);
        if (submit) {
            await page.keyboard.press("Enter");
            await page.waitForLoadState("domcontentloaded").catch(() => { });
        }
    }
    async extract(selector, attributes = ["textContent"]) {
        const page = this.getActivePage();
        const elements = await page.locator(selector).all();
        const results = [];
        for (const el of elements) {
            const row = {};
            for (const attr of attributes) {
                if (attr === "textContent")
                    row[attr] = await el.textContent();
                else if (attr === "innerHTML")
                    row[attr] = await el.innerHTML();
                else
                    row[attr] = await el.getAttribute(attr);
            }
            results.push(row);
        }
        return results;
    }
    async screenshot(fullPage = false) {
        return this.getActivePage().screenshot({ fullPage, type: "png" });
    }
    async evaluate(script) {
        return this.getActivePage().evaluate(script);
    }
    async scrollDown(pixels = 500) {
        await this.getActivePage().mouse.wheel(0, pixels);
    }
    async scrollToBottom() {
        await this.getActivePage().evaluate("window.scrollTo(0, document.body.scrollHeight)");
    }
    async waitForSelector(selector, timeout = 10000) {
        await this.getActivePage().waitForSelector(selector, { timeout });
    }
    async waitForLoadState(state = "networkidle") {
        await this.getActivePage().waitForLoadState(state, { timeout: 30000 });
    }
    async getSnapshot() {
        const page = this.getActivePage();
        return {
            url: page.url(),
            title: await page.title(),
            html: await page.content(),
            timestamp: Date.now(),
        };
    }
    async close() {
        for (const [, page] of this.pages)
            await page.close();
        this.pages.clear();
        this.activePageId = null;
        await this.context.close();
    }
    get pageCount() {
        return this.pages.size;
    }
}
//# sourceMappingURL=context.js.map