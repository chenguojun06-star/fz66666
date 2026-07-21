import React from 'react';
import { Form, Input, Select, Row, Col } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { SampleTypeMap } from '../types';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { useInboundModalData } from './useInboundModalData';
import StyleSnapshotPanel from './StyleSnapshotPanel';
import InboundPlanTable from './InboundPlanTable';
import { normalizeText } from './helpers';
import type { InboundModalProps } from './types';

const { Option } = Select;

const InboundModal: React.FC<InboundModalProps> = (props) => {
  const { visible, onCancel } = props;
  const [form] = Form.useForm();
  const {
    loading,
    smartError,
    prefillLoading,
    styleSnapshot,
    showSmartErrorNotice,
    styleNoRef,
    sampleWarehouseOptions,
    sampleLocationOptions,
    sampleLocationLoading,
    sampleSelectedAreaId,
    setSampleSelectedAreaId,
    hydrateStyleFields,
    handleOk,
  } = useInboundModalData(form, props);

  return (
    <ResizableModal
      title="样衣入库 (支持扫码)"
      open={visible}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      width="85vw" maskClosable={false}
      initialHeight={Math.round(window.innerHeight * 0.82)}
    >
      {showSmartErrorNotice && smartError ? (
        <div style={{ marginBottom: 12 }}>
          <SmartErrorNotice
            error={smartError}
            onFix={() => {
              void handleOk();
            }}
          />
        </div>
      ) : null}

      <Form form={form} layout="vertical" onFinish={handleOk}>
        {(styleSnapshot?.styleNo || styleSnapshot?.styleName || styleSnapshot?.cover) && styleSnapshot ? (
          <StyleSnapshotPanel snapshot={styleSnapshot} />
        ) : null}

        {/* 第一行：款号、款式名称、样衣类型 */}
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="styleNo"
              label="款号"
              rules={[{ required: true, message: '请输入款号' }]}
              help="扫码枪可直接录入"
            >
              <Input
                ref={styleNoRef}
                placeholder="请输入款号 / 扫码"
                onBlur={() => {
                  const styleNo = normalizeText(form.getFieldValue('styleNo'));
                  if (styleNo) {
                    void hydrateStyleFields(styleNo);
                  }
                }}
                onPressEnter={async (e) => {
                  e.preventDefault();
                  const styleNo = normalizeText(form.getFieldValue('styleNo'));
                  if (styleNo) {
                    await hydrateStyleFields(styleNo);
                  }
                }}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="styleName" label="款式名称">
              <Input placeholder="自动带入款式名称" readOnly />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="sampleType"
              label="样衣类型"
              rules={[{ required: true, message: '请选择样衣类型' }]}
              initialValue="development"
            >
              <Select disabled>
                {Object.entries(SampleTypeMap).map(([key, label]) => (
                  <Option key={key} value={key}>{label}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>系统匹配入库明细</div>
          <InboundPlanTable prefillLoading={prefillLoading} planRows={styleSnapshot?.planRows} />
        </div>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="仓库" name="warehouseAreaId">
              <Select
                placeholder="请选择仓库"
                allowClear
                style={{ width: '100%' }}
                onChange={(areaId: string) => {
                  setSampleSelectedAreaId(areaId);
                  form.setFieldValue('warehouseLocation', undefined);
                }}
              >
                {sampleWarehouseOptions.length > 0
                  ? sampleWarehouseOptions.map(opt => (
                    <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                  ))
                  : <Option value="" disabled>暂无仓库，请前往库位地图创建</Option>
                }
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="warehouseLocation" label="库位">
              <Select
                placeholder={sampleSelectedAreaId ? '请选择库位' : '请先选择仓库'}
                allowClear
                showSearch
                loading={sampleLocationLoading}
                disabled={!sampleSelectedAreaId}
                notFoundContent={sampleLocationLoading ? '加载中...' : sampleSelectedAreaId ? '该仓库暂无库位' : '请先选择仓库'}
                filterOption={(input, option) => (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase()) ?? false}
              >
                {sampleLocationOptions.map(opt => (
                  <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </ResizableModal>
  );
};

export default InboundModal;
