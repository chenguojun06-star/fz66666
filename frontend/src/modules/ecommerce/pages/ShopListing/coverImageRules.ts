/**
 * 主图规范校验（D-778）
 *
 * 调研依据（2026 各平台口径，跨平台取交集）：
 *
 * | 项| 拼多多白底图（官方 mai.pinduoduo.com） | 淘宝/天猫 | 结论 |
 * |---|---|---|---|
 * | 尺寸 | 480×480 | 1:1 800×800（高清建议 1000+） | 最小边 ≥480 硬底线，≥800 推荐 |
 * | 文件大小 | < 3M | ≤ 3MB | ≤ 3MB |
 * | 格式 | jpg / jpeg / png | JPG / PNG | 仅 jpg/jpeg/png |
 * | 背景 | 无背景、纯白 | 纯白 RGB(255,255,255)、无阴影 | 近白底 + 无投影 |
 * | 水印/logo/文字 | 严禁 | 严禁 | 人工确认（无法自动判定） |
 * | 模特 | 无模特 | — | 人工确认 |
 * | 展示方式 | 商品正面展现 | 首图内容须与所售一致 | 人工确认 |
 *
 * 另有两条**平台明确列出但机器判不了**的，必须作为提示告知运营，不能假装通过：
 * - 四周安全区 8%（主图文字被界面裁切）
 * - 商品主体占画面 ≥ 70%（天猫/淘宝白底图要求）
 *
 * 主体占比与白底判定**可以**自动算：用 canvas 降采样后统计非背景像素，
 * 因此这里给出可执行的数值判定，而不是只写一句「建议」。
 *
 * 口径纪律：
 * - `block` = 平台会直接判不合格，或本店主图实际展示会坏掉；
 * - `warn`  = 不影响能否上架，但影响点击率/平台评分。
 * 判不准的一律不 block，避免把合规商品误拦。
 */
import type { ListingIssue } from './listingCompliance';

/** 主图像素元数据（由浏览器实际解码图片得到，不是配置里填的） */
export type CoverImageMeta = {
  width: number;
  height: number;
  /** 文件字节数；拿不到时为 null（如跨域无响应头） */
  bytes?: number | null;
  /** 文件格式：jpg / png / webp / gif / 其它 */
  format?: string | null;
  /**
   * 近白底占比 0~1（采样边缘像素判断）。
   * ≥0.85 视为白底；null 表示尚未分析或无法分析（跨域污染画布）。
   */
  whiteRatio?: number | null;
  /** 商品主体占画面比例 0~1；null 同上 */
  subjectCoverage?: number | null;
};

export const COVER_MIN_SIZE_PX = 480;
export const COVER_RECOMMEND_SIZE_PX = 800;
export const COVER_MAX_BYTES = 3 * 1024 * 1024;
export const COVER_WHITE_RATIO_MIN = 0.85;
export const COVER_SUBJECT_MIN = 0.7;
export const COVER_SAFE_ZONE_RATIO = 0.08;

const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png'];

/** 从文件名/URL 推断格式；取不到返回 null（**不臆断**） */
export function formatFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const clean = url.split('?')[0].split('#')[0];
  const m = clean.match(/\.([A-Za-z0-9]+)$/);
  if (!m) return null;
  return m[1].toLowerCase();
}

/** 尺寸比是否接近 1:1（留 6% 容差，避免 795×800 这类被误判） */
export function isSquareish(w: number, h: number, tolerance = 0.06): boolean {
  if (!(w > 0) || !(h > 0)) return false;
  const ratio = w / h;
  return Math.abs(ratio - 1) <= tolerance;
}

