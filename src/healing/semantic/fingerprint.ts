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
  // === Identity signals ===
  text: string;                    // Normalized text content
  tag: string;                     // HTML tag name
  role: string;                    // ARIA role or inferred role
  inputType: string;               // input type attribute

  // === Behavioral signals ===
  isClickable: boolean;            // button, a, [onclick], [role=button]
  isEditable: boolean;             // input, textarea, [contenteditable]
  isSubmitTrigger: boolean;        // type=submit, form submit button
  isNavigational: boolean;         // a[href], nav links

  // === Structural context ===
  parentTag: string;               // Direct parent tag
  parentText: string;              // Parent's text (for context)
  depthFromRoot: number;           // Nesting depth
  siblingIndex: number;            // Position among siblings
  siblingCount: number;            // Total siblings of same type

  // === Attribute signals ===
  id: string;                      // Element ID
  name: string;                    // name attribute
  dataTestId: string;              // data-testid or data-test
  ariaLabel: string;               // aria-label
  placeholder: string;             // placeholder text
  href: string;                    // href for links
  classes: string[];               // CSS classes (for fuzzy matching)

  // === Contextual signals ===
  formContext: string;             // Enclosing form's action/id
  landmarkContext: string;         // Enclosing landmark (nav, main, header, footer)
  nearbyLabels: string[];          // Text of nearby label/span elements
  headingContext: string;          // Nearest heading ancestor text
}

/**
 * Extract a semantic fingerprint from a DOM element.
 * Runs inside page.evaluate() — pure browser-side computation.
 */
export function extractFingerprint(el: Element): SemanticFingerprint {
  const htmlEl = el as HTMLElement;
  const tag = el.tagName.toLowerCase();

  // Role inference
  const ariaRole = el.getAttribute("role") ?? "";
  const inferredRole = ariaRole || inferRole(tag, el);

  // Text content (normalized, truncated)
  const text = normalizeText(el.textContent ?? "");

  // Input type
  const inputType = (el as HTMLInputElement).type ?? el.getAttribute("type") ?? "";

  // Behavioral signals
  const isClickable = tag === "button" || tag === "a" || tag === "input" && inputType === "submit"
    || !!el.getAttribute("onclick") || ariaRole === "button" || ariaRole === "link"
    || htmlEl.style?.cursor === "pointer";
  const isEditable = tag === "input" || tag === "textarea" || tag === "select"
    || el.getAttribute("contenteditable") === "true" || ariaRole === "textbox";
  const isSubmitTrigger = inputType === "submit" || (tag === "button" && inputType !== "button")
    || !!(el.closest("form") && tag === "button" && !inputType);
  const isNavigational = tag === "a" && !!el.getAttribute("href");

  // Structural context
  const parent = el.parentElement;
  const parentTag = parent?.tagName.toLowerCase() ?? "";
  const parentText = normalizeText(parent?.textContent?.replace(el.textContent ?? "", "") ?? "");
  const depthFromRoot = getDepth(el);
  const siblings = parent ? Array.from(parent.children).filter(c => c.tagName === el.tagName) : [];
  const siblingIndex = siblings.indexOf(el);
  const siblingCount = siblings.length;

  // Attributes
  const id = el.id ?? "";
  const name = el.getAttribute("name") ?? "";
  const dataTestId = el.getAttribute("data-testid") ?? el.getAttribute("data-test") ?? el.getAttribute("data-cy") ?? "";
  const ariaLabel = el.getAttribute("aria-label") ?? "";
  const placeholder = el.getAttribute("placeholder") ?? "";
  const href = el.getAttribute("href") ?? "";
  const classes = Array.from(el.classList);

  // Contextual signals
  const form = el.closest("form");
  const formContext = form ? (form.id || form.action || "form") : "";

  const landmark = el.closest("nav, main, header, footer, aside, [role=navigation], [role=main], [role=banner], [role=contentinfo]");
  const landmarkContext = landmark ? landmark.tagName.toLowerCase() + (landmark.id ? `#${landmark.id}` : "") : "";

  // Nearby labels: find label[for], preceding text nodes, sibling text
  const nearbyLabels: string[] = [];
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) nearbyLabels.push(normalizeText(label.textContent ?? ""));
  }
  // Previous sibling text
  const prevSib = el.previousElementSibling;
  if (prevSib) {
    const t = normalizeText(prevSib.textContent ?? "");
    if (t && t.length < 50) nearbyLabels.push(t);
  }

  // Heading context: nearest heading ancestor
  const heading = el.closest("h1, h2, h3, h4, h5, h6") ?? el.querySelector("h1, h2, h3, h4, h5, h6");
  const headingContext = heading ? normalizeText(heading.textContent ?? "") : "";

  return {
    text, tag, role: inferredRole, inputType,
    isClickable, isEditable, isSubmitTrigger, isNavigational,
    parentTag, parentText, depthFromRoot, siblingIndex, siblingCount,
    id, name, dataTestId, ariaLabel, placeholder, href, classes,
    formContext, landmarkContext, nearbyLabels, headingContext,
  };
}

