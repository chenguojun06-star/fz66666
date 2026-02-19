/**
 * 通用业务 Hooks 统一导出
 *
 * @description
 * 提供可复用的业务逻辑 Hooks，减少重复代码
 * 所有 Hooks 遵循最小侵入原则，不改变现有UI和交互
 */

export { useModal } from './useModal';
export { useRequest } from './useRequest';
export { useTablePagination } from './useTablePagination';

export type { RequestOptions, RequestResult } from './useRequest';
export type { PaginationConfig } from './useTablePagination';
