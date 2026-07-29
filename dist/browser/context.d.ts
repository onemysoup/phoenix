import { BrowserContext, Frame, Page } from "playwright";
export interface PageSnapshot {
    url: string;
    title: string;
    html: string;
    screenshot?: Buffer;
    timestamp: number;
}
export declare class BrowserSession {
    readonly context: BrowserContext;
    private pages;
    private activePageId;
    private activeFrame;
    private closed;
    constructor(context: BrowserContext);
    newPage(url?: string): Promise<string>;
    getActivePage(): Page;
    setActivePage(id: string): void;
    getPageIds(): string[];
    navigate(url: string, waitUntil?: "load" | "domcontentloaded" | "networkidle"): Promise<void>;
    click(selector: string, timeout?: number): Promise<void>;
    type(selector: string, text: string, submit?: boolean): Promise<void>;
    extract(selector: string, attributes?: string[]): Promise<Record<string, string | null>[]>;
    screenshot(fullPage?: boolean): Promise<Buffer>;
    evaluate<T>(script: string): Promise<T>;
    scrollDown(pixels?: number): Promise<void>;
    scrollToBottom(): Promise<void>;
    waitForSelector(selector: string, timeout?: number): Promise<void>;
    waitForLoadState(state?: "load" | "domcontentloaded" | "networkidle"): Promise<void>;
    getSnapshot(): Promise<PageSnapshot>;
    close(): Promise<void>;
    get pageCount(): number;
    markClosed(): void;
    get isClosed(): boolean;
    setActiveFrame(frame: Frame): void;
    clearActiveFrame(): void;
    getActiveFrame(): Frame | null;
}
