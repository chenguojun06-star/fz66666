/**
 * 安全的唯一ID生成工具
 * 替代 Math.random() 用于 React key 生成
 */

let counter = 0;

/**
 * 生成基于时间戳和计数器的唯一ID
 * 适合用于临时数据的 React key
 */
export function generateUniqueId(): string {
  counter += 1;
  return `uid-${Date.now()}-${counter}`;
}

/**
 * 为表格行生成稳定的key
 * @param record 行数据
 * @param index 行索引
 * @param idField ID字段名，默认为'id'
 */
export function generateRowKey<T extends Record<string, unknown>>(
  record: T,
  index: number,
  idField: keyof T = 'id'
): string {
  const id = record[idField];
  if (id !== undefined && id !== null) {
    return String(id);
  }
  // 使用索引作为后备，确保稳定性
  return `row-${index}`;
}

/**
 * 为列表项生成稳定的key
 * @param item 列表项
 * @param index 索引
 * @param fallbackKey 后备key生成函数
 */
export function generateListKey<T>(
  item: T,
  index: number,
  fallbackKey?: (item: T, index: number) => string
): string {
  // 如果item有id属性，使用id
  if (item && typeof item === 'object' && 'id' in item) {
    const id = (item as any).id;
    if (id !== undefined && id !== null) {
      return String(id);
    }
  }
  
  // 使用自定义后备key生成器
  if (fallbackKey) {
    return fallbackKey(item, index);
  }
  
  // 使用索引作为最后的后备
  return `item-${index}`;
}

/**
 * 生成请求ID
 * 用于API请求追踪
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `req-${timestamp}-${randomPart}`;
}

/**
 * 生成临时文件ID
 * 用于上传文件等场景
 */
export function generateTempFileId(fileName: string): string {
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
  return `file-${timestamp}-${safeName}`;
}
