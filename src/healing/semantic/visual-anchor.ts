/**
 * Visual Anchor — Multi-dimensional Fingerprint
 *
 * DOM 结构会变（class 重命名、标签重构），但视觉特征往往稳定：
 *   - 按钮在页面中的相对位置不变
 *   - 颜色/大小比例不变
 *   - 在表单中的空间布局不变
 *
 * Visual Anchor 从截图中提取元素的视觉特征，作为语义指纹的补充维度。
 * 当 DOM 匹配置信度不高时，视觉特征可以打破平局。
 *
 * 核心思路：
 *   1. 成功操作时，记录元素的视觉快照（bounding box + 相对位置 + 颜色）
 *   2. 选择器失败时，用视觉特征在候选元素中做二次筛选
 *   3. 语义分数 × 0.7 + 视觉分数 × 0.3 = 最终分数
 */

export interface VisualFingerprint {
  // Bounding box (viewport-relative)
  x: number;
  y: number;
  width: number;
  height: number;

  // Relative position (normalized 0-1)
  relX: number;          // x / viewportWidth
  relY: number;          // y / viewportHeight
  relWidth: number;      // width / viewportWidth
  relHeight: number;     // height / viewportHeight

  // Position within parent (for layout stability)
  parentRelX: number;    // relative position within parent element
  parentRelY: number;

  // Visual characteristics
  isVisible: boolean;
  isAboveFold: boolean;  // y < viewportHeight
  aspectRatio: number;   // width / height

  // Color (computed from computedStyle)
  bgColor: string;       // background-color
  textColor: string;     // color
  borderColor: string;   // border-color

  // Shape category
  shape: "square" | "wide" | "tall" | "tiny";
}

/**
 * Extract visual fingerprint from a DOM element.
 * Runs inside page.evaluate().
 */
export function extractVisualFingerprint(el: Element): VisualFingerprint | null {
  const htmlEl = el as HTMLElement;
  const rect = el.getBoundingClientRect();

  // Skip invisible elements
  if (rect.width === 0 && rect.height === 0) return null;
  const style = window.getComputedStyle(htmlEl);
  if (style.display === "none" || style.visibility === "hidden") return null;
  if (parseFloat(style.opacity) === 0) return null;

  // transform: scale(0) / scaleX(0) / scaleY(0)
  const tf = style.transform;
  if (tf && tf !== "none") {
    const m = tf.match(/matrix\(([^)]+)\)/);
    if (m) {
      const vals = m[1].split(",").map(v => parseFloat(v.trim()));
      if (vals.length >= 4 && (Math.abs(vals[0]) < 0.001 || Math.abs(vals[3]) < 0.001)) return null;
    }
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Parent-relative position
  const parent = el.parentElement;
  const parentRect = parent?.getBoundingClientRect();
  const parentRelX = parentRect && parentRect.width > 0 ? (rect.x - parentRect.x) / parentRect.width : 0;
  const parentRelY = parentRect && parentRect.height > 0 ? (rect.y - parentRect.y) / parentRect.height : 0;

  // Aspect ratio and shape
  const aspectRatio = rect.height > 0 ? rect.width / rect.height : 1;
  let shape: VisualFingerprint["shape"] = "square";
  if (rect.width < 10 && rect.height < 10) shape = "tiny";
  else if (aspectRatio > 3) shape = "wide";
  else if (aspectRatio < 0.33) shape = "tall";

  return {
    x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    relX: rect.x / vw, relY: rect.y / vh,
    relWidth: rect.width / vw, relHeight: rect.height / vh,
    parentRelX, parentRelY,
    isVisible: htmlEl.offsetParent !== null,
    isAboveFold: rect.y < vh,
    aspectRatio,
    bgColor: style.backgroundColor,
    textColor: style.color,
    borderColor: style.borderColor,
    shape,
  };
}

/**
 * Score visual similarity between two fingerprints.
 * Returns 0-1.
 */
export function visualSimilarity(a: VisualFingerprint, b: VisualFingerprint): number {
  let score = 0;
  let weight = 0;

  // 1. Relative position similarity (most important visual signal)
  const posDist = Math.sqrt(
    Math.pow(a.relX - b.relX, 2) + Math.pow(a.relY - b.relY, 2)
  );
  const posSim = Math.max(0, 1 - posDist * 5); // 0.2 distance = 0 score
  score += posSim * 3.0;
  weight += 3.0;

  // 2. Size similarity
  const sizeDist = Math.sqrt(
    Math.pow(a.relWidth - b.relWidth, 2) + Math.pow(a.relHeight - b.relHeight, 2)
  );
  const sizeSim = Math.max(0, 1 - sizeDist * 10);
  score += sizeSim * 2.0;
  weight += 2.0;

  // 3. Shape match
  const shapeSim = a.shape === b.shape ? 1 : 0;
  score += shapeSim * 1.0;
  weight += 1.0;

  // 4. Color similarity (background)
  const colorSim = colorDistance(a.bgColor, b.bgColor);
  score += colorSim * 1.5;
  weight += 1.5;

  // 5. Parent-relative position (layout stability)
  const layoutDist = Math.sqrt(
    Math.pow(a.parentRelX - b.parentRelX, 2) + Math.pow(a.parentRelY - b.parentRelY, 2)
  );
  const layoutSim = Math.max(0, 1 - layoutDist * 3);
  score += layoutSim * 2.0;
  weight += 2.0;

  // 6. Above fold
  const foldSim = a.isAboveFold === b.isAboveFold ? 1 : 0.3;
  score += foldSim * 0.5;
  weight += 0.5;

  return weight > 0 ? score / weight : 0;
}

/**
 * Parse CSS color string and compute distance (0 = same, 1 = completely different).
 */
function colorDistance(a: string, b: string): number {
  const pa = parseColor(a);
  const pb = parseColor(b);
  if (!pa || !pb) return 0.5; // can't compare

  const dr = pa.r - pb.r;
  const dg = pa.g - pb.g;
  const db = pa.b - pb.b;
  // Normalized Euclidean distance in RGB space
  return Math.sqrt(dr * dr + dg * dg + db * db) / 441.67; // 441.67 = sqrt(255^2 * 3)
}

function parseColor(str: string): { r: number; g: number; b: number } | null {
  if (!str || str === "transparent" || str === "inherit") return null;

  // rgb(r, g, b) or rgba(r, g, b, a)
  const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) return { r: +match[1], g: +match[2], b: +match[3] };

  // hex
  const hex = str.match(/^#([0-9a-f]{6})$/i);
  if (hex) return {
    r: parseInt(hex[1].slice(0, 2), 16),
    g: parseInt(hex[1].slice(2, 4), 16),
    b: parseInt(hex[1].slice(4, 6), 16),
  };

  return null;
}

/**
 * Extract visual fingerprints from ALL visible elements in the page.
 */
export function extractAllVisualFingerprints(): Array<{ index: number; visual: VisualFingerprint }> {
  const all = document.querySelectorAll("*");
  const results: Array<{ index: number; visual: VisualFingerprint }> = [];
  for (let i = 0; i < all.length; i++) {
    const vf = extractVisualFingerprint(all[i]);
    if (vf && vf.isVisible) results.push({ index: i, visual: vf });
  }
  return results;
}
