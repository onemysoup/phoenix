/**
 * Semantic Healer — The Core Innovation
 *
 * Three-tier healing with multi-dimensional fingerprinting:
 *
 *   Tier 1: Repair Cache Lookup (~0ms, zero cost)
 *   Tier 2: Semantic + Visual Matching (~80ms, zero cost)
 *   Tier 3: LLM Analysis (~2s, costs money)
 *
 * Multi-dimensional fingerprint:
 *   - DOM semantics (tag, role, text, attributes, structure)
 *   - Visual features (position, size, color, layout)
 *   - Combined: semantic × 0.65 + visual × 0.35
 */
import { buildQueryFromSelector, scoreFingerprint, generateSelector } from "./matcher.js";
import { RepairCache } from "./repair-cache.js";
import { WeightStore } from "./weight-store.js";
import { sanitizeDOMForLLM, validateLLMOutput } from "../sanitizer.js";
const SEMANTIC_THRESHOLD = 0.45;
const VISUAL_BOOST_THRESHOLD = 0.35; // If semantic >= this AND visual confirms, accept
const SEMANTIC_WEIGHT = 0.65;
const VISUAL_WEIGHT = 0.35;
export class SemanticHealer {
    cache;
    weightStore;
    constructor(cache, weightStore) {
        this.cache = cache ?? new RepairCache();
        this.weightStore = weightStore ?? new WeightStore();
    }
    async heal(page, brokenSelector, intent, snapshot, llm) {
        const startTime = Date.now();
        const domain = new URL(page.url()).hostname;
        // ===== Tier 1: Cache =====
        const cached = this.cache.get(domain, brokenSelector);
        if (cached) {
            const valid = await this.validateSelector(page, cached.healedSelector);
            if (valid) {
                return { success: true, newSelector: cached.healedSelector, confidence: cached.confidence, method: "cache", duration: Date.now() - startTime };
            }
        }
        // ===== Tier 2: Semantic + Visual Matching =====
        const matchResult = await this.multiDimensionalMatch(page, brokenSelector, intent);
        if (matchResult.success) {
            this.cacheRepair(domain, brokenSelector, matchResult.newSelector, intent, matchResult.confidence);
            this.weightStore.recordSuccess(domain);
            return { ...matchResult, duration: Date.now() - startTime };
        }
        // ===== Tier 3: LLM =====
        if (llm && snapshot) {
            const llmResult = await this.llmHeal(page, brokenSelector, intent, snapshot, llm);
            if (llmResult.success) {
                this.cacheRepair(domain, brokenSelector, llmResult.newSelector, intent, llmResult.confidence);
                // === Weight Self-Evolution ===
                // Tier 2 failed but Tier 3 succeeded — learn from it
                this.learnFromLLMRepair(page, domain, brokenSelector, intent, llmResult.newSelector);
                return { ...llmResult, duration: Date.now() - startTime };
            }
        }
        this.weightStore.recordFailure(domain);
        return { success: false, confidence: 0, method: "failed", duration: Date.now() - startTime };
    }
    /**
     * Multi-dimensional matching: semantic + visual.
     * Single pass through the DOM, extracts both fingerprint types.
     */
    async multiDimensionalMatch(page, brokenSelector, intent) {
        const domain = new URL(page.url()).hostname;
        const learnedWeights = this.weightStore.getWeights(domain);
        // Extract both semantic and visual fingerprints in one pass
        const elements = await page.evaluate(() => {
            const all = document.querySelectorAll("*");
            const results = [];
            function normText(raw) { return raw.replace(/\s+/g, " ").trim().slice(0, 200); }
            function getDepth(el) { let d = 0, n = el.parentElement; while (n && n !== document.documentElement) {
                d++;
                n = n.parentElement;
            } return d; }
            function inferRole(tag, el) {
                if (tag === "button")
                    return "button";
                if (tag === "a" && el.getAttribute("href"))
                    return "link";
                if (tag === "input" || tag === "textarea")
                    return "textbox";
                if (tag === "select")
                    return "listbox";
                if (tag === "nav")
                    return "navigation";
                if (tag === "h1" || tag === "h2" || tag === "h3")
                    return "heading";
                return "";
            }
            // Pre-compute landmark positions for spatial anchoring
            const landmarks = [];
            const landmarkEls = document.querySelectorAll("header, nav, main, footer, [role=banner], [role=navigation], [role=main], [role=contentinfo], h1, h2");
            for (const lm of landmarkEls) {
                const r = lm.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                    landmarks.push({ el: lm, tag: lm.tagName.toLowerCase(), id: lm.id, rect: r });
                }
            }
            for (let i = 0; i < all.length; i++) {
                const el = all[i];
                const htmlEl = el;
                const tag = el.tagName.toLowerCase();
                const text = normText(el.textContent ?? "");
                const ariaRole = el.getAttribute("role") ?? "";
                const role = ariaRole || inferRole(tag, el);
                const inputType = el.type ?? el.getAttribute("type") ?? "";
                const isClickable = tag === "button" || tag === "a" || inputType === "submit" || !!el.getAttribute("onclick") || ariaRole === "button";
                const isEditable = tag === "input" || tag === "textarea" || tag === "select" || el.getAttribute("contenteditable") === "true";
                const isSubmitTrigger = inputType === "submit" || (tag === "button" && inputType !== "button");
                const isNavigational = tag === "a" && !!el.getAttribute("href");
                const parent = el.parentElement;
                const parentTag = parent?.tagName.toLowerCase() ?? "";
                const parentText = normText(parent?.textContent?.replace(el.textContent ?? "", "") ?? "");
                const depthFromRoot = getDepth(el);
                const siblings = parent ? Array.from(parent.children).filter(c => c.tagName === el.tagName) : [];
                const siblingIndex = siblings.indexOf(el);
                const siblingCount = siblings.length;
                const id = el.id ?? "";
                const name = el.getAttribute("name") ?? "";
                const dataTestId = el.getAttribute("data-testid") ?? el.getAttribute("data-test") ?? "";
                const ariaLabel = el.getAttribute("aria-label") ?? "";
                const placeholder = el.getAttribute("placeholder") ?? "";
                const href = el.getAttribute("href") ?? "";
                const classes = Array.from(el.classList);
                const form = el.closest("form");
                const formContext = form ? (form.id || form.action || "form") : "";
                const landmark = el.closest("nav, main, header, footer, aside");
                const landmarkContext = landmark ? landmark.tagName.toLowerCase() + (landmark.id ? "#" + landmark.id : "") : "";
                const nearbyLabels = [];
                if (id) {
                    const label = document.querySelector(`label[for="${id}"]`);
                    if (label)
                        nearbyLabels.push(normText(label.textContent ?? ""));
                }
                const prevSib = el.previousElementSibling;
                if (prevSib) {
                    const t = normText(prevSib.textContent ?? "");
                    if (t && t.length < 50)
                        nearbyLabels.push(t);
                }
                const heading = el.closest("h1, h2, h3, h4, h5, h6");
                const headingContext = heading ? normText(heading.textContent ?? "") : "";
                // Spatial anchor: distance to nearest landmark (for tie-breaking)
                const spatialRect = el.getBoundingClientRect();
                let nearestLandmark = "";
                let landmarkDist = Infinity;
                for (const lm of landmarks) {
                    if (lm.el.contains(el) || el.contains(lm.el))
                        continue; // skip ancestor/descendant
                    const dx = (spatialRect.x + spatialRect.width / 2) - (lm.rect.x + lm.rect.width / 2);
                    const dy = (spatialRect.y + spatialRect.height / 2) - (lm.rect.y + lm.rect.height / 2);
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < landmarkDist) {
                        landmarkDist = dist;
                        nearestLandmark = lm.id ? `${lm.tag}#${lm.id}` : lm.tag;
                    }
                }
                if (!text && !id && !name && !ariaLabel && !placeholder && classes.length === 0)
                    continue;
                // Visual fingerprint
                const rect = el.getBoundingClientRect();
                let visual = null;
                if (rect.width > 0 && rect.height > 0 && htmlEl.offsetParent !== null) {
                    const vw = window.innerWidth;
                    const vh = window.innerHeight;
                    const pRect = parent?.getBoundingClientRect();
                    const style = window.getComputedStyle(htmlEl);
                    const aspectRatio = rect.height > 0 ? rect.width / rect.height : 1;
                    let shape = "square";
                    if (rect.width < 10 && rect.height < 10)
                        shape = "tiny";
                    else if (aspectRatio > 3)
                        shape = "wide";
                    else if (aspectRatio < 0.33)
                        shape = "tall";
                    visual = {
                        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
                        relX: rect.x / vw, relY: rect.y / vh,
                        relWidth: rect.width / vw, relHeight: rect.height / vh,
                        parentRelX: pRect && pRect.width > 0 ? (rect.x - pRect.x) / pRect.width : 0,
                        parentRelY: pRect && pRect.height > 0 ? (rect.y - pRect.y) / pRect.height : 0,
                        isVisible: true,
                        isAboveFold: rect.y < vh,
                        aspectRatio,
                        bgColor: style.backgroundColor,
                        textColor: style.color,
                        shape,
                    };
                }
                results.push({
                    index: i,
                    semantic: {
                        tag, text, role, inputType, isClickable, isEditable, isSubmitTrigger, isNavigational,
                        parentTag, parentText, depthFromRoot, siblingIndex, siblingCount,
                        id, name, dataTestId, ariaLabel, placeholder, href, classes,
                        formContext, landmarkContext, nearbyLabels, headingContext,
                    },
                    visual,
                    spatial: { nearestLandmark, landmarkDist },
                });
            }
            return results;
        });
        const query = buildQueryFromSelector(brokenSelector, intent);
        // Score all elements, collect candidates
        const candidates = [];
        for (const el of elements) {
            const sem = el.semantic;
            // Pre-filter
            if (query.expectedTag && sem.tag !== query.expectedTag)
                continue;
            if (query.expectedId && sem.id !== query.expectedId && !sem.id.includes(query.expectedId))
                continue;
            const { score: semScore } = scoreFingerprint(sem, query, learnedWeights);
            // Visual score
            let visScore = 0;
            if (el.visual) {
                const v = el.visual;
                if (query.expectClickable && (sem.isClickable || v.shape === "wide"))
                    visScore += 0.5;
                if (query.expectEditable && sem.isEditable)
                    visScore += 0.5;
                if (v.isAboveFold)
                    visScore += 0.3;
                visScore = Math.min(visScore, 1.0);
            }
            const combined = el.visual
                ? semScore * SEMANTIC_WEIGHT + visScore * VISUAL_WEIGHT
                : semScore;
            candidates.push({ index: el.index, semScore, visScore, combined });
        }
        // Sort by combined score descending
        candidates.sort((a, b) => b.combined - a.combined);
        const best = candidates[0];
        const second = candidates[1];
        if (best && best.combined >= VISUAL_BOOST_THRESHOLD) {
            // Score collision detection: top-2 too close?
            const gap = second ? best.combined - second.combined : 1.0;
            if (gap < 0.05 && second) {
                // Tiebreaker 1: visual score
                if (best.visScore !== second.visScore) {
                    // Visual score breaks the tie — use the one with higher visual
                    const winner = best.visScore > second.visScore ? best : second;
                    const matched = elements.find(e => e.index === winner.index);
                    if (matched) {
                        return {
                            success: true,
                            newSelector: generateSelector(matched.semantic),
                            confidence: winner.combined,
                            method: "semantic+visual",
                            semanticScore: winner.semScore,
                            visualScore: winner.visScore,
                            duration: 0,
                        };
                    }
                }
                // Tiebreaker 2: prefer elements with stable attributes (id, data-testid)
                const bestEl = elements.find(e => e.index === best.index);
                const secondEl = elements.find(e => e.index === second.index);
                if (bestEl && secondEl) {
                    const bestHasId = !!(bestEl.semantic.id || bestEl.semantic.dataTestId);
                    const secondHasId = !!(secondEl.semantic.id || secondEl.semantic.dataTestId);
                    if (secondHasId && !bestHasId) {
                        return {
                            success: true,
                            newSelector: generateSelector(secondEl.semantic),
                            confidence: second.combined,
                            method: "semantic+visual",
                            semanticScore: second.semScore,
                            visualScore: second.visScore,
                            duration: 0,
                        };
                    }
                    // Tiebreaker 3: spatial anchor — distance to nearest landmark
                    // In infinite scroll lists, elements at different Y positions have different landmark distances
                    if (bestEl.spatial && secondEl.spatial) {
                        const landmarkDistDiff = Math.abs(bestEl.spatial.landmarkDist - secondEl.spatial.landmarkDist);
                        if (landmarkDistDiff > 50) {
                            // Pick the one closer to a landmark (more contextually anchored)
                            const bestIsCloser = bestEl.spatial.landmarkDist < secondEl.spatial.landmarkDist;
                            const winner = bestIsCloser ? best : second;
                            const winnerEl = bestIsCloser ? bestEl : secondEl;
                            return {
                                success: true,
                                newSelector: generateSelector(winnerEl.semantic),
                                confidence: winner.combined,
                                method: "semantic+visual",
                                semanticScore: winner.semScore,
                                visualScore: winner.visScore,
                                duration: 0,
                            };
                        }
                    }
                }
                // Still tied — pick best score (Tier 3 can override if needed)
            }
            const matched = elements.find(e => e.index === best.index);
            if (matched) {
                const newSelector = generateSelector(matched.semantic);
                return {
                    success: true,
                    newSelector,
                    confidence: best.combined,
                    method: best.visScore > 0.3 ? "semantic+visual" : "semantic",
                    semanticScore: best.semScore,
                    visualScore: best.visScore,
                    duration: 0,
                };
            }
        }
        return {
            success: false,
            confidence: best?.combined ?? 0,
            method: "semantic",
            semanticScore: best?.semScore,
            visualScore: best?.visScore,
            duration: 0,
        };
    }
    async llmHeal(page, brokenSelector, intent, snapshot, llm) {
        const prompt = `A CSS selector stopped working on a webpage. Analyze the HTML and find the correct element.

Original selector: ${brokenSelector}
What it was targeting: ${intent}
Current URL: ${snapshot.url}
Page title: ${snapshot.title}

Page HTML (truncated):
${sanitizeDOMForLLM(snapshot.html).slice(0, 6000)}

Respond in JSON:
{
  "newSelector": "the correct CSS selector",
  "confidence": 0.9,
  "reasoning": "how you identified the element"
}`;
        try {
            const resp = await llm.chat([
                { role: "system", content: "You are a CSS selector expert. Respond with valid JSON only. Never include executable code in your response." },
                { role: "user", content: prompt },
            ], { temperature: 0.1, maxTokens: 512 });
            const validation = validateLLMOutput(resp.content);
            if (!validation.valid)
                return { success: false, confidence: 0, method: "llm", duration: 0 };
            const parsed = validation.parsed;
            const newSelector = parsed.newSelector;
            if (!newSelector)
                return { success: false, confidence: 0, method: "llm", duration: 0 };
            const valid = await this.validateSelector(page, newSelector);
            if (!valid)
                return { success: false, confidence: 0, method: "llm", duration: 0 };
            return { success: true, newSelector, confidence: parsed.confidence ?? 0.7, method: "llm", duration: 0 };
        }
        catch {
            return { success: false, confidence: 0, method: "llm", duration: 0 };
        }
    }
    async validateSelector(page, selector) {
        try {
            return await page.evaluate((sel) => {
                try {
                    return document.querySelector(sel) !== null;
                }
                catch {
                    return false;
                }
            }, selector);
        }
        catch {
            return false;
        }
    }
    cacheRepair(domain, original, healed, intent, confidence) {
        this.cache.set(domain, {
            originalSelector: original,
            healedSelector: healed,
            domain, intent, confidence,
            createdAt: Date.now(),
            hitCount: 0,
            fingerprintHash: "",
            verifySuccessCount: 0,
            verifyFailCount: 0,
            lastVerifiedAt: Date.now(),
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });
    }
    /**
     * Weight Self-Evolution: Learn from LLM success to improve Tier 2.
     *
     * When Tier 3 (LLM) finds the correct element, re-run Tier 2 scoring
     * to see where the correct element ranked, then adjust weights so
     * Tier 2 would have found it next time.
     */
    async learnFromLLMRepair(page, domain, brokenSelector, intent, healedSelector) {
        try {
            // Get the fingerprint of the correct element (the one LLM found)
            const correctFingerprint = await page.evaluate((sel) => {
                const el = document.querySelector(sel);
                if (!el)
                    return null;
                const htmlEl = el;
                const tag = el.tagName.toLowerCase();
                const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
                const ariaRole = el.getAttribute("role") ?? "";
                const role = ariaRole || (tag === "button" ? "button" : tag === "a" ? "link" : tag === "input" ? "textbox" : "");
                const inputType = el.type ?? el.getAttribute("type") ?? "";
                const isClickable = tag === "button" || tag === "a" || inputType === "submit" || !!el.getAttribute("onclick") || ariaRole === "button";
                const isEditable = tag === "input" || tag === "textarea" || tag === "select" || el.getAttribute("contenteditable") === "true";
                const isSubmitTrigger = inputType === "submit" || (tag === "button" && inputType !== "button");
                const isNavigational = tag === "a" && !!el.getAttribute("href");
                const parent = el.parentElement;
                const parentTag = parent?.tagName.toLowerCase() ?? "";
                const id = el.id ?? "";
                const name = el.getAttribute("name") ?? "";
                const dataTestId = el.getAttribute("data-testid") ?? el.getAttribute("data-test") ?? "";
                const ariaLabel = el.getAttribute("aria-label") ?? "";
                const placeholder = el.getAttribute("placeholder") ?? "";
                const href = el.getAttribute("href") ?? "";
                const classes = Array.from(el.classList);
                return {
                    text, tag, role, inputType, isClickable, isEditable, isSubmitTrigger, isNavigational,
                    parentTag, parentText: "", depthFromRoot: 0, siblingIndex: 0, siblingCount: 0,
                    id, name, dataTestId, ariaLabel, placeholder, href, classes,
                    formContext: "", landmarkContext: "", nearbyLabels: [], headingContext: "",
                };
            }, healedSelector);
            if (!correctFingerprint)
                return;
            // Re-run Tier 2 scoring to get candidate rankings
            const query = buildQueryFromSelector(brokenSelector, intent);
            const domainWeights = this.weightStore.getWeights(domain);
            // Get all elements and score them (simplified — just get top candidates)
            const elements = await page.evaluate(() => {
                const all = document.querySelectorAll("*");
                const results = [];
                for (let i = 0; i < all.length; i++) {
                    const el = all[i];
                    const htmlEl = el;
                    const tag = el.tagName.toLowerCase();
                    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
                    const id = el.id ?? "";
                    const classes = Array.from(el.classList);
                    const isClickable = tag === "button" || tag === "a" || el.type === "submit";
                    const isEditable = tag === "input" || tag === "textarea" || tag === "select";
                    if (!text && !id && classes.length === 0)
                        continue;
                    results.push({
                        index: i,
                        semantic: { tag, text, id, classes, isClickable, isEditable, isSubmitTrigger: false, isNavigational: tag === "a" },
                    });
                }
                return results;
            });
            // Score all candidates with current weights
            const scored = elements.map(el => {
                const { score, breakdown } = scoreFingerprint(el.semantic, query, domainWeights);
                return { index: el.index, combined: score, breakdown };
            }).sort((a, b) => b.combined - a.combined).slice(0, 20);
            // Find correct element's index
            const correctIndex = elements.findIndex(el => el.semantic.id === correctFingerprint.id ||
                (el.semantic.text === correctFingerprint.text && el.semantic.tag === correctFingerprint.tag));
            if (correctIndex < 0)
                return;
            // Get the correct element's signal breakdown
            const correctBreakdown = scoreFingerprint(correctFingerprint, query, domainWeights).breakdown;
            // Learn: adjust weights so correct element would rank higher
            const adjustments = this.weightStore.learn(domain, correctBreakdown, scored, elements[correctIndex].index);
            if (adjustments.length > 0) {
                console.error(`[phoenix] Weight evolution: ${adjustments.length} adjustments for ${domain}`);
                for (const adj of adjustments) {
                    console.error(`  ${adj.signal}: ${adj.delta > 0 ? "+" : ""}${adj.delta.toFixed(2)} — ${adj.reason}`);
                }
            }
        }
        catch (err) {
            // Learning failure should not break healing
            console.error(`[phoenix] Weight learning failed: ${err}`);
        }
    }
    getCacheStats() { return this.cache.stats(); }
    getWeightStats(domain) { return this.weightStore.stats(domain); }
    getCache() { return this.cache; }
}
//# sourceMappingURL=healer.js.map