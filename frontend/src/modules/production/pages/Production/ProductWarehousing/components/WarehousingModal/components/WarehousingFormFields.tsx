import React, { useState, useEffect } from 'react';
import { Form, Input, InputNumber, Select, Button, Space, Tag } from 'antd';
import { StyleCoverThumb } from '@/components/StyleAssets';
import WarehouseLocationAutoComplete from '@/components/common/WarehouseLocationAutoComplete';
import { useWarehouseAreaOptions } from '@/hooks/useWarehouseAreaOptions';
import { COVER_SIZE, DEFECT_CATEGORY_OPTIONS, DEFECT_REMARK_OPTIONS } from '../../../constants';
import BatchSelectionPanel from './BatchSelectionPanel';
import MultiImageUploadBox from '@/components/common/MultiImageUploadBox';
import AiQualityHelper from './AiQualityHelper';
import { useWarehousingForm } from '../hooks/useWarehousingForm';

const { Option: _Option } = Select;

interface WarehousingFormFieldsProps {
  hook: ReturnType<typeof useWarehousingForm>;
  openPreview: (url: string, title: string) => void;
  onCancel: () => void;
}

const WarehousingFormFields: React.FC<WarehousingFormFieldsProps> = ({ hook, openPreview: _openPreview, onCancel }) => {
  const watchedOrderIdForAi = Form.useWatch('orderId', hook.form);
  const watchedDefectCategoryForAi = Form.useWatch('defectCategory', hook.form);
  const { selectOptions: finishedWarehouseOptions, areas } = useWarehouseAreaOptions('FINISHED');
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');

  useEffect(() => {
    if (areas.length > 0 && !selectedAreaId) {
      setSelectedAreaId(areas[0].id);
    }
  }, [areas, selectedAreaId]);

  const {
    form,
    submitLoading,
    orderOptions,
    orderOptionsLoading,
    bundles,
    watchedStyleId,
    watchedBundleQr,
    watchedWarehousingQty,
    watchedUnqualifiedQty,
    batchSelectedBundleQrs,
    batchQtyByQr,
    batchSelectRows,
    batchSelectableQrs,
    batchSelectedSummary,
    batchSelectedHasBlocked,
    singleSelectedBundle,
    isSingleSelectedBundleBlocked,
    singleSelectedBundleRepairStats,
    bundleRepairRemainingByQr,
    setBatchQtyByQr,
    setBatchSelectedBundleQrs,
    setUnqualifiedImageUrls,
    handleOrderChange,
    handleBatchSelectAll,
    handleBatchSelectInvert,
    handleBatchSelectClear,
    handleBatchSelectionChange,
    handleSubmit,
    handleBatchQualifiedSubmit,
  } = hook;

  return (
    <Form form={form} layout="vertical">
      <Form.Item name="orderNo" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="styleId" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="cuttingBundleId" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="cuttingBundleNo" hidden>
        <InputNumber />
      </Form.Item>
      <Form.Item name="cuttingBundleQrCode" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="qualityStatus" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="unqualifiedImageUrls" hidden>
        <Input />
      </Form.Item>

      <div className="wh-form-grid">
        <div className="wh-thumb">
          <StyleCoverThumb styleId={watchedStyleId} size={COVER_SIZE} borderRadius={10} />
        </div>
        <div className="wh-lines">
          <div className="wh-line">
            <div className="wh-label">质检编号</div>
            <div className="wh-control">
              <Form.Item name="warehousingNo" style={{ marginBottom: 0 }}>
                <Input placeholder="自动生成" disabled />
              </Form.Item>
            </div>
          </div>

          <div className="wh-line">
            <div className="wh-label">订单号</div>
            <div className="wh-control" style={{ flex: 1 }}>
              <Form.Item name="orderId" style={{ marginBottom: 0 }} rules={[{ required: true, message: '请选择订单号' }]}>
                <Select
                  placeholder="请选择已裁剪的订单（裁剪数>0）"
                  showSearch
                  optionFilterProp="label"
                  loading={orderOptionsLoading}
                  notFoundContent={orderOptionsLoading ? '加载中…' : '暂无数据'}
                  options={orderOptions
                    .filter((o) => {
                      const st = String((o as any)?.status || '').trim().toLowerCase();
                      if (st === 'completed') return false;
                      const cuttingQty = Number((o as any)?.cuttingQuantity || 0) || 0;
                      return cuttingQty > 0;
                    })
                    .map((o) => ({
                      value: o.id!,
                      label: String(o.orderNo || ''),
                      data: o,
                    }))}
                  onChange={handleOrderChange}
                />
              </Form.Item>
            </div>

            <div className="wh-label" style={{ width: 56 }}>款号</div>
            <div className="wh-control" style={{ width: 160 }}>
              <Form.Item name="styleNo" style={{ marginBottom: 0 }} rules={[{ required: true, message: '款号缺失' }]}>
                <Input disabled />
              </Form.Item>
            </div>

            <div className="wh-label" style={{ width: 56 }}>款名</div>
            <div className="wh-control" style={{ minWidth: 240, flex: 2 }}>
              <Form.Item name="styleName" style={{ marginBottom: 0 }} rules={[{ required: true, message: '款名缺失' }]}>
                <Input disabled />
              </Form.Item>
            </div>
          </div>

          <BatchSelectionPanel
            bundles={bundles}
            batchSelectRows={batchSelectRows}
            batchSelectedBundleQrs={batchSelectedBundleQrs}
            batchSelectableQrs={batchSelectableQrs}
            batchQtyByQr={batchQtyByQr}
            summary={batchSelectedSummary}
            hasBlocked={batchSelectedHasBlocked}
            bundleRepairRemainingByQr={bundleRepairRemainingByQr}
            onSelectAll={handleBatchSelectAll}
            onSelectInvert={handleBatchSelectInvert}
            onSelectClear={handleBatchSelectClear}
            onSelectionChange={handleBatchSelectionChange}
            setBatchQtyByQr={setBatchQtyByQr}
            setBatchSelectedBundleQrs={setBatchSelectedBundleQrs}
          />

          <div className="wh-line">
            <div className="wh-label">颜色</div>
            <div className="wh-control" style={{ width: 160 }}>
              <Input id="whColor" value={String(singleSelectedBundle?.color || '').trim() || '-'} disabled />
            </div>
            <div className="wh-label" style={{ width: 56 }}>码数</div>
            <div className="wh-control" style={{ width: 160 }}>
              <Input id="whSize" value={String(singleSelectedBundle?.size || '').trim() || '-'} disabled />
            </div>
            <div className="wh-label" style={{ width: 72 }}>质检数量</div>
            <div className="wh-control" style={{ width: 160 }}>
              <Form.Item name="warehousingQuantity" style={{ marginBottom: 0 }} rules={[{ required: true, message: '质检数量缺失' }]}>
                <InputNumber style={{ width: '100%' }} min={1} disabled />
              </Form.Item>
            </div>
          </div>

          {isSingleSelectedBundleBlocked ? (
            <div className="wh-line">
              <div className="wh-label">返修统计</div>
              <div className="wh-control" style={{ flex: 1, minWidth: 280 }}>
                <Space wrap size={6}>
                  <Tag color="processing">
                    返修池 {singleSelectedBundleRepairStats ? singleSelectedBundleRepairStats.repairPool : '-'}
                  </Tag>
                  <Tag color="geekblue">
                    已返修入库 {singleSelectedBundleRepairStats ? singleSelectedBundleRepairStats.repairedOut : '-'}
                  </Tag>
                  <Tag color="success">
                    剩余可入库 {singleSelectedBundleRepairStats ? singleSelectedBundleRepairStats.remaining : '-'}
                  </Tag>
                </Space>
              </div>
            </div>
          ) : null}

          <div className="wh-line">
            <div className="wh-label">合格数量</div>
            <div className="wh-control" style={{ width: 160 }}>
              <Form.Item name="qualifiedQuantity" style={{ marginBottom: 0 }} rules={[{ required: true, message: '合格数量缺失' }]}>
                <InputNumber style={{ width: '100%' }} min={0} disabled />
              </Form.Item>
            </div>
            <div className="wh-label" style={{ width: 84 }}>不合格数量</div>
            <div className="wh-control" style={{ width: 160 }}>
              <Form.Item name="unqualifiedQuantity" style={{ marginBottom: 0 }} rules={[{ required: true, message: '请输入不合格数量' }]}>
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  max={isSingleSelectedBundleBlocked ? 0 : Math.max(0, Number(watchedWarehousingQty || 0) || 0)}
                  disabled={!watchedBundleQr || batchSelectedBundleQrs.length !== 1 || isSingleSelectedBundleBlocked}
                  onChange={(v) => {
                    const total = Number(form.getFieldValue('warehousingQuantity') || 0) || 0;
                    const uq = Math.max(0, Math.min(total, Number(v || 0) || 0));
                    const q = Math.max(0, total - uq);
                    form.setFieldsValue({
                      unqualifiedQuantity: uq,
                      qualifiedQuantity: q,
                      qualityStatus: uq > 0 ? 'unqualified' : 'qualified',
                      defectCategory: uq > 0 ? form.getFieldValue('defectCategory') : undefined,
                      defectRemark: uq > 0 ? form.getFieldValue('defectRemark') : undefined,
                      unqualifiedImageUrls: uq > 0 ? form.getFieldValue('unqualifiedImageUrls') : '[]',
                    });
                    if (uq <= 0) {
                      setUnqualifiedImageUrls([]);
                    }
                  }}
                />
              </Form.Item>
            </div>
          </div>

          <div className="wh-line">
            <div className="wh-label">次品类别</div>
            <div className="wh-control" style={{ width: 240 }}>
              <Form.Item
                name="defectCategory"
                style={{ marginBottom: 0 }}
                rules={[
                  ({ getFieldValue }) => ({
                    validator: async (_: any, value: any) => {
                      const uq = Number(getFieldValue('unqualifiedQuantity') || 0) || 0;
                      if (uq > 0 && !String(value || '').trim()) {
                        throw new Error('请选择次品类别');
                      }
                    },
                  }),
                ]}
              >
                <Select
                  placeholder="请选择"
                  options={DEFECT_CATEGORY_OPTIONS}
                  disabled={!watchedBundleQr || batchSelectedBundleQrs.length !== 1 || isSingleSelectedBundleBlocked || (Number(watchedUnqualifiedQty || 0) || 0) <= 0}
                  allowClear
                />
              </Form.Item>
            </div>
            <div className="wh-label" style={{ width: 72 }}>处理方式</div>
            <div className="wh-control" style={{ flex: 1, minWidth: 240 }}>
              <Form.Item
                name="defectRemark"
                style={{ marginBottom: 0 }}
                rules={[
                  ({ getFieldValue }) => ({
                    validator: async (_: any, value: any) => {
                      const uq = Number(getFieldValue('unqualifiedQuantity') || 0) || 0;
                      if (uq > 0 && !String(value || '').trim()) {
                        throw new Error('请选择处理方式');
                      }
                    },
                  }),
                ]}
              >
                <Select
                  placeholder="请选择"
                  options={DEFECT_REMARK_OPTIONS}
                  disabled={!watchedBundleQr || batchSelectedBundleQrs.length !== 1 || isSingleSelectedBundleBlocked || (Number(watchedUnqualifiedQty || 0) || 0) <= 0}
                  allowClear
                />
              </Form.Item>
            </div>
          </div>

          <div className="wh-line wh-line-bottom">
            <div className="wh-label">不合格图片</div>
            <div className="wh-control wh-upload">
              <MultiImageUploadBox
                value={hook.unqualifiedImageUrls}
                onChange={(urls: string[]) => {
                  hook.setUnqualifiedImageUrls(urls);
                  hook.form.setFieldsValue({
                    unqualifiedImageUrls: JSON.stringify(urls.slice(0, 4)),
                  });
                }}
                maxCount={4}
                maxSizeMB={15}
                accept="image/jpeg,image/png,image/webp"
                disabled={(Number(watchedUnqualifiedQty || 0) || 0) <= 0}
              />
            </div>
          </div>

          <div className="wh-line wh-line-bottom">
            <div className="wh-label" style={{ width: 72 }}>返修备注</div>
            <div className="wh-control" style={{ flex: 1, minWidth: 240 }}>
              <AiQualityHelper
                orderId={watchedOrderIdForAi}
                defectCategory={watchedDefectCategoryForAi}
                onAdopt={(text) => hook.form.setFieldsValue({ repairRemark: text })}
              />
              <Form.Item
                name="repairRemark"
                style={{ marginBottom: 0 }}
                rules={isSingleSelectedBundleBlocked ? [{ required: true, message: '请输入返修备注' }] : undefined}
              >
                <Input.TextArea rows={2} placeholder="请输入返修备注" />
              </Form.Item>
            </div>
          </div>

          <div className="wh-line wh-line-bottom">
            <div className="wh-label" style={{ width: 72 }}>仓库</div>
            <div className="wh-control" style={{ width: 180 }}>
              <Select
                value={selectedAreaId || undefined}
                onChange={(v) => { setSelectedAreaId(v); form.setFieldValue('warehouse', undefined); }}
                options={finishedWarehouseOptions}
                style={{ width: '100%' }}
                placeholder="请选择仓库"
              />
            </div>
            <div className="wh-label" style={{ width: 72 }}>入库仓位</div>
            <div className="wh-control" style={{ flex: 1, minWidth: 200 }}>
              <Form.Item name="warehouse" style={{ marginBottom: 0 }}>
                <WarehouseLocationAutoComplete
                  warehouseType="FINISHED"
                  areaId={selectedAreaId}
                  placeholder="请选择入库库位（如 A-01-1-1）"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </div>
          </div>

        </div>
      </div>

      <div style={{ marginTop: 24, textAlign: 'right' }}>
        <Space>
          <Button onClick={onCancel}>取消</Button>
          {batchSelectedBundleQrs.length > 1 ? (
            <Button
              type="primary"
              onClick={handleBatchQualifiedSubmit}
              loading={submitLoading}
              disabled={batchSelectedHasBlocked}
            >
              批量合格入库
            </Button>
          ) : (
            <Button
              type="primary"
              onClick={handleSubmit}
              loading={submitLoading}
            >
              确定
            </Button>
          )}
        </Space>
      </div>
    </Form>
  );
};

export default WarehousingFormFields;
