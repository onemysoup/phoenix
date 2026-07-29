/**
 * Semantic Fingerprint
 *
 * Captures an element's semantic identity — WHAT it is and WHAT it does,
 * not HOW to find it (that's what CSS selectors do).
 *
 * A fingerprint is a structured representation that survives page redesigns:
 *   - Text content (what the element says)
 *   - Role (what the element does — button, link, input, etc.)
 *   - Structural context (where it is — parent, siblings, form context)
 *   - Behavioral signals (clickable, editable, submit trigger)
 *
 * Key insight: CSS selectors are SYNTACTIC (describe structure),
 * fingerprints are SEMANTIC (describe meaning). The same fingerprint
 * matches elements across different page versions.
 */
export interface SemanticFingerprint {
    text: string;
    tag: string;
    role: string;
    inputType: string;
    isClickable: boolean;
    isEditable: boolean;
    isSubmitTrigger: boolean;
    isNavigational: boolean;
    parentTag: string;
    parentText: string;
    depthFromRoot: number;
    siblingIndex: number;
    siblingCount: number;
    id: string;
    name: string;
    dataTestId: string;
    ariaLabel: string;
    placeholder: string;
    href: string;
    classes: string[];
    formContext: string;
    landmarkContext: string;
    nearbyLabels: string[];
    headingContext: string;
}
/**
 * Extract a semantic fingerprint from a DOM element.
 * Runs inside page.evaluate() — pure browser-side computation.
 */
export declare function extractFingerprint(el: Element): SemanticFingerprint;
/**
 * Extract fingerprints from ALL elements in the page.
 * Returns a map of element index → fingerprint.
 */
export declare function extractAllFingerprints(): Array<{
    index: number;
    fingerprint: SemanticFingerprint;
}>;
