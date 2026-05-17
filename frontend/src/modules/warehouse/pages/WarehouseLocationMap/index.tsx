import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Switch, Badge, Empty, Tag, Statistic, Row, Col, Tooltip, Spin, App, Button, Input, Select, Form } from 'antd';
import { ShopOutlined, EnvironmentOutlined, AppstoreOutlined, InboxOutlined, ReloadOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { warehouseLocationMapApi } from '@/services/warehouse/warehouseLocationMapApi';
import './WarehouseLocationMap.css';

interface WarehouseAreaItem {
  id: string;
  areaCode: string;
  areaName: string;
  warehouseType: string;
  status: string;
  address?: string;
  contactPerson?: string;
  contactPhone?: string;
  managerName?: string;
  description?: string;
  sortOrder?: number;
}

interface LocationItem {
  id: string;
  locationCode: string;
  locationName: string;
  zoneCode: string;
  zoneName: string;
  aisleCode: string;
  rackCode: string;
  levelCode: string;
  positionCode: string;
  locationType: string;
  warehouseType: string;
  areaId: string;
  capacity: number;
  usedCapacity: number;
  status: string;
  description?: string;
}

interface LocationSkuItem {
  skuCode: string;
  styleNo: string;
  color: string;
  size: string;
  stockQuantity: number;
  salesPrice?: number;
  costPrice?: number;
}

const WAREHOUSE_TYPE_MAP: Record<string, string> = {
  FINISHED: '成品仓',
  MATERIAL: '物料仓',
  SAMPLE: '样衣仓',
};

const WAREHOUSE_TYPE_OPTIONS = [
  { value: 'FINISHED', label: '成品仓' },
  { value: 'MATERIAL', label: '物料仓' },
  { value: 'SAMPLE', label: '样衣仓' },
];

const WarehouseLocationMap: React.FC = () => {
  const { message, modal } = App.useApp();

  const [areas, setAreas] = useState<WarehouseAreaItem[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [selectedZoneName, setSelectedZoneName] = useState<string>('');

  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  const [overview, setOverview] = useState<Record<string, any>>({});
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [selectedLocation, setSelectedLocation] = useState<LocationItem | null>(null);
  const [locationItems, setLocationItems] = useState<LocationSkuItem[]>([]);
  const [locationItemsLoading, setLocationItemsLoading] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const [createAreaModalOpen, setCreateAreaModalOpen] = useState(false);
  const [createAreaForm] = Form.useForm();

  const [createLocationModalOpen, setCreateLocationModalOpen] = useState(false);
  const [createLocationForm] = Form.useForm();

  const [batchInitModalOpen, setBatchInitModalOpen] = useState(false);
  const [batchInitForm] = Form.useForm();

  const loadAreas = useCallback(async () => {
    setAreasLoading(true);
    try {
      const res = await warehouseLocationMapApi.getAreaList({ pageSize: 200 });
      const list = res?.data?.data?.records || res?.data?.records || [];
      setAreas(list);
      if (list.length > 0 && !selectedAreaId) {
        setSelectedAreaId(list[0].id);
      }
    } catch {
      message.error('加载仓库区域失败');
    } finally {
      setAreasLoading(false);
    }
  }, [message, selectedAreaId]);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await warehouseLocationMapApi.getWarehouseOverview();
      setOverview(res?.data?.data || res?.data || {});
    } catch {
      // silent
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadLocations = useCallback(async (areaId: string) => {
    if (!areaId) return;
    setLocationsLoading(true);
    try {
      const res = await warehouseLocationMapApi.getLocationListByType(undefined, areaId);
      const list = res?.data?.data || res?.data || [];
      setLocations(list);
      if (list.length > 0) {
        const firstZone = list.find((l: LocationItem) => l.zoneName)?.zoneName || '';
        setSelectedZoneName(firstZone);
      } else {
        setSelectedZoneName('');
      }
    } catch {
      message.error('加载库位数据失败');
    } finally {
      setLocationsLoading(false);
    }
  }, [message]);

  useEffect(() => {
    loadAreas();
    loadOverview();
  }, [loadAreas, loadOverview]);

  useEffect(() => {
    if (selectedAreaId) {
      loadLocations(selectedAreaId);
    }
  }, [selectedAreaId, loadLocations]);

  const selectedArea = useMemo(
    () => areas.find(a => a.id === selectedAreaId),
    [areas, selectedAreaId]
  );

  const zones = useMemo(() => {
    const zoneMap = new Map<string, string>();
    locations.forEach(loc => {
      if (loc.zoneName && !zoneMap.has(loc.zoneName)) {
        zoneMap.set(loc.zoneName, loc.zoneCode || loc.zoneName);
      }
    });
    return Array.from(zoneMap.entries()).map(([name, code]) => ({ name, code }));
  }, [locations]);

  const filteredLocations = useMemo(() => {
    if (!selectedZoneName) return locations;
    return locations.filter(l => l.zoneName === selectedZoneName);
  }, [locations, selectedZoneName]);

  const handleToggleArea = async (areaId: string, checked: boolean) => {
    const newStatus = checked ? 'ACTIVE' : 'DISABLED';
    try {
      await warehouseLocationMapApi.updateAreaStatus(areaId, newStatus);
      setAreas(prev => prev.map(a => a.id === areaId ? { ...a, status: newStatus } : a));
      message.success(checked ? '已启用' : '已停用');
    } catch {
      message.error('操作失败');
    }
  };

  const confirmDeleteArea = (areaId: string, areaName: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    let reasonInput = '';
    modal.confirm({
      title: `确定删除仓库「${areaName}」？`,
      content: (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: 'var(--color-danger)', marginBottom: 8 }}>
            此操作将硬删除该仓库及其下所有空闲库位，删除后不可恢复！
          </div>
          <Input.TextArea
            rows={3}
            placeholder="请输入删除原因（必填）"
            onChange={(e) => { reasonInput = e.target.value; }}
          />
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        if (!reasonInput.trim()) {
          message.error('请输入删除原因');
          return Promise.reject();
        }
        try {
          await warehouseLocationMapApi.deleteArea(areaId, reasonInput.trim());
          message.success('仓库删除成功');
          if (selectedAreaId === areaId) {
            setSelectedAreaId('');
            setLocations([]);
          }
          loadAreas();
          loadOverview();
        } catch (err: any) {
          const errMsg = err?.response?.data?.message || err?.message || '删除失败';
          message.error(errMsg);
        }
      },
    });
  };

  const confirmDeleteLocation = (locationId: string, locationCode: string, usedCapacity: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (usedCapacity > 0) {
      message.warning('该库位正在使用中，无法删除');
      return;
    }
    let reasonInput = '';
    modal.confirm({
      title: `确定删除库位「${locationCode}」？`,
      content: (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: 'var(--color-danger)', marginBottom: 8 }}>
            此操作将硬删除该库位，删除后不可恢复！
          </div>
          <Input.TextArea
            rows={3}
            placeholder="请输入删除原因（必填）"
            onChange={(e) => { reasonInput = e.target.value; }}
          />
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        if (!reasonInput.trim()) {
          message.error('请输入删除原因');
          return Promise.reject();
        }
        try {
          const res = await warehouseLocationMapApi.deleteLocation(locationId, reasonInput.trim());
          const code = res?.data?.code;
          if (code !== undefined && code !== 0 && code !== 200) {
            message.error(res?.data?.message || '删除失败');
            return;
          }
          message.success(`库位 ${locationCode} 已删除`);
          if (selectedLocation?.id === locationId) {
            setDetailModalOpen(false);
            setSelectedLocation(null);
          }
          loadLocations(selectedAreaId);
          loadOverview();
        } catch (err: any) {
          const errMsg = err?.response?.data?.message || err?.message || '删除失败';
          message.error(errMsg);
        }
      },
    });
  };

  const handleCreateArea = async () => {
    try {
      const values = await createAreaForm.validateFields();
      await warehouseLocationMapApi.quickCreateArea(values.areaName, values.warehouseType);
      message.success('仓库创建成功');
      setCreateAreaModalOpen(false);
      createAreaForm.resetFields();
      loadAreas();
      loadOverview();
    } catch {
      message.error('创建失败');
    }
  };

  const handleCreateLocation = async () => {
    try {
      const values = await createLocationForm.validateFields();
      await warehouseLocationMapApi.createLocation({
        locationCode: values.locationCode,
        locationName: values.locationName || values.locationCode,
        zoneCode: values.zoneCode,
        zoneName: values.zoneName,
        warehouseType: selectedArea?.warehouseType,
        areaId: selectedAreaId,
        capacity: values.capacity || 100,
        locationType: 'STORAGE',
      });
      message.success('库位创建成功');
      setCreateLocationModalOpen(false);
      createLocationForm.resetFields();
      loadLocations(selectedAreaId);
    } catch {
      message.error('创建失败');
    }
  };

  const handleBatchInit = async () => {
    try {
      const values = await batchInitForm.validateFields();
      const zoneNames = values.zoneNames
        ? values.zoneNames.split(',').map((s: string) => s.trim()).filter(Boolean)
        : undefined;
      await warehouseLocationMapApi.batchInitLocations({
        warehouseType: selectedArea?.warehouseType,
        areaId: selectedAreaId,
        zoneNames,
        racksPerZone: values.racksPerZone || 2,
        levelsPerRack: values.levelsPerRack || 3,
        positionsPerLevel: values.positionsPerLevel || 2,
      });
      message.success('批量初始化成功');
      setBatchInitModalOpen(false);
      batchInitForm.resetFields();
      loadLocations(selectedAreaId);
      loadOverview();
    } catch {
      message.error('批量初始化失败');
    }
  };

  const handleLocationClick = async (location: LocationItem) => {
    setSelectedLocation(location);
    setDetailModalOpen(true);
    setLocationItemsLoading(true);
    try {
      const res = await warehouseLocationMapApi.getLocationItems(location.locationCode, location.warehouseType);
      const items = res?.data?.data?.items || res?.data?.items || [];
      setLocationItems(items);
    } catch {
      setLocationItems([]);
    } finally {
      setLocationItemsLoading(false);
    }
  };

  const getLocationStatus = (loc: LocationItem): 'empty' | 'normal' | 'full' | 'locked' => {
    if (loc.status === 'DISABLED') return 'locked';
    if (!loc.usedCapacity || loc.usedCapacity === 0) return 'empty';
    if (loc.capacity && loc.usedCapacity >= loc.capacity * 0.8) return 'full';
    return 'normal';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'empty': return 'var(--color-text-quaternary)';
      case 'normal': return 'var(--color-success)';
      case 'full': return 'var(--color-warning)';
      case 'locked': return 'var(--color-danger)';
      default: return 'var(--color-text-quaternary)';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'empty': return 'var(--color-bg-container)';
      case 'normal': return '#f6ffed';
      case 'full': return '#fffbe6';
      case 'locked': return '#fff2f0';
      default: return 'var(--color-bg-container)';
    }
  };

  const getStatusBorder = (status: string) => {
    switch (status) {
      case 'empty': return 'var(--color-border-light)';
      case 'normal': return '#b7eb8f';
      case 'full': return '#ffe58f';
      case 'locked': return '#ffccc7';
      default: return 'var(--color-border-light)';
    }
  };

  const areaOverview = selectedArea ? overview[selectedArea.warehouseType] : null;

  return (
    <div className="warehouse-location-map">
      <div className="wlm-layout">
        <div className="wlm-sidebar">
          <div className="wlm-sidebar-header">
            <ShopOutlined className="wlm-sidebar-icon" />
            <span className="wlm-sidebar-title">仓库仓位管理</span>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setCreateAreaModalOpen(true)}
            >
              新建仓库
            </Button>
          </div>
          <div className="wlm-warehouse-list">
            <Spin spinning={areasLoading}>
              {areas.length === 0 && !areasLoading ? (
                <Empty description="暂无仓库，点击上方新建" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                areas.map(area => (
                  <div
                    key={area.id}
                    className={`wlm-warehouse-item ${selectedAreaId === area.id ? 'active' : ''}`}
                    onClick={() => setSelectedAreaId(area.id)}
                  >
                    <div className="wlm-warehouse-info">
                      <div className="wlm-warehouse-name">
                        {area.areaName}
                        <Tag
                          color={area.warehouseType === 'FINISHED' ? 'blue' : area.warehouseType === 'MATERIAL' ? 'green' : 'orange'}
                          style={{ marginLeft: 6, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
                        >
                          {WAREHOUSE_TYPE_MAP[area.warehouseType] || area.warehouseType}
                        </Tag>
                      </div>
                      <div className="wlm-warehouse-meta">
                        <span>编码: {area.areaCode}</span>
                        {area.address && <span>地址: {area.address}</span>}
                      </div>
                    </div>
                    <div className="wlm-warehouse-actions" onClick={e => e.stopPropagation()}>
                      <DeleteOutlined
                        className="wlm-action-icon"
                        style={{ color: 'var(--color-danger)', marginRight: 6 }}
                        onClick={(e) => confirmDeleteArea(area.id, area.areaName, e)}
                      />
                      <Switch
                        size="small"
                        checked={area.status === 'ACTIVE'}
                        onChange={checked => handleToggleArea(area.id, checked)}
                      />
                    </div>
                  </div>
                ))
              )}
            </Spin>
          </div>
        </div>

        <div className="wlm-main">
          {selectedArea ? (
            <>
              <div className="wlm-main-header">
                <div className="wlm-header-left">
                  <div className="wlm-header-title">
                    <EnvironmentOutlined style={{ color: 'var(--color-primary)', marginRight: 8 }} />
                    {selectedArea.areaName}
                    <Tag color={selectedArea.warehouseType === 'FINISHED' ? 'blue' : selectedArea.warehouseType === 'MATERIAL' ? 'green' : 'orange'} style={{ marginLeft: 8 }}>
                      {WAREHOUSE_TYPE_MAP[selectedArea.warehouseType] || selectedArea.warehouseType}
                    </Tag>
                  </div>
                  <div className="wlm-header-subtitle">
                    {selectedArea.address || '实际库存数，用于店铺售卖的库存，订单发货后扣减'}
                  </div>
                </div>
                <div className="wlm-header-stats">
                  <Row gutter={24}>
                    <Col>
                      <Statistic
                        title="总库位"
                        value={areaOverview?.totalLocations || locations.length}
                        suffix="个"
                        styles={{ content: { color: 'var(--color-primary)', fontSize: 20, fontWeight: 600 } }}
                        loading={overviewLoading}
                      />
                    </Col>
                    <Col>
                      <Statistic
                        title="已使用"
                        value={areaOverview?.usedLocations || locations.filter(l => l.usedCapacity > 0).length}
                        suffix="个"
                        styles={{ content: { color: 'var(--color-success)', fontSize: 20, fontWeight: 600 } }}
                        loading={overviewLoading}
                      />
                    </Col>
                  </Row>
                </div>
              </div>

              <div className="wlm-zone-tabs">
                {zones.map(zone => (
                  <div
                    key={zone.name}
                    className={`wlm-zone-tab ${selectedZoneName === zone.name ? 'active' : ''}`}
                    onClick={() => setSelectedZoneName(zone.name)}
                  >
                    <AppstoreOutlined style={{ marginRight: 4 }} />
                    {zone.name}
                    <Badge
                      count={locations.filter(l => l.zoneName === zone.name && l.usedCapacity > 0).length}
                      style={{ marginLeft: 6, backgroundColor: 'var(--color-primary)' }}
                    />
                  </div>
                ))}
                <div className="wlm-zone-tab-actions">
                  <Button
                    type="link"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => setCreateLocationModalOpen(true)}
                  >
                    新增库位
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    icon={<AppstoreOutlined />}
                    onClick={() => {
                      batchInitForm.setFieldsValue({
                        racksPerZone: 2,
                        levelsPerRack: 3,
                        positionsPerLevel: 2,
                      });
                      setBatchInitModalOpen(true);
                    }}
                  >
                    批量初始化
                  </Button>
                </div>
              </div>

              <Spin spinning={locationsLoading}>
                {filteredLocations.length > 0 ? (
                  <div className="wlm-location-grid">
                    {filteredLocations.map(location => {
                      const status = getLocationStatus(location);
                      return (
                        <Tooltip
                          key={location.id}
                          title={
                            status === 'empty'
                              ? `${location.locationCode} - 空库位`
                              : `${location.locationCode} - 已用 ${location.usedCapacity}/${location.capacity || '∞'}`
                          }
                          placement="top"
                        >
                          <div
                            className={`wlm-location-card ${status}`}
                            style={{
                              backgroundColor: getStatusBg(status),
                              borderColor: getStatusBorder(status),
                            }}
                            onClick={() => handleLocationClick(location)}
                          >
                            <div className="wlm-location-code" style={{ color: getStatusColor(status) }}>
                              {location.locationCode}
                            </div>
                            <div className="wlm-location-qty">
                              {status === 'empty' ? (
                                <span className="wlm-empty-text">空闲</span>
                              ) : (
                                <>
                                  <InboxOutlined style={{ fontSize: 12, marginRight: 2 }} />
                                  {location.usedCapacity}
                                </>
                              )}
                            </div>
                            <div className="wlm-location-capacity">
                              {location.capacity ? `${location.usedCapacity}/${location.capacity}` : `${location.usedCapacity}`}
                            </div>
                            <DeleteOutlined
                              className="wlm-location-delete-icon"
                              onClick={(e) => confirmDeleteLocation(location.id, location.locationCode, location.usedCapacity, e)}
                            />
                          </div>
                        </Tooltip>
                      );
                    })}
                  </div>
                ) : (
                  <Empty
                    description={locationsLoading ? '加载中...' : '该仓库暂无库位，请点击上方"新增库位"或"批量初始化"'}
                    style={{ marginTop: 60 }}
                  />
                )}
              </Spin>
            </>
          ) : (
            <Empty description="请选择仓库，或点击左侧新建仓库" style={{ marginTop: 60 }} />
          )}
        </div>
      </div>

      {/* 新建仓库弹窗 */}
      <ResizableModal
        open={createAreaModalOpen}
        onCancel={() => { setCreateAreaModalOpen(false); createAreaForm.resetFields(); }}
        title="新建仓库"
        width={450}
        onOk={handleCreateArea}
        okText="创建"
      >
        <div style={{ padding: '8px 0' }}>
          <Form form={createAreaForm} layout="vertical">
            <Form.Item name="warehouseType" label="仓库类型" rules={[{ required: true, message: '请选择仓库类型' }]}>
              <Select placeholder="请选择仓库类型" options={WAREHOUSE_TYPE_OPTIONS} />
            </Form.Item>
            <Form.Item name="areaName" label="仓库名称" rules={[{ required: true, message: '请输入仓库名称' }]}>
              <Input placeholder="例如：十五楼板房仓" />
            </Form.Item>
          </Form>
        </div>
      </ResizableModal>

      {/* 新增库位弹窗 */}
      <ResizableModal
        open={createLocationModalOpen}
        onCancel={() => { setCreateLocationModalOpen(false); createLocationForm.resetFields(); }}
        title={`新增库位 - ${selectedArea?.areaName || ''}`}
        width={450}
        onOk={handleCreateLocation}
        okText="创建"
      >
        <div style={{ padding: '8px 0' }}>
          <Form form={createLocationForm} layout="vertical">
            <Form.Item name="zoneName" label="库区名称" rules={[{ required: true, message: '请输入库区名称' }]}>
              <Input placeholder="例如：A区-合格品" />
            </Form.Item>
            <Form.Item name="zoneCode" label="库区编码">
              <Input placeholder="例如：A（自动取库区名称首字母）" />
            </Form.Item>
            <Form.Item name="locationCode" label="库位编码" rules={[{ required: true, message: '请输入库位编码' }]}>
              <Input placeholder="例如：A-01-1-1" />
            </Form.Item>
            <Form.Item name="locationName" label="库位名称">
              <Input placeholder="不填则与编码相同" />
            </Form.Item>
            <Form.Item name="capacity" label="容量上限" initialValue={100}>
              <Input type="number" placeholder="100" />
            </Form.Item>
          </Form>
        </div>
      </ResizableModal>

      {/* 批量初始化弹窗 */}
      <ResizableModal
        open={batchInitModalOpen}
        onCancel={() => { setBatchInitModalOpen(false); batchInitForm.resetFields(); }}
        title={`批量初始化库位 - ${selectedArea?.areaName || ''}`}
        width={500}
        onOk={handleBatchInit}
        okText="开始初始化"
      >
        <div style={{ padding: '8px 0' }}>
          <Form form={batchInitForm} layout="vertical">
            <Form.Item name="zoneNames" label="库区名称（逗号分隔）" extra="留空则使用默认库区">
              <Input placeholder="例如：A区-合格品,B区-待检品,C区-次品区" />
            </Form.Item>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="racksPerZone" label="每区货架数" initialValue={2}>
                  <Input type="number" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="levelsPerRack" label="每架层数" initialValue={3}>
                  <Input type="number" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="positionsPerLevel" label="每层位数" initialValue={2}>
                  <Input type="number" />
                </Form.Item>
              </Col>
            </Row>
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
              将生成 {selectedArea?.areaName || ''} 下的库位，编码格式：库区-货架-层-位（如 A-01-1-1）
            </div>
          </Form>
        </div>
      </ResizableModal>

      {/* 库位详情弹窗 */}
      <ResizableModal
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        title={selectedLocation ? `库位 ${selectedLocation.locationCode} - 库存详情` : '库存详情'}
        width={700}
        footer={null}
      >
        {selectedLocation && (
          <div className="wlm-detail-content">
            <Spin spinning={locationItemsLoading}>
              {locationItems.length === 0 && !locationItemsLoading ? (
                <Empty description="该库位暂无库存" />
              ) : (
                <>
                  <div className="wlm-detail-summary">
                    <Row gutter={16}>
                      <Col span={6}>
                        <div className="wlm-detail-label">库位编码</div>
                        <div className="wlm-detail-value">{selectedLocation.locationCode}</div>
                      </Col>
                      <Col span={6}>
                        <div className="wlm-detail-label">库位名称</div>
                        <div className="wlm-detail-value">{selectedLocation.locationName || '-'}</div>
                      </Col>
                      <Col span={6}>
                        <div className="wlm-detail-label">库区</div>
                        <div className="wlm-detail-value">{selectedLocation.zoneName || '-'}</div>
                      </Col>
                      <Col span={6}>
                        <div className="wlm-detail-label">容量</div>
                        <div className="wlm-detail-value" style={{ color: 'var(--color-primary)' }}>
                          {selectedLocation.usedCapacity}/{selectedLocation.capacity || '∞'}
                        </div>
                      </Col>
                    </Row>
                  </div>
                  <div className="wlm-detail-table">
                    <div className="wlm-detail-table-header">
                      <div className="wlm-detail-th">款号</div>
                      <div className="wlm-detail-th">颜色</div>
                      <div className="wlm-detail-th">尺码</div>
                      <div className="wlm-detail-th">SKU编码</div>
                      <div className="wlm-detail-th" style={{ textAlign: 'right' }}>库存数量</div>
                      <div className="wlm-detail-th" style={{ textAlign: 'right' }}>单价</div>
                    </div>
                    {locationItems.map((sku, idx) => (
                      <div key={idx} className="wlm-detail-tr">
                        <div className="wlm-detail-td">{sku.styleNo || '-'}</div>
                        <div className="wlm-detail-td">
                          <Tag color="blue">{sku.color || '-'}</Tag>
                        </div>
                        <div className="wlm-detail-td">
                          <Tag>{sku.size || '-'}</Tag>
                        </div>
                        <div className="wlm-detail-td" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                          {sku.skuCode}
                        </div>
                        <div className="wlm-detail-td" style={{ textAlign: 'right', color: 'var(--color-success)', fontWeight: 500 }}>
                          {sku.stockQuantity}
                        </div>
                        <div className="wlm-detail-td" style={{ textAlign: 'right', fontWeight: 500 }}>
                          ¥{sku.salesPrice?.toFixed(2) || sku.costPrice?.toFixed(2) || '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Spin>
          </div>
        )}
      </ResizableModal>
    </div>
  );
};

export default WarehouseLocationMap;
