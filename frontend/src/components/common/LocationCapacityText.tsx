import React, { useCallback, useState } from 'react';
import LocationItemsModal from './LocationItemsModal';

/** 容量蓝色文案的统一文本（D-893）：有容量上限显示「容量X · 已用Y · 剩Z」，否则只显示已用 */
export function formatCapacityText(capacity?: number, usedCapacity?: number): string {
  const cap = Number(capacity ?? 0);
  const used = Number(usedCapacity ?? 0);
  return cap > 0 ? `容量${cap} · 已用${used} · 剩${Math.max(0, cap - used)}` : `已用${used}`;
}

interface Props {
  locationCode: string;
  locationName?: string;
  capacity?: number;
  usedCapacity?: number;
  /** MATERIAL / FINISHED / SAMPLE */
  warehouseType: string;
  /** 是否可点击弹窗（默认 true） */
  clickable?: boolean;
  style?: React.CSSProperties;
}

/**
 * 库位容量蓝色文案（D-893）：「容量X · 已用Y · 剩Z」，点击弹出该库位实际货物明细。
 * 面料/成品/样衣全部统一用这一个组件，禁止各处复制。
 */
const LocationCapacityText: React.FC<Props> = ({
  locationCode,
  locationName,
  capacity,
  usedCapacity,
  warehouseType,
  clickable = true,
  style,
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  const text = formatCapacityText(capacity, usedCapacity);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // 阻止选中该选项（下拉里点击蓝色文字只看明细，不换库位）
    e.stopPropagation();
    e.preventDefault();
    if (clickable) setModalOpen(true);
  }, [clickable]);

  return (
    <>
      <span
        onClick={handleClick}
        style={{
          color: 'var(--color-primary)',
          cursor: clickable ? 'pointer' : 'default',
          fontSize: 12,
          ...style,
        }}
      >
        {text}
      </span>
      {clickable && (
        <LocationItemsModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          locationCode={locationCode}
          locationName={locationName}
          warehouseType={warehouseType}
        />
      )}
    </>
  );
};

export default LocationCapacityText;
