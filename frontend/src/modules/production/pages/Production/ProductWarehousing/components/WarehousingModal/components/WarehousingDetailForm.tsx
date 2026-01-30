import React from 'react';
import { Form, Input, InputNumber, Select, Row, Col } from 'antd';
import { DEFECT_CATEGORY_OPTIONS, DEFECT_REMARK_OPTIONS } from '../../../constants';
import { ProductWarehousing } from '@/types/production';

const { Option } = Select;

interface WarehousingDetailFormProps {
  form: any;
  currentWarehousing: ProductWarehousing;
}

const WarehousingDetailForm: React.FC<WarehousingDetailFormProps> = ({ form }) => {
  return (
    <Form form={form} layout="vertical">
      <Row gutter={16}>
        <Col xs={24} sm={12} lg={6}>
          <Form.Item name="warehousingNo" label="质检入库号">
            <Input disabled />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Form.Item name="orderNo" label="订单号">
            <Input disabled />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Form.Item name="styleNo" label="款号">
            <Input disabled />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Form.Item name="styleName" label="款名">
            <Input disabled />
          </Form.Item>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Form.Item name="warehousingQuantity" label="质检数量">
            <InputNumber disabled style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Form.Item name="qualifiedQuantity" label="合格数量">
            <InputNumber disabled style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Form.Item name="unqualifiedQuantity" label="不合格数量">
            <InputNumber disabled style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Form.Item name="warehouse" label="仓库">
            <Input disabled />
          </Form.Item>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Form.Item name="qualityStatus" label="质检状态">
            <Select disabled>
              <Option value="qualified">合格</Option>
              <Option value="unqualified">不合格</Option>
            </Select>
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Form.Item name="defectCategory" label="次品类别">
            <Select disabled options={DEFECT_CATEGORY_OPTIONS} placeholder="-" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Form.Item name="defectRemark" label="处理方式">
            <Select disabled options={DEFECT_REMARK_OPTIONS} placeholder="-" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Form.Item name="repairRemark" label="返修备注">
            <Input disabled />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} lg={18}>
          <Form.Item name="createTime" label="质检时间">
            <Input disabled />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
};

export default WarehousingDetailForm;
