export const defaultHang = {
  w: 100, h: 70, titleSz: 11, infoSz: 6.5, brandName: '',
  showStyleNo: true, showColorSize: true, showComposition: true, showOrderNo: false,
  showPrice: true, showUCode: true, showImage: false, showQr: false, showBarcode: false,
  showQualityGrade: true, showExecuteStandard: true, showSafetyCategory: true,
  showInspector: true, showInspectionDate: true,
};
export const defaultBar = { w: 40, h: 20, codeSz: 7, textSz: 5.5, showName: true, codeType: 'qr' as 'qr' | 'barcode128' };
export const defaultWash = {
  w: 30, h: 80,
  titleSz: 7, textSz: 5, careSz: 4,
  /** 距剪口偏移（mm）：内容从剪口下方此处开始打印 */
  topOffsetMm: 30,
  /** 全局字体缩放（0.5~1.6）：所有分区字号统一微调；内容装不下时轻微缩小保证不截断 */
  fontScale: 1,
  /** 行距/上下间距缩放（0.7~1.8）：行与行之间、各分区上下之间的距离 */
  lineHeightScale: 1,
  /** 上部（码数/款号/成份）与洗涤区之间的间隔（mm，0~50）：0=紧凑；用户自选距离 */
  sectionGapMm: 0,
  /** 码数区（只显示用户输入内容，空=不显示） */
  showSize: false,
  sizeText: '',
  /** 款号区（只显示用户输入内容，空=不显示） */
  showStyleNo: true,
  styleNoText: '',
  /** 制造区域：只显示用户输入内容，无默认文案 */
  manufacturingText: '',
  dateText: '',
  showManufacturing: false,
  showDate: false,
  showCareIcons: true,
  showComposition: true,
  showWashInstructions: true
};

export const STORAGE_KEY = 'label-print-settings';

export type HangSettings = typeof defaultHang;
export type BarSettings = typeof defaultBar;
export type WashSettings = typeof defaultWash;

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
        wash: parsed.wash || defaultWash,
      };
    }
  } catch { /* ignore */ }
  return { hang: defaultHang, bar: defaultBar, wash: defaultWash };
};
