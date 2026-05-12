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
    x: number;
    y: number;
    width: number;
    height: number;
    relX: number;
    relY: number;
    relWidth: number;
    relHeight: number;
    parentRelX: number;
    parentRelY: number;
    isVisible: boolean;
    isAboveFold: boolean;
    aspectRatio: number;
    bgColor: string;
    textColor: string;
    borderColor: string;
    shape: "square" | "wide" | "tall" | "tiny";
}
/**
 * Extract visual fingerprint from a DOM element.
 * Runs inside page.evaluate().
 */
export declare function extractVisualFingerprint(el: Element): VisualFingerprint | null;
/**
 * Score visual similarity between two fingerprints.
 * Returns 0-1.
 */
export declare function visualSimilarity(a: VisualFingerprint, b: VisualFingerprint): number;
/**
 * Extract visual fingerprints from ALL visible elements in the page.
 */
export declare function extractAllVisualFingerprints(): Array<{
    index: number;
    visual: VisualFingerprint;
}>;
