import React, { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Popover, Tooltip } from 'antd';
import {
  ensureSupplierDirectory,
  lookupSupplierDirectory,
  useSupplierDirectoryStore,
} from '@/stores/supplierDirectoryStore';

interface SupplierNameTooltipProps {
  name?: unknown;
  contactPerson?: unknown;
  contactPhone?: unknown;
  /** 供应商地址（主数据 t_factory.address）；显式传入优先于目录回查 */
  address?: unknown;
  /** 供应商 id（主数据 t_factory.id）；用于按 id 精确回查联系人/电话/地址 */
  supplierId?: unknown;
  /** Tooltip 标签前缀，默认"供应商"，工厂场景传"工厂" */
  label?: string;
  /** 传入额外 CSS 样式（会合并到内层 span）*/
  style?: CSSProperties;
  /** 点击事件（可与 Tooltip / Popover 同时使用）*/
  onClick?: React.MouseEventHandler<HTMLSpanElement>;
}

/**
 * 供应商名称展示组件（23 个文件 / 48 处引用的唯一杠杆点）
 *
 * 交互：
 * - 名称渲染为蓝色可点击（var(--color-primary)），鼠标手型
 * - 悬停 → Tooltip 摘要（名称 / 联系人 / 联系电话 / 地址）
 * - 点击 → Popover 详情卡（名称 / 联系人 / 联系电话 / 地址）
 * - 两层浮层受控互斥，避免 Tooltip 与 Popover 重叠
 *
 * 数据来源：显式 props 优先，缺失字段回查供应商目录（stores/supplierDirectoryStore），
 * 目录数据来自 GET /system/factory/list（后端已按 tenant_id 过滤，多租户安全）。
 */
const SupplierNameTooltip: React.FC<SupplierNameTooltipProps> = ({
  name,
  contactPerson,
  contactPhone,
  address,
  supplierId,
  label = '供应商',
  style,
  onClick,
}) => {
  const byId = useSupplierDirectoryStore(s => s.byId);
  const byName = useSupplierDirectoryStore(s => s.byName);
  const [popOpen, setPopOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);

  useEffect(() => {
    void ensureSupplierDirectory();
  }, []);

  const rawName = String(name || '').trim();
  const dirEntry = useMemo(
    () => lookupSupplierDirectory({ byId, byName }, supplierId, rawName),
    [byId, byName, supplierId, rawName],
  );

  const displayText = rawName || dirEntry?.name || '-';
  const person = String(contactPerson || dirEntry?.contactPerson || '').trim();
  const phone = String(contactPhone || dirEntry?.contactPhone || '').trim();
  const addr = String(address || dirEntry?.address || '').trim();
  const hasDetail = !!(person || phone || addr);

  const baseStyle: CSSProperties = {
    display: 'inline-block',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const spanStyle: CSSProperties = {
    ...baseStyle,
    ...(rawName || dirEntry
      ? { color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 500 }
      : {}),
    ...style,
  };

  const labelStyle: CSSProperties = { color: 'var(--color-text-secondary)' };

  const tooltipContent = (
    <div className="u-d-grid u-gap-4">
      <div>{label}：{displayText}</div>
      {person ? <div>联系人：{person}</div> : null}
      {phone ? <div>联系电话：{phone}</div> : null}
      {addr ? <div>地址：{addr}</div> : null}
    </div>
  );

  const popoverContent = (
    <div style={{ minWidth: 220, maxWidth: 320 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{label}信息</div>
      <div className="u-d-grid u-gap-4 u-fs-13">
        <div><span style={labelStyle}>名称：</span>{displayText}</div>
        <div><span style={labelStyle}>联系人：</span>{person || '-'}</div>
        <div><span style={labelStyle}>联系电话：</span>{phone || '-'}</div>
        <div><span style={labelStyle}>地址：</span>{addr || '-'}</div>
      </div>
      {!hasDetail ? (
        <div style={{ marginTop: 8, color: 'var(--color-text-tertiary)', fontSize: 12 }}>
          暂无联系方式与地址，可到「{label}」主数据中维护
        </div>
      ) : null}
    </div>
  );

  const trigger = (
    <span style={spanStyle} onClick={onClick}>
      {displayText}
    </span>
  );

  return (
    <Popover
      content={popoverContent}
      trigger="click"
      open={popOpen}
      onOpenChange={setPopOpen}
      placement="topLeft"
    >
      <Tooltip
        title={hasDetail ? tooltipContent : undefined}
        open={tipOpen && !popOpen}
        onOpenChange={setTipOpen}
      >
        {trigger}
      </Tooltip>
    </Popover>
  );
};

export default SupplierNameTooltip;
