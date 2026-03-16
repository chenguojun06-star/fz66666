/**
 * antdStatic.ts
 *
 * 全局 Ant Design 静态 API 代理
 *
 * 背景：antd 5 中 message / modal / notification 静态函数在动态主题下会报
 *       "Static function can not consume context like dynamic theme" 警告。
 *
 * 解决方案：
 *   1. 在 main.tsx 的 <AntApp> 内部挂载 <AntdStaticLoader>，
 *      它在组件内调用 App.useApp() 获取 context-aware 实例，
 *      并通过 setAntdStaticRefs() 存入本模块的变量。
 *   2. 各业务模块把 `import { message } from 'antd'` 改为
 *      `import { message } from '@/utils/antdStatic'` 即可，
 *      函数签名完全兼容，无需改其他调用代码。
 *   3. Modal 静态方法（confirm/error/warning/info/success）用 modal 替代
 *      Modal.confirm() 等静态调用。
 *
 * 用法：
 *   import { message, modal, notification } from '@/utils/antdStatic';
 *   message.success('操作成功');
 *   modal.confirm({ title: '确认删除?' });
 */

import type { MessageInstance } from 'antd/es/message/interface';
import type { ModalStaticFunctions } from 'antd/es/modal/confirm';
import type { NotificationInstance } from 'antd/es/notification/interface';
import {
  message as antdMessage,
  Modal as AntdModal,
  notification as antdNotification,
} from 'antd';

// ── 模块级单例 ────────────────────────────────────────────────────────────
let _message: MessageInstance | null = null;
let _modal: Omit<ModalStaticFunctions, 'warn'> | null = null;
let _notification: NotificationInstance | null = null;

/** 由 AntdStaticLoader 在 App context 内调用，注入 context-aware 实例 */
export const setAntdStaticRefs = (
  msg: MessageInstance,
  mod: Omit<ModalStaticFunctions, 'warn'>,
  ntf: NotificationInstance,
) => {
  _message = msg;
  _modal = mod;
  _notification = ntf;
};

// ── 代理：未就绪时回退到 antd 原始静态函数（仅在极早期调用时触发）─────────

/**
 * 兼容 antd MessageInstance 的代理。
 * 替换 `import { message } from 'antd'` 的所有用法。
 */
export const message = new Proxy({} as MessageInstance, {
  get(_t, prop: string) {
    const inst = _message as unknown as Record<string, unknown>;
    if (inst && prop in inst) return inst[prop];
    return (antdMessage as unknown as Record<string, unknown>)[prop];
  },
}) as MessageInstance;

/**
 * context-aware 的 modal 静态方法（confirm / info / success / error / warning）。
 * 替换 `Modal.confirm(...)` 等静态调用：
 *   ❌ Modal.confirm({ ... })
 *   ✅ modal.confirm({ ... })
 *
 * 注意：JSX 中的 `<Modal>` 仍需从 antd 导入组件，不替换。
 */
export const modal = new Proxy({} as Omit<ModalStaticFunctions, 'warn'>, {
  get(_t, prop: string) {
    const inst = _modal as Record<string, unknown> | null;
    if (inst && prop in inst) return inst[prop];
    return (AntdModal as unknown as Record<string, unknown>)[prop];
  },
}) as Omit<ModalStaticFunctions, 'warn'>;

/**
 * context-aware 的 notification 代理。
 */
export const notification = new Proxy({} as NotificationInstance, {
  get(_t, prop: string) {
    const inst = _notification as unknown as Record<string, unknown>;
    if (inst && prop in inst) return inst[prop];
    return (antdNotification as unknown as Record<string, unknown>)[prop];
  },
}) as NotificationInstance;