/** 按字节数给出人类可读描述 */
export function formatBytes(bytes?: number | null): string {
  if (bytes == null || !(bytes >= 0)) return '未知';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * 主图规范诊断。
 *
 * <p><b>不做格式臆断</b>：拿不到 width/height 时不判 block（返回空），
 * 宁可少提示也不误伤——把合规商品拦下来比漏提示更伤运营。
 */
export function evaluateCoverImage(meta: CoverImageMeta | null | undefined): ListingIssue[] {
  if (!meta || !(meta.width > 0) || !(meta.height > 0)) return [];
  const issues: ListingIssue[] = [];
  const { width, height } = meta;

  // ── 阻断项 ──
  if (width <= 1 || height <= 1) {
    issues.push({
      level: 'block',
      field: '主图',
      message: `主图是 ${width}×${height} 的占位图`,
      action: '重新上传真实商品图；占位图被拉伸后会变成一整块纯色，看起来像页面坏了',
    });
    return issues; // 占位图无需再谈尺寸比例
  }

  const shortSide = Math.min(width, height);
  if (shortSide < COVER_MIN_SIZE_PX) {
    issues.push({
      level: 'block',
      field: '主图',
      message: `主图 ${width}×${height}，短边 ${shortSide}px 低于平台底线 ${COVER_MIN_SIZE_PX}px`,
      action: `重新出图，短边不低于 ${COVER_MIN_SIZE_PX}px（放大查看会明显发糊，易被平台判不合格）`,
    });
  }

  if (meta.bytes != null && meta.bytes > COVER_MAX_BYTES) {
    issues.push({
      level: 'block',
      field: '主图',
      message: `主图 ${formatBytes(meta.bytes)}，超过平台上限 3MB`,
      action: '压缩到 3MB 以内（推荐 1~2MB）；过大图在移动端加载慢，影响点击率',
    });
  }

  const fmt = meta.format ?? null;
  if (fmt && !ALLOWED_FORMATS.includes(fmt)) {
    issues.push({
      level: 'block',
      field: '主图',
      message: `主图格式 ${fmt.toUpperCase()}，平台只接受 JPG / PNG`,
      action: '另存为 JPG 或 PNG 后重新上传',
    });
  }

  // ── 建议项 ──
  if (shortSide >= COVER_MIN_SIZE_PX && shortSide < COVER_RECOMMEND_SIZE_PX) {
    issues.push({
      level: 'warn',
      field: '主图',
      message: `主图 ${width}×${height}，清晰度未达淘宝系推荐值（短边 ≥ ${COVER_RECOMMEND_SIZE_PX}px）`,
      action: `建议出到 ${COVER_RECOMMEND_SIZE_PX}×${COVER_RECOMMEND_SIZE_PX} 以上；短边 ${shortSide}px 属于「勉强够用」`,
    });
  }

  if (!isSquareish(width, height)) {
    issues.push({
      level: 'warn',
      field: '主图',
      message: `主图比例 ${width}:${height} 不是 1:1（淘宝/天猫/拼多多主图均以 1:1 为主）`,
      action: `裁成正方形；平台会按方形裁切，非方形主图会切掉商品边缘。天猫另有 3:4（750×1000）通道`,
    });
  }

  if (meta.whiteRatio != null && meta.whiteRatio < COVER_WHITE_RATIO_MIN) {
    issues.push({
      level: 'warn',
      field: '主图',
      message: `主图不是白底（边缘近白像素仅 ${(meta.whiteRatio * 100).toFixed(0)}%，要求 ≥ ${COVER_WHITE_RATIO_MIN * 100}%）`,
      action: '换成纯白底（RGB 255,255,255）且无阴影；深色/场景背景图不满足白底图要求',
    });
  }

  if (meta.subjectCoverage != null && meta.subjectCoverage < COVER_SUBJECT_MIN) {
    issues.push({
      level: 'warn',
      field: '主图',
      message: `商品主体仅占画面 ${(meta.subjectCoverage * 100).toFixed(0)}%，低于要求的 ${COVER_SUBJECT_MIN * 100}%`,
      action: '放大商品主体、收紧构图；主体太小在列表页几乎看不清，是低点击率的主因',
    });
  }

  return issues;
}

/**
 * 无法自动判定、但平台明确禁止的项——必须显式提示人工确认。
 *
 * <p>把「机器查不出」这件事显式说出来，比默默通过更专业：
 * 运营至少知道这几条得自己盯。
 */
export function manualCoverChecks(): string[] {
  return [
    '主图内不得出现任何联系方式（微信 / QQ / 手机号 / 二维码）——平台会直接驳回',
    '不得带 logo、水印、拼接边框',
    '首图所示商品的颜色/规格必须与文字介绍一致，不得出现无关商品',
    `文字与主体请留出四周 ${COVER_SAFE_ZONE_RATIO * 100}% 安全区，避免被界面裁切`,
    '不得出现「最」「第一」等绝对化用语与虚假促销词',
  ];
}

/* ────────────────────────── 像素分析（浏览器端） ────────────────────────── */

/** 采样点数：降采样网格边长 */
const GRID = 96;
/** 判定「近白」的阈值：任一通道 ≥ 该值且通道差 ≤ 12 */
const WHITE_MIN = 245;
const WHITE_SPREAD = 12;
/** 判定「与背景不同」的颜色距离阈值 */
const BG_DIFF = 28;

/**
 * 用 canvas 分析白底占比与主体占比。
 *
 * <p><b>为什么用采样而不是全量</b>：主图可能 5MB 全尺寸，逐像素扫描会卡 UI；
 * 降采样到 {@link GRID}×{@link GRID} 后统计，对「是不是白底」「主体多大」
 * 这两个粗判断完全够用，且稳定在毫秒级。
 *
 * <p><b>跨域限制</b>：canvas 读取跨域图片会污染画布，此时
 * {@code getImageData} 抛 SecurityError —— 这里返回全 null，
 * 由上层跳过这两项检查，**不假装通过也不假装失败**。
 *
 * @param img 已decode 的 HTMLImageElement
 * @returns 白底占比与主体占比；无法分析时两者为 null
 */
export function analyzeCoverPixels(img: HTMLImageElement): {
  whiteRatio: number | null;
  subjectCoverage: number | null;
} {
  try {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!(w > 0) || !(h > 0)) return { whiteRatio: null, subjectCoverage: null };

    const canvas = document.createElement('canvas');
    canvas.width = GRID;
    canvas.height = GRID;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { whiteRatio: null, subjectCoverage: null };
    ctx.drawImage(img, 0, 0, GRID, GRID);
    // 跨域图片会在这里抛 SecurityError
    const data = ctx.getImageData(0, 0, GRID, GRID).data;

    // 背景基准色取四角中位数，比取单角更抗「角落有阴影/装饰」干扰
    const corners = [
      [0, 0],
      [GRID - 1, 0],
      [0, GRID - 1],
      [GRID - 1, GRID - 1],
    ].map(([x, y]) => {
      const i = (y * GRID + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    });
    const bg = [
      median(corners.map((c) => c[0])),
      median(corners.map((c) => c[1])),
      median(corners.map((c) => c[2])),
    ];

    let edgeTotal = 0;
    let edgeWhite = 0;
    let subjectMinX = GRID;
    let subjectMaxX = -1;
    let subjectMinY = GRID;
    let subjectMaxY = -1;

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const i = (y * GRID + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // 白底：只看画面外圈一圈即可，主体不会贴边
        if (x === 0 || y === 0 || x === GRID - 1 || y === GRID - 1) {
          edgeTotal++;
          const spread = Math.max(r, g, b) - Math.min(r, g, b);
          if (r >= WHITE_MIN && g >= WHITE_MIN && b >= WHITE_MIN && spread <= WHITE_SPREAD) {
            edgeWhite++;
          }
        }

        const dist =
          Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
        if (dist > BG_DIFF) {
          if (x < subjectMinX) subjectMinX = x;
          if (x > subjectMaxX) subjectMaxX = x;
          if (y < subjectMinY) subjectMinY = y;
          if (y > subjectMaxY) subjectMaxY = y;
        }
      }
    }

    const whiteRatio = edgeTotal > 0 ? edgeWhite / edgeTotal : null;
    let subjectCoverage: number | null = null;
    if (subjectMaxX >= subjectMinX && subjectMaxY >= subjectMinY) {
      const bw = subjectMaxX - subjectMinX + 1;
      const bh = subjectMaxY - subjectMinY + 1;
      subjectCoverage = (bw * bh) / (GRID * GRID);
    }
    return { whiteRatio, subjectCoverage };
  } catch {
    // 跨域污染画布等：交由上层跳过
    return { whiteRatio: null, subjectCoverage: null };
  }
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * 拉取图片字节数（Content-Length）。
 *
 * <p>拿不到就返回 null：跨域无响应头 / 服务端不返回时，调用方跳过体积检查，
 * 不用「未知」冒充「合格」。
 */
export async function fetchImageBytes(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return null;
    const len = res.headers.get('content-length');
    if (!len) return null;
    const n = Number(len);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}