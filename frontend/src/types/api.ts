/**
 * API 响应类型定义
 * 统一管理所有后端 API 的响应类型
 */

/**
 * 标准 API 响应格式
 */
export interface ApiResponse<T = any> {
  code: number;
  message?: string;
  data: T;
  [key: string]: any;
}

/**
 * 分页数据格式
 */
export interface PaginatedData<T> {
  records: T[];
  total: number;
  size: number;
  current: number;
  pages: number;
}

/**
 * 分页响应格式
 */
export type PaginatedResponse<T> = ApiResponse<PaginatedData<T>>;

/**
 * 简单成功响应（无数据）
 */
export type SuccessResponse = ApiResponse<null>;

/**
 * 列表响应（不分页）
 */
export type ListResponse<T> = ApiResponse<T[]>;

/**
 * 详情响应
 */
export type DetailResponse<T> = ApiResponse<T>;

/**
 * API 请求参数 - 分页
 */
export interface PageParams {
  page: number;
  pageSize: number;
}

/**
 * API 请求参数 - 排序
 */
export interface SortParams {
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * 通用查询参数（分页 + 排序）
 */
export type QueryParams = PageParams & SortParams;

/**
 * 文件上传响应
 */
export interface UploadResponse {
  url: string;
  name: string;
  size: number;
}

/**
 * 批量操作响应
 */
export interface BatchOperationResponse {
  successCount: number;
  failCount: number;
  failedIds?: string[];
  errors?: string[];
}

/**
 * 导出文件响应
 */
export interface ExportResponse {
  fileUrl: string;
  fileName: string;
  fileSize: number;
}

/**
 * 统计数据响应
 */
export interface StatisticsResponse {
  total: number;
  [key: string]: number | string;
}

/**
 * 选项列表项（用于下拉选择）
 */
export interface SelectOption {
  label: string;
  value: string | number;
  disabled?: boolean;
  [key: string]: unknown;
}

/**
 * 级联选择选项
 */
export interface CascaderOption extends SelectOption {
  children?: CascaderOption[];
}

/**
 * 树形数据
 */
export interface TreeNode {
  key: string;
  title: string;
  children?: TreeNode[];
  [key: string]: unknown;
}

/**
 * 表单验证错误
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * 错误响应
 */
export interface ErrorResponse extends ApiResponse<null> {
  code: number;
  message: string;
  errors?: ValidationError[];
}

// ============ 类型守卫函数 ============

/**
 * 检查是否为成功的 API 响应
 */
export function isApiSuccess<T = any>(
  response: unknown
): response is ApiResponse<T> {
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    (response as ApiResponse).code === 200
  );
}

/**
 * 检查是否为分页响应
 */
export function isPaginatedResponse<T = any>(
  response: unknown
): response is PaginatedResponse<T> {
  if (!isApiSuccess(response)) return false;

  const data = (response as ApiResponse).data;
  return (
    typeof data === 'object' &&
    data !== null &&
    'records' in data &&
    'total' in data &&
    Array.isArray((data as PaginatedData<T>).records)
  );
}

/**
 * 检查是否为列表响应
 */
export function isListResponse<T = any>(
  response: unknown
): response is ListResponse<T> {
  return (
    isApiSuccess(response) &&
    Array.isArray((response as ApiResponse<T[]>).data)
  );
}

/**
 * 安全地解包 API 响应数据
 */
export function unwrapApiResponse<T = any>(
  response: unknown,
  fallbackMessage = '操作失败'
): T {
  if (isApiSuccess<T>(response)) {
    return response.data;
  }

  const message =
    typeof response === 'object' &&
    response !== null &&
    'message' in response &&
    typeof (response as ApiResponse).message === 'string'
      ? (response as ApiResponse).message
      : fallbackMessage;

  throw new Error(message);
}

/**
 * 从响应中获取错误消息
 */
export function getErrorMessage(
  error: unknown,
  fallback = '未知错误'
): string {
  if (typeof error === 'string') return error;

  if (error instanceof Error) return error.message;

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return fallback;
}

// ============ HTTP 方法类型 ============

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * 请求配置
 */
export interface RequestConfig {
  method?: HttpMethod;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  data?: unknown;
  timeout?: number;
}

// ============ 通用实体类型 ============

/**
 * 带时间戳的实体基类
 */
export interface BaseEntity {
  id?: string;
  createTime?: string;
  updateTime?: string;
  deleteFlag?: number;
}

/**
 * 带创建人/更新人的实体
 */
export interface AuditedEntity extends BaseEntity {
  createBy?: string;
  createByName?: string;
  updateBy?: string;
  updateByName?: string;
}
