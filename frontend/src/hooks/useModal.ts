import { useState } from 'react';

/**
 * 通用弹窗状态管理 Hook
 *
 * @template T - 弹窗关联的数据类型
 *
 * @example
 * const detailModal = useModal<ProductionOrder>();
 *
 * // 打开弹窗
 * <Button onClick={() => detailModal.open(record)}>查看</Button>
 *
 * // 使用弹窗
 * <ResizableModal visible={detailModal.visible} onCancel={detailModal.close}>
 *   {detailModal.data && <div>{detailModal.data.orderNo}</div>}
 * </ResizableModal>
 */
export const useModal = <T = any>() => {
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<T | null>(null);

  /**
   * 打开弹窗
   * @param record - 可选的关联数据（如查看详情时的记录）
   */
  const open = (record?: T) => {
    setData(record || null);
    setVisible(true);
  };

  /**
   * 关闭弹窗并清空数据
   */
  const close = () => {
    setVisible(false);
    // 延迟清空数据，避免关闭动画时数据闪烁
    setTimeout(() => setData(null), 300);
  };

  /**
   * 更新关联数据（不关闭弹窗）
   */
  const setModalData = (newData: T | null) => {
    setData(newData);
  };

  return {
    visible,      // 弹窗是否可见
    data,         // 弹窗关联的数据
    open,         // 打开弹窗的方法
    close,        // 关闭弹窗的方法
    setModalData, // 更新数据的方法
  };
};
