import React from 'react';
import { Button, Alert, Tag, Form, InputNumber, Input, Select, Space, Row, Col, Card, Spin, Popconfirm, Typography, Tooltip } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { ToolOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { BatchSelectBundleRow } from '../../types';
import { isBundleBlockedForWarehousing } from '../../utils';
import { DEFECT_CATEGORY_OPTIONS, DEFECT_REMARK_OPTIONS } from '../../constants';
import UnqualifiedUpload from '../../components/WarehousingModal/components/UnqualifiedUpload';
import type { useWarehousingForm } from '../../components/WarehousingModal/hooks/useWarehousingForm';

const { Text } = Typography;

interface InspectFormPanelProps {
  formHook: ReturnType<typeof useWarehousingForm>;
  handleMarkRepaired: (bundleId: string) => void;
  markingRepairBundleId: string | null;
  onOpenBatchUnqualified: () => void;
  autoInitDone: boolean;
}

const InspectFormPanel: React.FC<InspectFormPanelProps> = ({
  formHook, handleMarkRepaired, markingRepairBundleId, onOpenBatchUnqualified, autoInitDone,
}) => {
  const {
    form: qcForm, submitLoading,
    batchSelectRows, batchSelectedBundleQrs, batchSelectableQrs,
    batchQtyByQr, batchSelectedSummary, batchSelectedHasBlocked,
    singleSelectedBundle, isSingleSelectedBundleBlocked, singleSelectedBundleRepairStats,
    handleBatchSelectionChange, handleBatchSelectAll, handleBatchSelectInvert, handleBatchSelectClear,
    handleBatchQualifiedSubmit, handleBatchUnqualifiedSubmit: _handleBatchUnqualifiedSubmit, handleSubmit: handleQcSubmit,
    uploadOneUnqualifiedImage, unqualifiedFileList, setUnqualifiedFileList,
    watchedWarehousingQty, watchedUnqualifiedQty,
    bundles: formBundles, orderOptionsLoading,
  } = formHook;

  const isMultiSelected = batchSelectedBundleQrs.length > 1;
  const isSingleSelected = batchSelectedBundleQrs.length === 1;
  const showQcForm = batchSelectedBundleQrs.length > 0;
  const unqQty = Number(watchedUnqualifiedQty || 0) || 0;
  const bundlesLoading = orderOptionsLoading || (!formBundles.length && !autoInitDone);

  return (
    <div>
      {/* 菲号列表 - 平铺显示 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Space>
            <Text strong style={{ fontSize: 14 }}>菲号列表</Text>
            <Tag color={batchSelectedBundleQrs.length ? 'blue' : 'default'}>
              已选 {batchSelectedBundleQrs.length}/{batchSelectRows.length}
            </Tag>
            {batchSelectedBundleQrs.length > 0 && (
              <Tag color="geekblue">合计 {batchSelectedSummary.totalQty} 件</Tag>
            )}
          </Space>
          <Space>
            <Button onClick={handleBatchSelectAll} disabled={!batchSelectableQrs.length}>全选</Button>
            <Button onClick={handleBatchSelectInvert} disabled={!batchSelectableQrs.length}>反选</Button>
            <Button onClick={handleBatchSelectClear} disabled={!batchSelectedBundleQrs.length}>清空</Button>
          </Space>
        </div>

        {batchSelectRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(0,0,0,0.45)' }}>
            {bundlesLoading ? <Spin spinning tip="正在加载菲号..."><div /></Spin> : '该订单暂无裁剪菲号'}
          </div>
        ) : (
          <ResizableTable<BatchSelectBundleRow>
            storageKey="inspect-bundle-table"
            rowKey="qr" pagination={false}
            dataSource={batchSelectRows}
            scroll={{ x: 680 }}
            rowSelection={{
              selectedRowKeys: batchSelectedBundleQrs,
              onChange: (keys, rows) => handleBatchSelectionChange(keys, rows as BatchSelectBundleRow[]),
              getCheckboxProps: (record) => ({ disabled: !!record.disabled }),
            }}
            columns={[
              { title: '菲号', dataIndex: 'qr', width: 100, ellipsis: true,
                render: (v: unknown) => { const t = String(v || '').split('|')[0].trim(); if (!t) return '-'; const parts = t.split('-'); return parts.length > 3 ? parts.slice(-3).join('-') : t; },
              },
              { title: '扎号', dataIndex: 'bundleNo', width: 60, render: (v: unknown) => v ? String(v) : '-' },
              { title: '颜色', dataIndex: 'color', width: 70, render: (v: unknown) => String(v || '') || '-' },
              { title: '码数', dataIndex: 'size', width: 60, render: (v: unknown) => String(v || '') || '-' },
              { title: '数量', dataIndex: 'quantity', width: 60, align: 'center' as const },
              {
                title: '可质检', dataIndex: 'availableQty', width: 60, align: 'center' as const,
                render: (v: number, record: BatchSelectBundleRow) => record.disabled ? <Text type="secondary">-</Text> : v,
              },
              {
                title: '状态', dataIndex: 'statusText', width: 120,
                render: (v: any, record: BatchSelectBundleRow) => {
                  const hints: string[] = record.stageHints || [];
                  const tagEl = record.disabled
                    ? <Tag color="default">{v || '不可质检'}</Tag>
                    : isBundleBlockedForWarehousing(record.rawStatus)
                      ? <Tag color="warning">{v}</Tag>
                      : <Tag color="processing">{v || '可质检'}</Tag>;
                  if (hints.length === 0) return tagEl;
                  return (
                    <Tooltip title={<div style={{ lineHeight: '22px' }}>{hints.map((h, i) => <div key={i}>{h}</div>)}</div>}>
                      <Space size={4}>{tagEl}<InfoCircleOutlined style={{ color: '#1890ff', fontSize: 12 }} /></Space>
                    </Tooltip>
                  );
                },
              },
              {
                title: '操作', key: 'action', width: 100,
                render: (_: any, record: BatchSelectBundleRow) => {
                  const isUnqualified = record.rawStatus === 'unqualified';
                  if (!isUnqualified || !record.bundleId) return null;
                  return (
                    <Popconfirm
                      title="确认标记已返修？"
                      description="工厂已将次品返修完成，接下来可重新进行质检"
                      onConfirm={() => handleMarkRepaired(record.bundleId!)}
                      okText="确认"
                      cancelText="取消"
                    >
                      <Button
                       
                        type="primary"
                        ghost
                        icon={<ToolOutlined />}
                        loading={markingRepairBundleId === record.bundleId}
                      >
                        标记已返修
                      </Button>
                    </Popconfirm>
                  );
                },
              },
            ]}
          />
        )}
      </div>
      {showQcForm && (
        <Card
          title={isMultiSelected ? `批量质检（${batchSelectedBundleQrs.length} 个菲号）` : '质检操作'}
          style={{ marginTop: 8 }}>
          <Form form={qcForm} layout="vertical">
            {/* 隐藏字段 */}
            <Form.Item name="orderNo" hidden><Input /></Form.Item>
            <Form.Item name="orderId" hidden><Input /></Form.Item>
            <Form.Item name="styleId" hidden><Input /></Form.Item>
            <Form.Item name="styleNo" hidden><Input /></Form.Item>
            <Form.Item name="styleName" hidden><Input /></Form.Item>
            <Form.Item name="cuttingBundleId" hidden><Input /></Form.Item>
            <Form.Item name="cuttingBundleNo" hidden><Input /></Form.Item>
            <Form.Item name="cuttingBundleQrCode" hidden><Input /></Form.Item>
            <Form.Item name="qualityStatus" hidden><Input /></Form.Item>
            <Form.Item name="unqualifiedImageUrls" hidden><Input /></Form.Item>

            {/* 已选菲号摘要 */}
            {isSingleSelected && singleSelectedBundle && (
              <Alert type="info" showIcon style={{ marginBottom: 12 }}
                title={`菲号: ${singleSelectedBundle.qrCode}  颜色: ${singleSelectedBundle.color || '-'}  码数: ${singleSelectedBundle.size || '-'}  质检数量: ${batchQtyByQr[String(singleSelectedBundle.qrCode || '').trim()] || singleSelectedBundle.quantity || 0}`}
              />
            )}
            {isMultiSelected && (
              <Alert type="info" showIcon style={{ marginBottom: 12 }}
                title={`已选 ${batchSelectedBundleQrs.length} 个菲号，合计 ${batchSelectedSummary.totalQty} 件`} />
            )}

            {/* 返修统计（单选且次品待返修）→ 提示可重新质检 */}
            {isSingleSelected && isSingleSelectedBundleBlocked && singleSelectedBundleRepairStats && (
              <Alert type="warning" style={{ marginBottom: 12 }}
                title="该菲号为次品待返修 — 可进行返修质检"
                description={`次品数量: ${singleSelectedBundleRepairStats.repairPool}  已返修: ${singleSelectedBundleRepairStats.repairedOut}  |  设置不合格数量为0即表示返修质检全部合格`}
              />
            )}

            {/* 批量模式：批量合格/不合格 */}
            {isMultiSelected && !batchSelectedHasBlocked && (
              <>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <Button type="primary" size="large" loading={submitLoading}
                    onClick={handleBatchQualifiedSubmit}>
                    批量合格质检（{batchSelectedSummary.totalQty} 件）
                  </Button>
                  <Button danger size="large" loading={submitLoading}
                    onClick={onOpenBatchUnqualified}>
                    批量不合格质检（{batchSelectedSummary.totalQty} 件）
                  </Button>
                  <Button onClick={handleBatchSelectClear}>取消</Button>
                </div>
              </>
            )}
            {isMultiSelected && batchSelectedHasBlocked && (
              <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                title="选中包含次品待返修菲号，请逐个处理或取消选择后再批量操作" />
            )}

            {/* 单选模式：完整质检表单 */}
            {isSingleSelected && (
              <>
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item name="warehousingQuantity" label="质检数量">
                      <InputNumber style={{ width: '100%' }} disabled />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="qualifiedQuantity" label="合格数量">
                      <InputNumber style={{ width: '100%' }} disabled />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="unqualifiedQuantity" label="不合格数量">
                      <InputNumber
                        style={{ width: '100%' }}
                        min={0}
                        max={Number(watchedWarehousingQty || 0) || 0}
                        onChange={(val) => {
                          const total = Number(watchedWarehousingQty || 0) || 0;
                          const unq = Math.max(0, Math.min(total, Number(val || 0) || 0));
                          qcForm.setFieldsValue({
                            unqualifiedQuantity: unq,
                            qualifiedQuantity: Math.max(0, total - unq),
                            qualityStatus: unq > 0 ? 'unqualified' : 'qualified',
                          });
                        }}
                      />
                    </Form.Item>
                  </Col>
                </Row>

                {unqQty > 0 && (
                  <>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name="defectCategory" label="次品类别"
                          rules={[{ required: true, message: '请选择次品类别' }]}>
                          <Select options={DEFECT_CATEGORY_OPTIONS} placeholder="请选择" allowClear />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="defectRemark" label="处理方式"
                          rules={[{ required: true, message: '请选择处理方式' }]}>
                          <Select options={DEFECT_REMARK_OPTIONS} placeholder="请选择" allowClear />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Form.Item label="不合格图片">
                      <UnqualifiedUpload
                        fileList={unqualifiedFileList}
                        disabled={submitLoading}
                        onUpload={uploadOneUnqualifiedImage}
                        onRemove={(file) => {
                          setUnqualifiedFileList((prev) => {
                            const next = prev.filter((f) => f.uid !== file.uid);
                            qcForm.setFieldsValue({
                              unqualifiedImageUrls: JSON.stringify(
                                next.map((f: any) => String(f?.url || '').trim()).filter(Boolean)
                              ),
                            });
                            return next;
                          });
                        }}
                        onPreview={() => {}}
                      />
                    </Form.Item>

                    <Form.Item name="repairRemark" label="返修备注">
                      <Input.TextArea rows={2} placeholder="返修说明" />
                    </Form.Item>
                  </>
                )}

                {/* 返修质检合格时也显示备注字段（后端需要 repairRemark） */}
                {unqQty === 0 && isSingleSelectedBundleBlocked && (
                  <Form.Item name="repairRemark" label="返修备注" initialValue="返修检验合格">
                    <Input.TextArea rows={2} placeholder="返修检验说明" />
                  </Form.Item>
                )}

                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <Button type="primary" size="large" loading={submitLoading} onClick={handleQcSubmit}>
                    {isSingleSelectedBundleBlocked ? '返修质检' : '确定'}
                  </Button>
                  <Button onClick={handleBatchSelectClear}>取消选择</Button>
                </div>
              </>
            )}
          </Form>
        </Card>
      )}

      {!showQcForm && batchSelectRows.length > 0 && (
        <Alert type="info" showIcon style={{ marginTop: 8 }}
          title="请勾选上方菲号，开始质检操作" />
      )}
    </div>
  );
};

export default InspectFormPanel;
