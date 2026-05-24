import { Modal, message } from 'antd';

export function confirmDelete(name: string, onOk: () => Promise<void>, options?: { content?: string }) {
  Modal.confirm({
    title: '确认删除',
    content: options?.content || `确定要删除「${name}」吗？此操作不可恢复。`,
    okText: '确认删除',
    okButtonProps: { danger: true },
    cancelText: '取消',
    onOk: async () => {
      try {
        await onOk();
        message.success('删除成功');
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : '删除失败');
        throw e;
      }
    },
  });
}

export function confirmAction(title: string, content: string, onOk: () => Promise<void>, options?: { okText?: string; danger?: boolean }) {
  Modal.confirm({
    title,
    content,
    okText: options?.okText || '确认',
    okButtonProps: options?.danger ? { danger: true } : undefined,
    cancelText: '取消',
    onOk: async () => {
      try {
        await onOk();
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : '操作失败');
        throw e;
      }
    },
  });
}
