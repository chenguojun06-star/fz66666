import { buildDefaultSections, type WashLabelSectionState } from '@/components/common/WashLabelSectionConfigPanel';

export const defaultHang = {
  w: 100, h: 70, titleSz: 11, infoSz: 6.5, brandName: '',
  showStyleNo: true, showColorSize: true, showComposition: true, showOrderNo: false,
  showPrice: true, showUCode: true, showImage: false, showQr: false, showBarcode: false,
  showQualityGrade: true, showExecuteStandard: true, showSafetyCategory: true,
  showInspector: true, showInspectionDate: true,
};
export const defaultBar = { w: 40, h: 20, codeSz: 7, textSz: 5.5, showName: true, codeType: 'qr' as 'qr' | 'barcode128' };
/**
 * D-232：洗水唛改用订单管理同款「分区配置」模型。
 * 原先是一堆零散开关（showComposition / showWashInstructions / showCareIcons …），
 * 内容只能从订单取、用户改不了，也不知道哪个开关对应打印出来哪一块。
 * 现改为每块内容由用户自行编辑（切换订单时自动用款式资料预填，仍可改）。
 */
export interface WashSettings extends WashLabelSectionState {
  /** 纸张宽 mm */
  w: number;
  /** 纸张高 mm */
  h: number;
}

export const defaultWash: WashSettings = {
  w: 30,
  h: 80,
  ...buildDefaultSections({ topOffsetMm: 30 }),
};

export const STORAGE_KEY = 'label-print-settings';

export type HangSettings = typeof defaultHang;
export type BarSettings = typeof defaultBar;

export interface SavedSettings {
  hang: HangSettings;
  bar: BarSettings;
  wash: WashSettings;
}

export const loadSavedSettings = (): SavedSettings => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        hang: parsed.hang || defaultHang,
        bar: parsed.bar || defaultBar,
        // D-232：旧 localStorage 里的 wash 缺少分区文本字段（compositionText / washText /
        // careIconCodes 等），浅合并用默认值补齐，避免改版后编辑区出现 undefined
        wash: parsed.wash ? { ...defaultWash, ...parsed.wash } : defaultWash,
      };
    }
  } catch { /* ignore */ }
  return { hang: defaultHang, bar: defaultBar, wash: defaultWash };
};
