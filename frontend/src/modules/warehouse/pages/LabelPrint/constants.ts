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
  manufacturingText: 'MADE IN CHINA',
  dateText: '',
  showManufacturing: true,
  showDate: true,
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
