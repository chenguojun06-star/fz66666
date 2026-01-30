import React from 'react';
import { Button, Card, Form, Input, Select, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { MaterialQueryParams } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS, MATERIAL_TYPES } from '@/constants/business';

const { Option } = Select;

interface MaterialSearchFormProps {
  queryParams: MaterialQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<MaterialQueryParams>>;
  onSearch: () => void;
  onReset: () => void;
}

const MaterialSearchForm: React.FC<MaterialSearchFormProps> = ({
  queryParams,
  setQueryParams,
  onSearch,
  onReset,
}) => {
  return (
    <Card size="small" className="filter-card mb-sm">
      <Form layout="inline" size="small">
        <Form.Item label="面料辅料类型">
          <Select
            placeholder="请选择面料辅料类型"
            value={queryParams.materialType || ''}
            onChange={(value) => setQueryParams(prev => ({ ...prev, materialType: value, page: 1 }))}
            style={{ width: 160 }}
          >
            <Option value="">全部</Option>
            <Option value="fabric">面料</Option>
            <Option value="fabricA">面料A</Option>
            <Option value="fabricB">面料B</Option>
            <Option value="fabricC">面料C</Option>
            <Option value="fabricD">面料D</Option>
            <Option value="fabricE">面料E</Option>
            <Option value="lining">里料</Option>
            <Option value="liningA">里料A</Option>
            <Option value="liningB">里料B</Option>
            <Option value="liningC">里料C</Option>
            <Option value="liningD">里料D</Option>
            <Option value="liningE">里料E</Option>
            <Option value="accessory">辅料</Option>
            <Option value="accessoryA">辅料A</Option>
            <Option value="accessoryB">辅料B</Option>
            <Option value="accessoryC">辅料C</Option>
            <Option value="accessoryD">辅料D</Option>
            <Option value="accessoryE">辅料E</Option>
          </Select>
        </Form.Item>
        <Form.Item label="订单号">
          <Input
            placeholder="请输入订单号"
            value={queryParams.orderNo}
            onChange={(e) => setQueryParams(prev => ({ ...prev, orderNo: e.target.value }))}
            style={{ width: 150 }}
          />
        </Form.Item>
        <Form.Item label="采购单号">
          <Input
            placeholder="请输入采购单号"
            onChange={(e) => setQueryParams(prev => ({ ...prev, purchaseNo: e.target.value }))}
            style={{ width: 150 }}
          />
        </Form.Item>
        <Form.Item label="物料编码">
          <Input
            placeholder="请输入物料编码"
            onChange={(e) => setQueryParams(prev => ({ ...prev, materialCode: e.target.value }))}
            style={{ width: 120 }}
          />
        </Form.Item>
        <Form.Item label="物料名称">
          <Input
            placeholder="请输入物料名称"
            onChange={(e) => setQueryParams(prev => ({ ...prev, materialName: e.target.value }))}
            style={{ width: 120 }}
          />
        </Form.Item>
        <Form.Item label="供应商">
          <Input
            placeholder="请输入供应商"
            onChange={(e) => setQueryParams(prev => ({ ...prev, supplier: e.target.value }))}
            style={{ width: 120 }}
          />
        </Form.Item>
        <Form.Item label="状态">
          <Select
            placeholder="请选择状态"
            onChange={(value) => setQueryParams(prev => ({ ...prev, status: value }))}
            style={{ width: 100 }}
          >
            <Option value="">全部</Option>
            <Option value={MATERIAL_PURCHASE_STATUS.PENDING}>待采购</Option>
            <Option value={MATERIAL_PURCHASE_STATUS.RECEIVED}>已领取</Option>
            <Option value={MATERIAL_PURCHASE_STATUS.PARTIAL}>部分到货</Option>
            <Option value={MATERIAL_PURCHASE_STATUS.COMPLETED}>全部到货</Option>
            <Option value={MATERIAL_PURCHASE_STATUS.CANCELLED}>已取消</Option>
          </Select>
        </Form.Item>
        <Form.Item label="来源">
          <Select
            placeholder="请选择来源"
            value={queryParams.sourceType || ''}
            onChange={(value) => setQueryParams(prev => ({ ...prev, sourceType: value, page: 1 }))}
            style={{ width: 100 }}
          >
            <Option value="">全部</Option>
            <Option value="order">订单</Option>
            <Option value="sample">样衣</Option>
          </Select>
        </Form.Item>
        <Form.Item className="filter-actions">
          <Space>
            <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}>
              查询
            </Button>
            <Button onClick={onReset}>
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default MaterialSearchForm;
