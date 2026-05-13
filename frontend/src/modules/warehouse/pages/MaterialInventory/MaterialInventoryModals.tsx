import React from 'react';
import {
  Card,
  Button,
  Space,
  Input,
  Tag,
  Form,
  Select,
  Row,
  Col,
  InputNumber,
} from 'antd';
import WarehouseLocationAutoComplete from '@/components/common/WarehouseLocationAutoComplete';
import { useWarehouseAreaOptions } from '@/hooks/useWarehouseAreaOptions';
import {
  ScanOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import SupplierSelect from '@/components/common/SupplierSelect';
import { getBaseMaterialTypeLabel, getMaterialTypeCategory } from '@/utils/materialType';
import MaterialOutboundPrintModal from './components/MaterialOutboundPrintModal';
import MaterialInfoCard from './components/MaterialInfoCard';
import OutboundModal from './components/OutboundModal';
import StandardModal from '@/components/common/StandardModal';
import SmallModal from '@/components/common/SmallModal';

import type { useMaterialInventoryData } from './hooks/useMaterialInventoryData';

const { Option } = Select;

interface MaterialInventoryModalsProps {
  inventoryData: ReturnType<typeof useMaterialInventoryData>;
}

const MaterialInventoryModals: React.FC<MaterialInventoryModalsProps> = ({
  inventoryData,
}) => {
  const { selectOptions: materialWarehouseOptions } = useWarehouseAreaOptions('MATERIAL');
  const {
    instructionVisible,
    closeInstruction,
    handleSendInstruction,
    instructionSubmitting,
    instructionForm,
    instructionTarget,
    dbSearchLoading,
    dbMaterialOptions,
    handleMaterialSelect,
    searchMaterialFromDatabase,
    receiverOptions,
    safetyStockVisible,
    setSafetyStockVisible,
    safetyStockSubmitting,
    handleSafetyStockSave,
    safetyStockTarget,
    safetyStockValue,
    setSafetyStockValue,
    detailModal,
    txLoading,
    txList,
    inboundModal,
    inboundForm,
    handleInboundConfirm,
    outboundModal,
    outboundForm,
    handleOutboundConfirm,
    batchDetails,
    setBatchDetails,
    handleBatchQtyChange,
    factoryOptions,
    outboundOrderOptions,
    handleOutboundOrderInput,
    handleOutboundOrderSelect,
    handleOutboundFactoryInput,
    loadFactoryWorkers,
    loadReceivers,
    autoMatchOutboundContext,
    rollModal,
    rollForm,
    generatingRolls,
    handleGenerateRollLabels,
    printModal,
  } = inventoryData;

  return (
    <>
      {/* 下发采购指令弹窗 */}
      <StandardModal
        title="下发采购指令"
        open={instructionVisible}
        onCancel={closeInstruction}
        onOk={handleSendInstruction}
        confirmLoading={instructionSubmitting}
        okText="下发"
        centered
        size="lg"
      >
        <Form form={instructionForm} layout="vertical">
          {!instructionTarget && (
            <Form.Item
              name="materialSelect"
              label="选择物料"
              rules={[{ required: true, message: '请选择物料' }]}
            >
              <Select
                showSearch
                placeholder="输入物料名称或编码搜索数据库"
                loading={dbSearchLoading}
                options={dbMaterialOptions}
                onChange={handleMaterialSelect}
                onSearch={searchMaterialFromDatabase}
                filterOption={false}
                notFoundContent={dbSearchLoading ? '搜索中...' : '请输入物料名称或编码搜索'}
              />
            </Form.Item>
          )}
          <Form.Item label="物料信息">
            <MaterialInfoCard
              materialCode={instructionTarget?.materialCode}
              materialName={instructionTarget?.materialName}
              materialType={instructionTarget?.materialType}
              color={instructionTarget?.color}
              unit={instructionTarget?.unit}
              supplierName={instructionTarget?.supplierName}
              specification={instructionTarget?.specification}
              fabricWidth={instructionTarget?.fabricWidth}
              fabricWeight={instructionTarget?.fabricWeight}
              fabricComposition={instructionTarget?.fabricComposition}
              unitPrice={instructionTarget?.unitPrice}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="purchaseQuantity"
                label="*需求数量"
                rules={[{ required: true, message: '请输入需求数量' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} placeholder="自动计算为安全库存缺口" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="receiverId"
                label="*采购人"
                rules={[{ required: true, message: '请选择采购人' }]}
              >
                <Select
                  showSearch
                  placeholder="自动识别为当前登录用户"
                  options={receiverOptions}
                  onChange={(value) => {
                    const hit = receiverOptions.find((item) => item.value === value);
                    instructionForm.setFieldsValue({ receiverName: hit?.name || '' });
                  }}
                  filterOption={(input, option) =>
                    String(option?.label || '').toLowerCase().includes(String(input || '').toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="receiverName" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="可选" />
          </Form.Item>
        </Form>
      </StandardModal>

      {/* 安全库存编辑弹窗 */}
      <SmallModal
        title="设置安全库存"
        open={safetyStockVisible}
        onCancel={() => setSafetyStockVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setSafetyStockVisible(false)}>取消</Button>,
          <Button key="save" type="primary" loading={safetyStockSubmitting} onClick={handleSafetyStockSave}>
            保存
          </Button>,
        ]}
      >
        {safetyStockTarget && (
          <div>
            <Card style={{ marginBottom: 16, background: 'var(--color-bg-subtle)' }}>
              <div><strong>{safetyStockTarget.materialCode}</strong> <Tag color={getMaterialTypeCategory(safetyStockTarget.materialType) === 'fabric' ? 'blue' : getMaterialTypeCategory(safetyStockTarget.materialType) === 'lining' ? 'cyan' : 'green'}>{getBaseMaterialTypeLabel(safetyStockTarget.materialType)}</Tag></div>
              <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', marginTop: 4 }}>{safetyStockTarget.materialName}</div>
              <div style={{ fontSize: "var(--font-size-sm)", marginTop: 4 }}>
                当前库存: <strong>{safetyStockTarget.quantity ?? 0}</strong> {safetyStockTarget.unit}
              </div>
            </Card>
            <div style={{ marginBottom: 8 }}>安全库存（低于此值将触发预警）</div>
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={999999}
              value={safetyStockValue}
              onChange={(v) => setSafetyStockValue(v ?? 0)}
              suffix={safetyStockTarget.unit || '件'}
              placeholder="请输入安全库存"
            />
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginTop: 8 }}>
              提示：当库存低于安全库存时，系统将在仓库看板和面辅料预警中显示该物料
            </div>
          </div>
        )}
      </SmallModal>

      {/* 详情模态框 - 出入库记录 */}
      <StandardModal
        title="出入库记录"
        open={detailModal.visible}
        onCancel={detailModal.close}
        footer={[
          <Button key="close" onClick={detailModal.close}>
            关闭
          </Button>,
        ]}
        size="lg"
      >
        {detailModal.data && (
          <div>
            <Card style={{ marginBottom: 16, background: 'var(--color-bg-subtle)' }}>
              <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                <div>
                  <strong style={{ fontSize: "var(--font-size-lg)" }}>{detailModal.data.materialCode}</strong>
                  <Tag color={getMaterialTypeCategory(detailModal.data.materialType) === 'fabric' ? 'blue' : getMaterialTypeCategory(detailModal.data.materialType) === 'lining' ? 'cyan' : 'green'} style={{ marginLeft: 8 }}>{getBaseMaterialTypeLabel(detailModal.data.materialType)}</Tag>
                </div>
                <div style={{ fontSize: "var(--font-size-base)" }}>{detailModal.data.materialName}</div>
              </Space>
            </Card>

            <ResizableTable
              storageKey="material-inventory-details"
             
              loading={txLoading}
              dataSource={txList}
              rowKey={(_, idx) => String(idx)}
              columns={[
                {
                  title: '类型',
                  dataIndex: 'typeLabel',
                  width: 80,
                  render: (text: string, record: any) => (
                    <Tag color={record.type === 'IN' ? 'blue' : 'orange'}>{text || record.type}</Tag>
                  ),
                },
                {
                  title: '日期',
                  dataIndex: 'operationTime',
                  width: 160,
                  render: (v: string) => v || '-',
                },
                {
                  title: '数量',
                  dataIndex: 'quantity',
                  width: 100,
                  render: (v: number) => `${v} ${detailModal.data?.unit || ''}`,
                },
                {
                  title: '操作人',
                  dataIndex: 'operatorName',
                  width: 100,
                  render: (v: string) => v || '-',
                },
                {
                  title: '库位',
                  dataIndex: 'warehouseLocation',
                  width: 100,
                  render: (v: string) => v || '-',
                },
                {
                  title: '备注',
                  dataIndex: 'remark',
                  render: (v: string) => v || '-',
                },
              ]}
              pagination={false}
            />
          </div>
        )}
      </StandardModal>

      {/* 入库模态框 */}
      <StandardModal
        title={
          <Space>
            <ScanOutlined style={{ color: 'var(--primary-color)' }} />
            扫码入库
          </Space>
        }
        open={inboundModal.visible}
        onCancel={() => {
          inboundModal.close();
          inboundForm.resetFields();
        }}
        onOk={handleInboundConfirm}
        size="lg"
      >
        <Form form={inboundForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            label="物料编号"
            name="materialCode"
            rules={[{ required: true, message: '请输入或扫码物料编号' }]}
          >
            <Input placeholder="请扫码或手动输入物料编号" prefix={<ScanOutlined />} size="large" />
          </Form.Item>

          <Row gutter={12}>
            <Col span={9}>
              <Form.Item label="物料名称" name="materialName">
                <Input disabled placeholder="扫码后自动填充" />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item label="物料类型" name="materialType">
                <Select disabled placeholder="自动识别">
                  <Option value="fabric">面料</Option>
                  <Option value="lining">里料</Option>
                  <Option value="accessory">辅料</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item label="颜色" name="color">
                <Input placeholder="如: 蓝色" />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item label="规格/幅宽" name="specification">
                <Input placeholder="如: 150cm" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="supplierId" hidden><Input /></Form.Item>
          <Form.Item name="supplierContactPerson" hidden><Input /></Form.Item>
          <Form.Item name="supplierContactPhone" hidden><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item label="供应商" name="supplierName">
                <SupplierSelect
                  placeholder="选择供应商"
                  onChange={(value, option) => {
                    if (option) {
                      inboundForm.setFieldsValue({
                        supplierId: option.id,
                        supplierContactPerson: option.supplierContactPerson,
                        supplierContactPhone: option.supplierContactPhone,
                      });
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item
                label="入库数量"
                name="quantity"
                rules={[{ required: true, message: '请输入入库数量' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} placeholder="数量" />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item label="仓库">
                <Select
                  placeholder="请选择仓库"
                  defaultValue={materialWarehouseOptions[0]?.label || '物料仓库'}
                  style={{ width: '100%' }}
                >
                  {materialWarehouseOptions.length > 0
                    ? materialWarehouseOptions.map(opt => (
                      <Option key={opt.value} value={opt.label as string}>{opt.label}</Option>
                    ))
                    : <Option value="物料仓库">物料仓库</Option>
                  }
                </Select>
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item
                label="库位"
                name="warehouseLocation"
                rules={[{ required: true, message: '请选择库位' }]}
              >
                <WarehouseLocationAutoComplete
                  warehouseType="MATERIAL"
                  placeholder="请选择或输入库位"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.materialType !== currentValues.materialType}>
            {({ getFieldValue }) => {
              const materialType = getFieldValue('materialType');
              if (getMaterialTypeCategory(materialType) !== 'fabric') return null;
              return (
                <Row gutter={12} style={{ background: '#f0f7ff', borderRadius: 6, padding: '8px 6px 0', marginBottom: 12 }}>
                  <Col span={24} style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--primary-color)' }}> 面料属性</span>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="幅宽" name="fabricWidth">
                      <Input placeholder="如: 150cm" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="克重" name="fabricWeight">
                      <Input placeholder="如: 200g/m²" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="成分" name="fabricComposition">
                      <Input placeholder="如: 100%棉" />
                    </Form.Item>
                  </Col>
                </Row>
              );
            }}
          </Form.Item>

          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={2} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </StandardModal>

      {/* 出库模态框 */}
      <OutboundModal
        outboundModal={outboundModal}
        outboundForm={outboundForm}
        handleOutboundConfirm={handleOutboundConfirm}
        batchDetails={batchDetails}
        setBatchDetails={setBatchDetails}
        handleBatchQtyChange={handleBatchQtyChange}
        factoryOptions={factoryOptions}
        outboundOrderOptions={outboundOrderOptions}
        handleOutboundOrderInput={handleOutboundOrderInput}
        handleOutboundOrderSelect={handleOutboundOrderSelect}
        handleOutboundFactoryInput={handleOutboundFactoryInput}
        loadFactoryWorkers={loadFactoryWorkers}
        loadReceivers={loadReceivers}
        receiverOptions={receiverOptions}
        autoMatchOutboundContext={autoMatchOutboundContext}
      />

      {/* 料卷/箱标签生成弹窗 */}
      <SmallModal
        title="生成料卷/箱二维码标签"
        open={rollModal.visible}
        onCancel={rollModal.close}
        footer={[
          <Button key="cancel" onClick={rollModal.close}>取消</Button>,
          <Button
            key="ok"
            type="primary"
            loading={generatingRolls}
            onClick={handleGenerateRollLabels}
          >
            生成并打印
          </Button>,
        ]}
      >
        {rollModal.data && (
          <div style={{ padding: '8px 0' }}>
            <p style={{ marginBottom: 16, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              物料：<strong>{rollModal.data.materialName}</strong>（{rollModal.data.materialCode}）
            </p>
            <Form form={rollForm} layout="vertical">
              <Form.Item
                name="rollCount"
                label="共几卷/箱（张标签数）"
                rules={[{ required: true, message: '请填写卷数' }]}
              >
                <InputNumber min={1} max={200} style={{ width: '100%' }} placeholder="例如：5" />
              </Form.Item>
              <Form.Item
                name="quantityPerRoll"
                label="每卷/箱数量"
                rules={[{ required: true, message: '请填写每卷数量' }]}
              >
                <InputNumber min={0.01} style={{ width: '100%' }} placeholder="例如：30" />
              </Form.Item>
              <Form.Item name="unit" label="单位" initialValue="件">
                <Select>
                  <Select.Option value="件">件</Select.Option>
                  <Select.Option value="米">米</Select.Option>
                  <Select.Option value="kg">kg</Select.Option>
                  <Select.Option value="码">码</Select.Option>
                  <Select.Option value="卷">卷</Select.Option>
                  <Select.Option value="箱">箱</Select.Option>
                </Select>
              </Form.Item>
            </Form>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 8 }}>
              生成后会弹出打印窗口，每张标签含二维码。仓管扫码（MR开头）即可确认发料。
            </p>
          </div>
        )}
      </SmallModal>

      <MaterialOutboundPrintModal
        open={printModal.visible}
        data={printModal.data}
        onClose={() => printModal.close()}
      />
    </>
  );
};

export default MaterialInventoryModals;
