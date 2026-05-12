/**
 * Semantic Matcher — Deterministic Element Matching
 *
 * Given a "semantic query" (what we're looking for), scores every element
 * in the DOM against it and returns the best match.
 *
 * This is the core innovation: NO LLM involved, pure structural analysis.
 * The scoring uses weighted multi-signal comparison:
 *
 *   score = Σ(weight_i × signal_i)
 *
 * Signals:
 *   - Text similarity (exact > substring > word overlap)
 *   - Role match (tag, ARIA role, input type)
 *   - Behavioral match (clickable, editable, submit)
 *   - Attribute match (id, name, data-testid, aria-label)
 *   - Structural similarity (parent, depth, position)
 *   - Contextual similarity (form, landmark, heading)
 */
import { SemanticFingerprint } from "./fingerprint.js";
/**
 * A SemanticQuery describes WHAT we're looking for, not WHERE.
 * Built from the original selector's context + intent.
 */
export interface SemanticQuery {
    expectedTag?: string;
    expectedId?: string;
    expectedClasses?: string[];
    intentText?: string;
    originalFingerprint?: SemanticFingerprint;
    expectClickable?: boolean;
    expectEditable?: boolean;
    expectSubmit?: boolean;
}
export interface MatchResult {
    index: number;
    score: number;
    fingerprint: SemanticFingerprint;
    selector: string;
    breakdown: Record<string, number>;
}
/**
 * Build a SemanticQuery from a broken CSS selector.
 * Parses the selector to extract what we can infer about the target.
 */
export declare function buildQueryFromSelector(selector: string, intent?: string): SemanticQuery;
/**
 * Score a single element's fingerprint against a semantic query.
 * Returns a score between 0 and 1.
 */
export declare function scoreFingerprint(fp: SemanticFingerprint, query: SemanticQuery, weights?: Partial<typeof DEFAULT_WEIGHTS>): {
    score: number;
    breakdown: Record<string, number>;
};
declare const DEFAULT_WEIGHTS: {
    text: number;
    tag: number;
    id: number;
    classes: number;
    behavior: number;
    editable: number;
    submit: number;
    attributes: number;
    structure: number;
    context: number;
    href: number;
    placeholder: number;
};
/**
 * Generate a CSS selector for a matched element.
 * Uses the most stable attributes available.
 */
export declare function generateSelector(fp: SemanticFingerprint): string;
export {};
