import React, { useEffect, useState } from 'react';
import { Alert, Button, Select, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useWarehouseAreaOptions } from '@/hooks/useWarehouseAreaOptions';
import WarehouseLocationAutoComplete from '@/components/common/WarehouseLocationAutoComplete';

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
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Select
        style={{ width: '100%' }}
        placeholder="选择物料仓库"
        loading={loading}
        value={areaId || undefined}
        options={selectOptions}
        onChange={(v: string) => { setAreaId(v); onChange(''); }}
      />
      <WarehouseLocationAutoComplete
        warehouseType="MATERIAL"
        areaId={areaId || undefined}
        value={value}
        onChange={(v: string) => onChange(v, areaId)}
      />
    </Space>
  );
};

export default MaterialWarehouseLocationPicker;
