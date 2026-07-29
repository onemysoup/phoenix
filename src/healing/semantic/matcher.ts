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
  // From the original selector (parsed heuristics)
  expectedTag?: string;
  expectedId?: string;
  expectedClasses?: string[];

  // From intent description (if provided)
  intentText?: string;        // "the submit button", "search input"

  // From the original element's fingerprint (if we captured it before)
  originalFingerprint?: SemanticFingerprint;

  // Behavioral expectations
  expectClickable?: boolean;
  expectEditable?: boolean;
  expectSubmit?: boolean;
}

export interface MatchResult {
  index: number;
  score: number;
  fingerprint: SemanticFingerprint;
  selector: string;          // Generated CSS selector for the matched element
  breakdown: Record<string, number>;  // Score breakdown per signal
}

/**
 * Build a SemanticQuery from a broken CSS selector.
 * Parses the selector to extract what we can infer about the target.
 */
export function buildQueryFromSelector(selector: string, intent?: string): SemanticQuery {
  const query: SemanticQuery = {};

  // Parse ID selector: #my-id
  const idMatch = selector.match(/^#([\w-]+)$/);
  if (idMatch) query.expectedId = idMatch[1];

  // Parse class selector: .my-class
  const classMatch = selector.match(/^\.([\w-]+)$/);
  if (classMatch) query.expectedClasses = [classMatch[1]];

  // Parse tag selector: button, input, a
  const tagMatch = selector.match(/^(button|input|a|select|textarea|div|span|form)$/i);
  if (tagMatch) query.expectedTag = tagMatch[1].toLowerCase();

  // Parse compound: tag.class, tag#id, tag[attr=val]
  const compoundMatch = selector.match(/^(\w+)(?:\.([\w-]+))?(?:#([\w-]+))?/);
  if (compoundMatch) {
    if (compoundMatch[1] && !query.expectedTag) query.expectedTag = compoundMatch[1].toLowerCase();
    if (compoundMatch[2] && !query.expectedClasses) query.expectedClasses = [compoundMatch[2]];
    if (compoundMatch[3] && !query.expectedId) query.expectedId = compoundMatch[3];
  }

  // Infer behavior from selector patterns
  if (/button|btn|submit|click/i.test(selector)) query.expectClickable = true;
  if (/input|text|search|email|password/i.test(selector)) query.expectEditable = true;
  if (/submit/i.test(selector)) query.expectSubmit = true;

  // Use intent text
  if (intent) query.intentText = intent;

  return query;
}

/**
 * Score a single element's fingerprint against a semantic query.
 * Returns a score between 0 and 1.
 */
export function scoreFingerprint(
  fp: SemanticFingerprint,
  query: SemanticQuery,
  weights?: Partial<typeof DEFAULT_WEIGHTS>
): { score: number; breakdown: Record<string, number> } {
  // Use dynamic weights based on element type, override with explicit weights
  const dynamic = getDynamicWeights(fp, query);
  const w = { ...dynamic, ...weights };
  const breakdown: Record<string, number> = {};
  let totalWeight = 0;
  let totalScore = 0;

  // === Signal 1: Text match ===
  if (query.intentText) {
    const textSim = textSimilarity(fp.text, query.intentText);
    breakdown.text = textSim * w.text;
    totalScore += breakdown.text;
    totalWeight += w.text;
  }

  // === Signal 2: Role match ===
  if (query.expectedTag) {
    const tagMatch = fp.tag === query.expectedTag ? 1 : 0;
    breakdown.tag = tagMatch * w.tag;
    totalScore += breakdown.tag;
    totalWeight += w.tag;
  }

  // === Signal 3: ID match ===
  if (query.expectedId) {
    const idMatch = fp.id === query.expectedId ? 1 : (fp.id.includes(query.expectedId) || query.expectedId.includes(fp.id) ? 0.5 : 0);
    breakdown.id = idMatch * w.id;
    totalScore += breakdown.id;
    totalWeight += w.id;
  }

  // === Signal 4: Class match ===
  if (query.expectedClasses?.length) {
    const classSim = jaccardSimilarity(new Set(query.expectedClasses), new Set(fp.classes));
    breakdown.classes = classSim * w.classes;
    totalScore += breakdown.classes;
    totalWeight += w.classes;
  }

  // === Signal 5: Behavioral match ===
  if (query.expectClickable) {
    const behMatch = fp.isClickable ? 1 : 0;
    breakdown.behavior = behMatch * w.behavior;
    totalScore += breakdown.behavior;
    totalWeight += w.behavior;
  }
  if (query.expectEditable) {
    const editMatch = fp.isEditable ? 1 : 0;
    breakdown.editable = editMatch * w.editable;
    totalScore += breakdown.editable;
    totalWeight += w.editable;
  }
  if (query.expectSubmit) {
    const submitMatch = fp.isSubmitTrigger ? 1 : 0;
    breakdown.submit = submitMatch * w.submit;
    totalScore += breakdown.submit;
    totalWeight += w.submit;
  }

  // === Signal 5b: Placeholder match (for inputs) ===
  if (fp.placeholder && query.intentText) {
    const placeholderSim = textSimilarity(fp.placeholder, query.intentText);
    if (placeholderSim > 0) {
      breakdown.placeholder = placeholderSim * w.placeholder;
      totalScore += breakdown.placeholder;
      totalWeight += w.placeholder;
    }
  } else if (fp.placeholder && query.expectEditable) {
    // Has placeholder and we're looking for an input — small boost
    breakdown.placeholder = 0.3 * w.placeholder;
    totalScore += breakdown.placeholder;
    totalWeight += w.placeholder;
  }

  // === Signal 5c: Href match (for links) ===
  if (fp.href && fp.isNavigational && query.intentText) {
    // If intent mentions the href target, boost score
    const hrefSim = textSimilarity(fp.href, query.intentText);
    if (hrefSim > 0) {
      breakdown.href = hrefSim * w.href;
      totalScore += breakdown.href;
      totalWeight += w.href;
    }
  }

  // === Signal 6: Attribute match (name, data-testid, aria-label) ===
  if (query.originalFingerprint) {
    const orig = query.originalFingerprint;
    let attrScore = 0;
    let attrCount = 0;

    if (orig.name) { attrScore += fp.name === orig.name ? 1 : 0; attrCount++; }
    if (orig.dataTestId) { attrScore += fp.dataTestId === orig.dataTestId ? 1 : 0; attrCount++; }
    if (orig.ariaLabel) { attrScore += fp.ariaLabel === orig.ariaLabel ? 1 : 0; attrCount++; }
    if (orig.placeholder) { attrScore += fp.placeholder === orig.placeholder ? 1 : 0; attrCount++; }

    if (attrCount > 0) {
      breakdown.attributes = (attrScore / attrCount) * w.attributes;
      totalScore += breakdown.attributes;
      totalWeight += w.attributes;
    }

    // === Signal 7: Structural similarity ===
    const structSim = structuralSimilarity(fp, orig);
    breakdown.structure = structSim * w.structure;
    totalScore += breakdown.structure;
    totalWeight += w.structure;

    // === Signal 8: Context similarity ===
    const ctxSim = contextSimilarity(fp, orig);
    breakdown.context = ctxSim * w.context;
    totalScore += breakdown.context;
    totalWeight += w.context;
  }

  const score = totalWeight > 0 ? totalScore / totalWeight : 0;
  return { score, breakdown };
}

const DEFAULT_WEIGHTS = {
  text: 3.0,        // Text match is the strongest signal
  tag: 1.5,         // Tag match is important
  id: 4.0,          // ID match is very strong (if available)
  classes: 1.0,     // Classes change frequently, lower weight
  behavior: 2.0,    // Behavioral match is strong
  editable: 2.0,
  submit: 2.5,
  attributes: 3.0,  // data-testid, aria-label are stable
  structure: 1.0,   // Structure helps but changes often
  context: 1.5,     // Context (form, landmark) is moderately stable
  href: 2.0,        // href for navigational elements
  placeholder: 2.5, // placeholder for input elements
};

/**
 * Dynamic weight adjustment based on element type.
 * Different elements have different "identity signals":
 *   - Button: text is the primary identifier
 *   - Input: placeholder, aria-label, name are more stable than text
 *   - Link: href + text are both strong
 *   - Submit: form context + text
 */
function getDynamicWeights(fp: SemanticFingerprint, query: SemanticQuery): typeof DEFAULT_WEIGHTS {
  const w = { ...DEFAULT_WEIGHTS };

  // Editable elements (input, textarea, select)
  if (fp.isEditable || query.expectEditable) {
    w.text = 1.5;          // Input text changes frequently, not reliable
    w.placeholder = 4.5;   // Placeholder is very stable for inputs
    w.attributes = 4.0;    // aria-label, name are key identifiers
    w.editable = 3.0;      // Behavioral signal is strong
    w.tag = 2.0;           // Tag (input vs textarea) matters
  }

  // Clickable elements (button, a, [role=button])
  if (fp.isClickable || query.expectClickable) {
    w.text = 4.5;          // Button text is the primary identifier
    w.behavior = 3.0;      // "Is clickable" is a strong signal
    w.tag = 2.0;           // button vs a vs div[role=button]
  }

  // Navigational elements (a[href])
  if (fp.isNavigational) {
    w.href = 3.5;          // href is very stable for links
    w.text = 4.0;          // Link text is important
    w.behavior = 2.5;
  }

  // Submit triggers
  if (fp.isSubmitTrigger || query.expectSubmit) {
    w.submit = 4.0;        // Submit behavior is key
    w.text = 3.5;          // "Submit" / "登录" text
    w.context = 2.5;       // Form context matters
  }

  return w;
}

/**
 * Generate a CSS selector for a matched element.
 * Uses the most stable attributes available.
 */
export function generateSelector(fp: SemanticFingerprint): string {
  // Prefer: data-testid > id > aria-label + tag > text + tag > tag.class
  if (fp.dataTestId) return `[data-testid="${fp.dataTestId}"]`;
  if (fp.id) return `#${cssEscape(fp.id)}`;
  if (fp.ariaLabel) return `${fp.tag}[aria-label="${fp.ariaLabel}"]`;
  if (fp.name) return `${fp.tag}[name="${fp.name}"]`;
  if (fp.text && fp.text.length < 30) {
    return `${fp.tag}:has-text("${fp.text.replace(/"/g, '\\"')}")`;
  }
  if (fp.classes.length > 0) return `${fp.tag}.${cssEscape(fp.classes[0])}`;
  return fp.tag;
}

/**
 * CSS escape that works in both browser and Node.js contexts.
 */
function cssEscape(ident: string): string {
  return ident.replace(/([^\w-])/g, "\\$1");
}

// ========== Similarity functions ==========

function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const na = a.toLowerCase();
  const nb = b.toLowerCase();

  // Exact match
  if (na === nb) return 1;

  // Substring match
  if (na.includes(nb) || nb.includes(na)) return 0.8;

  // Word overlap (Jaccard on words)
  const wordsA = new Set(na.split(/\s+/).filter(w => w.length > 1));
  const wordsB = new Set(nb.split(/\s+/).filter(w => w.length > 1));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  return jaccardSimilarity(wordsA, wordsB) * 0.6;
}

function jaccardSimilarity<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function structuralSimilarity(a: SemanticFingerprint, b: SemanticFingerprint): number {
  let score = 0;
  let count = 0;

  // Same parent tag
  if (a.parentTag && b.parentTag) {
    score += a.parentTag === b.parentTag ? 1 : 0;
    count++;
  }

  // Similar depth
  const depthDiff = Math.abs(a.depthFromRoot - b.depthFromRoot);
  score += Math.max(0, 1 - depthDiff * 0.2);
  count++;

  // Same form context
  if (a.formContext && b.formContext) {
    score += a.formContext === b.formContext ? 1 : 0;
    count++;
  }

  // Same landmark
  if (a.landmarkContext && b.landmarkContext) {
    score += a.landmarkContext === b.landmarkContext ? 1 : 0;
    count++;
  }

  return count > 0 ? score / count : 0;
}

function contextSimilarity(a: SemanticFingerprint, b: SemanticFingerprint): number {
  let score = 0;
  let count = 0;

  // Heading context match
  if (a.headingContext && b.headingContext) {
    score += textSimilarity(a.headingContext, b.headingContext);
    count++;
  }

  // Nearby labels overlap
  if (a.nearbyLabels.length > 0 && b.nearbyLabels.length > 0) {
    const setA = new Set(a.nearbyLabels.map(l => l.toLowerCase()));
    const setB = new Set(b.nearbyLabels.map(l => l.toLowerCase()));
    score += jaccardSimilarity(setA, setB);
    count++;
  }

  // Parent text similarity
  if (a.parentText && b.parentText) {
    score += textSimilarity(a.parentText, b.parentText) * 0.5;
    count++;
  }

  return count > 0 ? score / count : 0;
}
