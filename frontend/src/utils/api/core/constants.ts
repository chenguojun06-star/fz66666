/**
 * 核心 API 超时配置（毫秒）
 * - 普通请求：15秒
 * - 扫码提交：10秒（快速失败，便于用户重试）
 * - AI/图片识别：60秒（视觉模型处理可能需要长耗时）
 * - 文件上传：60秒
 */
export const API_TIMEOUT_MS = 15000;
export const SCAN_API_TIMEOUT_MS = 10000;
export const AI_VISION_TIMEOUT_MS = 60000;
export const FILE_UPLOAD_TIMEOUT_MS = 60000;
