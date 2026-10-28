import React, { useCallback, useMemo, useState } from 'react';
import { Select } from 'antd';
import LocationItemsModal from './LocationItemsModal';
import { formatCapacityText } from './LocationCapacityText';

export interface LocationLike {
  locationCode: string;
  locationName?: string;
  capacity?: number;
  usedCapacity?: number;
}

interface Props {
  /** MATERIAL / FINISHED / SAMPLE */
  warehouseType: string;
  /** 库位实体列表（来自 useWarehouseLocationByArea / useWarehouseLocationOptions） */
  locations: LocationLike[];
  value?: string;
  onChange?: (v?: string) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  allowClear?: boolean;
  size?: 'small' | 'middle' | 'large';
  style?: React.CSSProperties;
  notFoundContent?: React.ReactNode;
}

/**
 * 库位下拉统一组件（D-893）：
 * 每个选项 = 库位名 + 蓝色「容量X · 已用Y · 剩Z」，点蓝色文字弹出该库位实际货物明细；
 * 选中后输入框内同样显示蓝色容量。面料/成品/样衣全部统一用这一个组件。
 */
const WarehouseLocationSelect: React.FC<Props> = ({
  warehouseType,
  locations,
  value,
  onChange,
  loading,
  disabled,
  placeholder,
  allowClear = true,
  size,
  style,
  notFoundContent,
}) => {
  const [detail, setDetail] = useState<LocationLike | null>(null);

  const options = useMemo(
    () => locations.map((l) => ({
      value: l.locationCode,
      label: l.locationName || l.locationCode,
      entity: l,
    })),
    [locations],
  );

  const openDetail = useCallback((e: React.MouseEvent, loc: LocationLike) => {
    // 阻止下拉展开/选项选中，只弹明细
    e.stopPropagation();
    e.preventDefault();
    setDetail(loc);
  }, []);

  const selectedEntity = useMemo(
    () => locations.find((l) => l.locationCode === value),
    [locations, value],
  );

  return (
    <>
      <Select
        style={style}
        size={size}
        placeholder={placeholder}
        loading={loading}
        disabled={disabled}
        allowClear={allowClear}
        showSearch
        value={value || undefined}
        onChange={(v) => onChange?.(v)}
        options={options}
        optionFilterProp="label"
        notFoundContent={notFoundContent}
        optionRender={(opt) => {
          const loc = (opt.data as { entity: LocationLike }).entity;
          return (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.locationName || loc.locationCode}</span>
              <span
                onClick={(e) => openDetail(e, loc)}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ color: 'var(--color-primary)', fontSize: 12, flexShrink: 0, cursor: 'pointer' }}
              >
                {formatCapacityText(loc.capacity, loc.usedCapacity)}
              </span>
            </div>
          );
        }}
        labelRender={() => {
          if (!selectedEntity) return value as React.ReactNode;
          return (
            <span>
              {selectedEntity.locationName || selectedEntity.locationCode}
              <span
                onClick={(e) => openDetail(e, selectedEntity)}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ color: 'var(--color-primary)', fontSize: 12, marginLeft: 8, cursor: 'pointer' }}
              >
                {formatCapacityText(selectedEntity.capacity, selectedEntity.usedCapacity)}
              </span>
            </span>
          );
        }}
      />
      <LocationItemsModal
        open={!!detail}
        onClose={() => setDetail(null)}
        locationCode={detail?.locationCode || ''}
        locationName={detail?.locationName}
        warehouseType={warehouseType}
      />
    </>
  );
};

export default WarehouseLocationSelect;
