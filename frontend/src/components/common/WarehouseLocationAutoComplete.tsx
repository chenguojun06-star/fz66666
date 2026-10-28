import React, { useState, useEffect, useCallback } from 'react';
import { AutoComplete } from 'antd';
import { BrandLoader } from '@/components/common/loading';
import { useWarehouseLocationByArea } from '@/hooks/useWarehouseAreaOptions';
import LocationItemsModal from './LocationItemsModal';
import { formatCapacityText } from './LocationCapacityText';
import api from '@/utils/api';

interface WarehouseLocationAutoCompleteProps {
  warehouseType?: string;
  areaId?: string;
  value?: string;
  onChange?: (value: string, option?: any) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  className?: string;
}

const DICT_TYPE_MAP: Record<string, string> = {
  FINISHED: 'finished_warehouse_location',
  MATERIAL: 'material_warehouse_location',
  SAMPLE: 'sample_warehouse_location',
};

const WarehouseLocationAutoComplete: React.FC<WarehouseLocationAutoCompleteProps> = ({
  warehouseType,
  areaId,
  value,
  onChange,
  placeholder,
  style,
  className,
}) => {
  const { selectOptions: locationOptions, loading: locationLoading } = useWarehouseLocationByArea(warehouseType, areaId);
  const [dictOptions, setDictOptions] = useState<{ value: string; label: string }[]>([]);
  const [dictLoading, setDictLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<{ value: string; label?: React.ReactNode; entity?: any }[]>([]);
  const [detail, setDetail] = useState<{ code: string; name?: string; type?: string } | null>(null);

  const hasLocationData = locationOptions.length > 0;

  useEffect(() => {
    if (hasLocationData || !warehouseType) return;
    const dictType = DICT_TYPE_MAP[warehouseType] || 'warehouse_location';
    let cancelled = false;
    setDictLoading(true);
    api.get('/system/dict/list', { params: { dictType, page: 1, pageSize: 100 } })
      .then((res: any) => {
        if (cancelled) return;
        const records = res.data?.records || res.data || [];
        const items = records
          .filter((item: any) => item.dictLabel)
          .sort((a: any, b: any) => (a.sort || 0) - (b.sort || 0))
          .map((item: any) => ({ value: item.dictLabel, label: item.dictLabel }));
        setDictOptions(items);
      })
      .catch(() => { if (!cancelled) setDictOptions([]); })
      .finally(() => { if (!cancelled) setDictLoading(false); });
    return () => { cancelled = true; };
  }, [warehouseType, hasLocationData]);

  const activeOptions = hasLocationData ? locationOptions : dictOptions;
  const isLoading = locationLoading || dictLoading;

  const buildOptions = useCallback((keyword: string) => {
    const filtered = keyword
      ? activeOptions.filter(item => (item.label || '').toString().includes(keyword) || (item.value || '').includes(keyword))
      : activeOptions;
    return filtered.map(item => ({
      value: item.value,
      label: item.label || item.value,
      entity: (item as { location?: { locationCode: string; locationName?: string; capacity?: number; usedCapacity?: number; warehouseType?: string } }).location,
    }));
  }, [activeOptions]);

  useEffect(() => {
    if (open) {
      setOptions(buildOptions(''));
    }
  }, [open, buildOptions]);

  const handleFocus = () => {
    setOpen(true);
    setOptions(buildOptions(''));
  };

  const handleSearch = (searchText: string) => {
    setOptions(buildOptions(searchText));
  };

  const handleBlur = () => {
    setOpen(false);
  };

  const handleSelect = (val: string) => {
    setOpen(false);
    onChange?.(val, { value: val, label: val });
  };

  const handleChange = (val: string, option?: any) => {
    onChange?.(val, option);
  };

  return (
    <>
      <AutoComplete
        className={className}
        value={value}
        open={open}
        onOpenChange={setOpen}
        options={open ? options : []}
        onChange={handleChange}
        onSearch={handleSearch}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onSelect={handleSelect}
        placeholder={placeholder || '请选择或输入仓位'}
        filterOption={false}
        notFoundContent={isLoading ? <BrandLoader size={40} /> : (activeOptions.length === 0 ? '暂无数据' : '无匹配项')}
        style={style}
        optionRender={(opt) => {
          const loc = (opt.data as { entity?: { locationCode: string; locationName?: string; capacity?: number; usedCapacity?: number; warehouseType?: string } }).entity;
          if (!loc) return <span>{opt.data.label as React.ReactNode}</span>;
          return (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.locationName || loc.locationCode}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDetail({ code: loc.locationCode, name: loc.locationName, type: loc.warehouseType || warehouseType });
                }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ color: 'var(--color-primary)', fontSize: 12, flexShrink: 0, cursor: 'pointer' }}
              >
                {formatCapacityText(loc.capacity, loc.usedCapacity)}
              </span>
            </div>
          );
        }}
      />
      <LocationItemsModal
        open={!!detail}
        onClose={() => setDetail(null)}
        locationCode={detail?.code || ''}
        locationName={detail?.name}
        warehouseType={detail?.type || 'MATERIAL'}
      />
    </>
  );
};

export default WarehouseLocationAutoComplete;
