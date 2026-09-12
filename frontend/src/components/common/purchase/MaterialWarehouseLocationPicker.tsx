import React, { useEffect, useState } from 'react';
import { Alert, Button, Select, Spin } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useWarehouseAreaOptions, useWarehouseLocationByArea } from '@/hooks/useWarehouseAreaOptions';

interface Props {
  /** 库位编码（受控） */
  value?: string;
  onChange: (locationCode: string, areaId?: string) => void;
}

/**
 * 物料仓库库位选择器（D-360x）——入库库位必须关联真实物料仓库。
 * 数据源 = 库位地图的 MATERIAL 仓库/库区/库位；没有仓库时引导去库位地图新建。
 */
const MaterialWarehouseLocationPicker: React.FC<Props> = ({ value, onChange }) => {
  const navigate = useNavigate();
  const { areas, selectOptions, loading } = useWarehouseAreaOptions('MATERIAL');
  const [areaId, setAreaId] = useState<string>('');
  const { locations, loading: locationsLoading } = useWarehouseLocationByArea('MATERIAL', areaId || undefined);

  useEffect(() => {
    if (!areaId && areas.length > 0) setAreaId(areas[0].id);
  }, [areas, areaId]);

  if (areas.length === 0 && !loading) {
    return (
      <Alert
        type="warning"
        showIcon
        title="还没有物料仓库"
        description={
          <span>
            请先到「库位地图」新建物料仓并划分库位，再回来选择入库库位。
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate('/warehouse/location-map')}>
              去库位地图新建 →
            </Button>
          </span>
        }
      />
    );
  }

  return (
    <div>
      <Select
        style={{ width: '100%' }}
        size="large"
        placeholder="第一步：选择物料仓库"
        loading={loading}
        value={areaId || undefined}
        options={selectOptions}
        onChange={(v: string) => { setAreaId(v); onChange(''); }}
      />
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
          第二步：点击选择库位{value ? `（已选 ${value}）` : ''}
        </div>
        <Spin spinning={locationsLoading}>
          {(locations || []).length === 0 ? (
            <Alert
              type="info"
              showIcon
              title="该仓库还没有库位"
              description={<Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate('/warehouse/location-map')}>去库位地图添加库位 →</Button>}
            />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 200, overflowY: 'auto', padding: 2 }}>
              {(locations || []).map((loc) => {
                const used = loc.usedCapacity ?? 0;
                const full = loc.capacity != null && used >= loc.capacity;
                const selected = value === loc.locationCode;
                return (
                  <div
                    key={loc.id}
                    onClick={() => { if (!full) onChange(loc.locationCode, areaId); }}
                    title={full ? '该库位已满' : `${loc.locationName || loc.locationCode}｜已用 ${used}/${loc.capacity ?? '∞'}`}
                    style={{
                      border: selected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: selected ? 'var(--color-primary-bg, #e6f4ff)' : '#fff',
                      borderRadius: 6,
                      padding: '6px 10px',
                      minWidth: 96,
                      textAlign: 'center',
                      cursor: full ? 'not-allowed' : 'pointer',
                      opacity: full ? 0.5 : 1,
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{loc.locationCode}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                      {full ? '已满' : `空余 ${(loc.capacity ?? 0) - used}`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Spin>
      </div>
    </div>
  );
};

export default MaterialWarehouseLocationPicker;
