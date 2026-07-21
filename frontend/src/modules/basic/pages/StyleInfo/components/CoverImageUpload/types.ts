import type { StyleFieldParseResult } from '@/services/intelligence/intelligenceApi';

export interface CoverImageUploadProps {
  styleId?: string | number;
  styleNo?: string;
  enabled: boolean;
  isNewMode?: boolean;  // 新建模式
  pendingFiles?: File[];  // 待上传的文件列表
  onPendingFilesChange?: (files: File[]) => void;  // 更新待上传文件
  coverUrl?: string | null;  // 兜底封面URL（选品中心下板时写入cover字段，无附件时展示）
  refreshTrigger?: number;
  onCoverChange?: (url: string | null) => void;
  onStyleParseResult?: (result: StyleFieldParseResult) => void;  // 智能识别结果
  onAutoParseStart?: () => void;           // 自动识别开始回调
  onAutoParseResult?: (result: StyleFieldParseResult) => void; // 自动识别结果回传
  autoParseEnabled?: boolean;               // 是否启用自动识别（默认 true）
}

// 展示用的图片条目类型（统一新建模式本地预览与编辑模式服务器图片）
export interface DisplayImage {
  fileUrl: string;
  id: string | number;
  isLocal?: boolean;
  localIndex?: number;
  isCoverFallback?: boolean;
  bizType?: string;
}
