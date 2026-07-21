// 3 个表单弹窗：新建仓库 / 新增库位 / 批量初始化
import React from 'react';
import { Input, Select, Form, Row, Col } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { WAREHOUSE_TYPE_OPTIONS } from './types';
import type { WarehouseAreaItem } from './types';

interface ZoneItem {
  name: string;
  code: string;
}

interface Props {
  // 新建仓库
  createAreaModalOpen: boolean;
  createAreaForm: FormInstance;
  onCreateArea: () => void;
  onCancelCreateArea: () => void;
  // 新增库位
  createLocationModalOpen: boolean;
  createLocationForm: FormInstance;
  onCreateLocation: () => void;
  onCancelCreateLocation: () => void;
  selectedArea?: WarehouseAreaItem;
  zones: ZoneItem[];
  // 批量初始化
  batchInitModalOpen: boolean;
  batchInitForm: FormInstance;
  onBatchInit: () => void;
  onCancelBatchInit: () => void;
}

const FormModals: React.FC<Props> = ({
  createAreaModalOpen,
  createAreaForm,
  onCreateArea,
  onCancelCreateArea,
  createLocationModalOpen,
  createLocationForm,
  onCreateLocation,
  onCancelCreateLocation,
  selectedArea,
  zones,
  batchInitModalOpen,
  batchInitForm,
  onBatchInit,
  onCancelBatchInit,
}) => {
  return (
    <>
      {/* 新建仓库弹窗 */}
      <ResizableModal
        open={createAreaModalOpen}
        onCancel={onCancelCreateArea}
        title="新建仓库"
        width="30vw"
        onOk={onCreateArea}
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
        onCancel={onCancelCreateLocation}
        title={`新增库位 - ${selectedArea?.areaName || ''}`}
        width="30vw"
        onOk={onCreateLocation}
        okText="创建"
      >
        <div style={{ padding: '8px 0' }}>
          <Form form={createLocationForm} layout="vertical">
            <Form.Item name="zoneName" label="库区名称" rules={[{ required: true, message: '请输入库区名称' }]}>
              <Select
                mode="tags"
                maxCount={1}
                placeholder="输入或选择已有库区"
                options={zones.map(z => ({ label: z.name, value: z.name }))}
              />
            </Form.Item>
            <Form.Item name="zoneCode" label="库区编码" extra="留空自动取库区首字母">
              <Input placeholder="自动生成" maxLength={1} />
            </Form.Item>
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="rackNum" label="货架号" rules={[{ required: true, message: '必填' }]} initialValue="01">
                  <Input placeholder="01" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="levelNum" label="层" rules={[{ required: true, message: '必填' }]} initialValue={1}>
                  <Input type="number" min={1} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="positionNum" label="位" rules={[{ required: true, message: '必填' }]} initialValue={1}>
                  <Input type="number" min={1} />
                </Form.Item>
              </Col>
            </Row>
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>
              编码格式：{createLocationForm.getFieldValue('zoneCode') || 'A'}-{String(createLocationForm.getFieldValue('rackNum') || '01').padStart(2,'0')}-{createLocationForm.getFieldValue('levelNum') || 1}-{createLocationForm.getFieldValue('positionNum') || 1}
            </div>
            <Form.Item name="capacity" label="容量上限" initialValue={100} style={{ marginTop: 12 }}>
              <Input type="number" placeholder="100" />
            </Form.Item>
          </Form>
        </div>
      </ResizableModal>

      {/* 批量初始化弹窗 */}
      <ResizableModal
        open={batchInitModalOpen}
        onCancel={onCancelBatchInit}
        title={`批量初始化库位 - ${selectedArea?.areaName || ''}`}
        width="30vw"
        onOk={onBatchInit}
        okText="开始初始化"
      >
        <div style={{ padding: '8px 0' }}>
          <Form form={batchInitForm} layout="vertical">
            <Form.Item name="zoneName" label="库区名称" rules={[{ required: true, message: '请输入库区名称' }]} initialValue="A区">
              <Input placeholder="例如：A区" />
            </Form.Item>
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="rackCount" label="货架数" initialValue={2}>
                  <Input type="number" min={1} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="levelCount" label="每架层数" initialValue={3}>
                  <Input type="number" min={1} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="positionCount" label="每层位数" initialValue={2}>
                  <Input type="number" min={1} />
                </Form.Item>
              </Col>
            </Row>
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>
              将生成 {(batchInitForm.getFieldValue('rackCount') || 2) * (batchInitForm.getFieldValue('levelCount') || 3) * (batchInitForm.getFieldValue('positionCount') || 2)} 个库位，编码如 A-01-1-1 到 A-{(String(batchInitForm.getFieldValue('rackCount') || 2)).padStart(2,'0')}-{batchInitForm.getFieldValue('levelCount') || 3}-{batchInitForm.getFieldValue('positionCount') || 2}
            </div>
          </Form>
        </div>
      </ResizableModal>
    </>
  );
};

export default FormModals;
