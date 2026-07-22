import { sortSizeNames } from '@/utils/api';

export function getDefaultContent(type: string): string {
  switch (type) {
    case 'process':
      return JSON.stringify({
        steps: [
          { processCode: '01', processName: '', progressStage: '', unitPrice: 0 },
        ],
      });
    case 'size':
      return JSON.stringify({
        sizes: sortSizeNames(['S', 'M', 'L', 'XL']),
        parts: [{ partName: '', measureMethod: '', tolerance: 0.5, values: {} }],
      });
    case 'bom':
      return JSON.stringify({
        rows: [
          { codePrefix: '', materialType: '', materialName: '', color: '', specification: '', unit: '', usageAmount: 0, lossRate: 0, unitPrice: 0, supplier: '' },
        ],
      });
    default:
      return '{}';
  }
}