/**
 * Infer role from tag and attributes when no explicit role is set.
 */
function inferRole(tag: string, el: Element): string {
  if (tag === "button" || (tag === "input" && (el as HTMLInputElement).type === "button")) return "button";
  if (tag === "a" && el.getAttribute("href")) return "link";
  if (tag === "input") return "textbox";
  if (tag === "textarea") return "textbox";
  if (tag === "select") return "listbox";
  if (tag === "img") return "img";
  if (tag === "nav") return "navigation";
  if (tag === "main") return "main";
  if (tag === "header") return "banner";
  if (tag === "footer") return "contentinfo";
  if (tag === "h1" || tag === "h2" || tag === "h3") return "heading";
  if (tag === "table") return "table";
  if (tag === "ul" || tag === "ol") return "list";
  if (tag === "li") return "listitem";
  return "";
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 200);
}

function getDepth(el: Element): number {
  let depth = 0;
  let node = el.parentElement;
  while (node && node !== document.documentElement) {
    depth++;
    node = node.parentElement;
  }
  return depth;
}

/**
 * Check if an element is visually hidden via CSS.
 * Catches: display:none, visibility:hidden, opacity:0, transform:scale(0),
 * clip-path inset, zero-size with overflow hidden.
 */
function isVisuallyHidden(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none") return true;
  if (style.visibility === "hidden") return true;
  if (parseFloat(style.opacity) === 0) return true;

  // transform: scale(0) / scaleX(0) / scaleY(0)
  const tf = style.transform;
  if (tf && tf !== "none") {
    const m = tf.match(/matrix\(([^)]+)\)/);
    if (m) {
      const vals = m[1].split(",").map(v => parseFloat(v.trim()));
      // matrix(a,b,c,d,tx,ty) — a=scaleX, d=scaleY
      if (vals.length >= 4 && (Math.abs(vals[0]) < 0.001 || Math.abs(vals[3]) < 0.001)) return true;
    }
  }

  // clip-path: inset(100%) or similar fully-clipped
  const clip = style.clipPath;
  if (clip && clip.startsWith("inset(")) {
    const inner = clip.slice(6, -1).trim();
    if (/^(100%|0px)\s+(100%|0px)\s+(100%|0px)\s+(100%|0px)/.test(inner)) return true;
  }

  return false;
}

/**
 * Extract fingerprints from ALL elements in the page.
 * Returns a map of element index → fingerprint.
 */
export function extractAllFingerprints(): Array<{ index: number; fingerprint: SemanticFingerprint }> {
  const all = document.querySelectorAll("*");
  const results: Array<{ index: number; fingerprint: SemanticFingerprint }> = [];
  for (let i = 0; i < all.length; i++) {
    // Skip CSS-hidden elements (opacity:0, transform:scale(0), etc.)
    if (isVisuallyHidden(all[i])) continue;
    const fp = extractFingerprint(all[i]);
    // Skip empty/invisible elements
    if (!fp.text && !fp.id && !fp.name && !fp.ariaLabel && !fp.placeholder && fp.classes.length === 0) continue;
    results.push({ index: i, fingerprint: fp });
  }
  return results;
}
