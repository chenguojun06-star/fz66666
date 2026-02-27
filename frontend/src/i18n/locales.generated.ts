/**
 * AUTO-GENERATED FILE.
 * Source: shared-locales/source/*.json
 * Run: node scripts/sync-locales.js
 */

export const LOCALES = {
  "zh-CN": {
    "language": {
      "current": "当前语言",
      "names": {
        "zh-CN": "中文",
        "en-US": "英文",
        "vi-VN": "越南语",
        "km-KH": "高棉语"
      }
    },
    "common": {
      "confirm": "确定",
      "cancel": "取消",
      "save": "保存",
      "loading": "加载中..."
    }
  },
  "en-US": {
    "language": {
      "current": "Current Language",
      "names": {
        "zh-CN": "Chinese",
        "en-US": "English",
        "vi-VN": "Vietnamese",
        "km-KH": "Khmer"
      }
    },
    "common": {
      "confirm": "Confirm",
      "cancel": "Cancel",
      "save": "Save",
      "loading": "Loading..."
    }
  },
  "vi-VN": {
    "language": {
      "current": "Ngôn ngữ hiện tại",
      "names": {
        "zh-CN": "Tiếng Trung",
        "en-US": "Tiếng Anh",
        "vi-VN": "Tiếng Việt",
        "km-KH": "Tiếng Khmer"
      }
    },
    "common": {
      "confirm": "Xác nhận",
      "cancel": "Hủy",
      "save": "Lưu",
      "loading": "Đang tải..."
    }
  },
  "km-KH": {
    "language": {
      "current": "ភាសាបច្ចុប្បន្ន",
      "names": {
        "zh-CN": "ចិន",
        "en-US": "អង់គ្លេស",
        "vi-VN": "វៀតណាម",
        "km-KH": "ខ្មែរ"
      }
    },
    "common": {
      "confirm": "យល់ព្រម",
      "cancel": "បោះបង់",
      "save": "រក្សាទុក",
      "loading": "កំពុងផ្ទុក..."
    }
  }
} as const;

export type LocaleCode = keyof typeof LOCALES;
