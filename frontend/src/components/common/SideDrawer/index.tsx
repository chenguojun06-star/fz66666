/**
 * SideDrawer — 统一的右侧滑抽屉（U-2 工序等页面弹窗抽屉化）。
 *
 * 设计约定：
 * - 右侧滑出、近全高，替代内容较重的 Modal（表单/详情/多字段编辑），交互更连贯
 * - 小型确认类对话框（确认/取消/倒计时）仍用 Modal，不要用抽屉
 * - footer 传入时渲染为底部固定操作条（右侧对齐按钮组）
 *
 * @example
 * <SideDrawer
 *   open={open}
 *   onClose={onClose}
 *   title="工序详情"
 *   width="85vw"
 *   footer={<><Button onClick={onClose}>取消</Button><Button type="primary">保存</Button></>}
 * >
 *   ...内容
 * </SideDrawer>
 */
import React from 'react';
import { Drawer } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import './SideDrawer.css';

export interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /** 抽屉宽度，默认 640px；详情类可传 '85vw' 等 */
  width?: number | string;
  /** 底部操作区（一般为按钮组），不传则不渲染底部条 */
  footer?: React.ReactNode;
  /** 底部附加说明（左侧，如提示文案） */
  footerExtra?: React.ReactNode;
  /** 点击遮罩是否关闭（默认 true；表单类防误触可关） */
  maskClosable?: boolean;
  /** 关闭时是否销毁内容（默认 true） */
  destroyOnHidden?: boolean;
  /** 内容区额外样式 */
  styles?: {
    body?: React.CSSProperties;
    header?: React.CSSProperties;
    footer?: React.CSSProperties;
  };
  children?: React.ReactNode;
}

const SideDrawer: React.FC<SideDrawerProps> = ({
  open,
  onClose,
  title,
  width = 640,
  footer,
  footerExtra,
  maskClosable = true,
  destroyOnHidden = true,
  styles,
  children,
}) => (
  <Drawer
    open={open}
    onClose={onClose}
    title={title}
    width={width}
    placement="right"
    maskClosable={maskClosable}
    destroyOnHidden={destroyOnHidden}
    rootClassName="side-drawer"
    styles={{
      body: { padding: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden', ...styles?.body },
      header: { borderBottom: '1px solid var(--color-border-light, #f0f0f0)', padding: '14px 20px', ...styles?.header },
      ...(footer ? { footer: { padding: '12px 20px', borderTop: '1px solid var(--color-border-light, #f0f0f0)', ...styles?.footer } } : {}),
    }}
    footer={footer ? (
      <div className="side-drawer-footer">
        <div className="side-drawer-footer-extra">{footerExtra}</div>
        <div className="side-drawer-footer-actions">{footer}</div>
      </div>
    ) : undefined}
    closeIcon={<CloseOutlined style={{ fontSize: 14 }} />}
  >
    {children}
  </Drawer>
);

export default SideDrawer;
