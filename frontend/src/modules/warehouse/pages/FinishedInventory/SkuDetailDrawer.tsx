import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Descriptions, Empty, Form, Input, InputNumber, Modal, Select, Skeleton, Space, Table } from 'antd';
import { EditOutlined, PlusOutlined, ReloadOutlined, HistoryOutlined } from '@ant-design/icons';
import SideDrawer from '@/components/common/SideDrawer';
import RecordLogDrawer from '@/components/common/RecordLogDrawer';
import FreeInboundModal from './FreeInboundModal';
import { useWarehouseAreaOptions } from '../../../../hooks/useWarehouseAreaOptions';
import api from '@/utils/api';
import type { FinishedInventoryRow } from './flattenBySku';

/**
 * SkuDetailDrawer —— 编码点击后的 SKU 详情侧滑（D-436 重构）。
 *
 * 设计目标（对齐参考稿：大画布、分区清晰、编辑不跳页）：
 * - 宽度 85%（原 760px 窄条是"字看不清/横向滚动"的根因）
 * - 顶部 Descriptions 只读区：款号 / 款名 / 商品编码 / 颜色 / 尺码 / 工厂 / 实时库存
 * - 中部：该 SKU 历次入库记录（middle 尺寸表格，不再 small 挤压）
 * - 行 [编辑] → 抽屉内弹出编辑框（库位/库区/单价/备注），不跳转任何页面
 * - 底部 [入库登记] → 复用商品仓储自由入库弹窗（FreeInboundModal 预置当前编码自动带出）
 * - 操作日志 → RecordLogDrawer，便于追溯该款的出入库/编辑历史
 */
interface WarehousingRow {
  id: string;
  warehousingNo?: string;
  orderNo?: string;
  styleNo?: string;
  styleName?: string;
  factoryName?: string;
  warehousingQuantity?: number;
  qualifiedQuantity?: number;
  unqualifiedQuantity?: number;
  warehouse?: string;
  warehouseAreaId?: string;
  warehouseAreaName?: string;
  warehousingOperatorName?: string;
  warehousingStartTime?: string;
  warehousingEndTime?: string;
  qualityStatus?: string;
  inspectionStatus?: string;
  defectRemark?: string;
  defectCategory?: string;
  receiverName?: string;
  receivedTime?: string;
  unitPrice?: number;
  totalAmount?: number;
  skuCode?: string;
  color?: string;
  size?: string;
  updateTime?: string;
}

interface SkuDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 主表点击的当前行（带 __skuCode / styleNo / color / size 等） */
  record: FinishedInventoryRow | null;
  /** 列表刷新回调（保存后调） */
  onRefresh: () => void | Promise<void>;
  /** 顶部数据源（含当前 SKU 的实时库存/价格等，用于只读区） */
  rawDataSource: any[];
}

const SkuDetailDrawer: React.FC<SkuDetailDrawerProps> = ({ open, onClose, record, onRefresh, rawDataSource }) => {
  const [warehousingList, setWarehousingList] = useState<WarehousingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingRow, setEditingRow] = useState<WarehousingRow | null>(null);
  const [editForm] = Form.useForm();
  const [editSaving, setEditSaving] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [inboundOpen, setInboundOpen] = useState(false);

  const skuCode = record?.__skuCode || '';
  const styleNo = record?.styleNo || '';

  // 编辑框里的库区下拉（成品仓 FINISHED，与自由入库同源）
  const { selectOptions: areaOptions } = useWarehouseAreaOptions('FINISHED' as any);

  // 只读区：当前实时库存（来自 rawDataSource 的同 SKU 行）
  const liveStock = useMemo(() => {
    if (!record) return null;
    return rawDataSource.find(
      (r: any) => r.styleNo === record.styleNo && (r.sku || r.id) === (record.__skuCode || record.id),
    );
  }, [rawDataSource, record]);

  // 拉取该款的所有入库记录（按 styleNo 全量），客户端按 skuCode 过滤
  const loadWarehousingList = useCallback(async () => {
    if (!styleNo) return;
    setLoading(true);
    try {
      const res = await api.get('/production/warehousing/list', { params: { styleNo, page: 1, pageSize: 500 } });
      const data = res?.data || res;
      const records: WarehousingRow[] = data?.records || [];
      const filtered = skuCode ? records.filter((r) => String(r.skuCode || '') === skuCode) : records;
      setWarehousingList(filtered);
    } catch {
      setWarehousingList([]);
    } finally {
      setLoading(false);
    }
  }, [styleNo, skuCode]);

  useEffect(() => {
    if (open && record) loadWarehousingList();
    if (!open) {
      setEditingRow(null);
      editForm.resetFields();
      setInboundOpen(false);
    }
  }, [open, record, loadWarehousingList, editForm]);

  /** 打开行编辑框（forceRender 保证 Form 已挂载，setFieldsValue 立即生效） */
  const startEdit = (row: WarehousingRow) => {
    setEditingRow(row);
    editForm.setFieldsValue({
      warehouse: row.warehouse || '',
      warehouseAreaId: row.warehouseAreaId || undefined,
      remark: row.defectRemark || '',
      unitPrice: row.unitPrice ?? null,
    });
  };

  const cancelEdit = () => {
    setEditingRow(null);
    editForm.resetFields();
  };

  const saveEdit = async () => {
    if (!editingRow) return;
    try {
      const values = await editForm.validateFields();
      setEditSaving(true);
      const changes: Record<string, unknown> = {};
      // 只传后端允许的字段（其他字段会被拒）
      if (values.warehouse !== undefined) changes.warehouse = values.warehouse;
      if (values.warehouseAreaId !== undefined) changes.warehouseAreaId = values.warehouseAreaId;
      if (values.remark !== undefined) changes.remark = values.remark;
      if (values.unitPrice !== undefined && values.unitPrice !== null && values.unitPrice !== '') {
        changes.unitPrice = Number(values.unitPrice);
      }
      await api.post('/warehouse/finished-inventory/edit', { warehousingId: editingRow.id, changes });
      // 触发全局刷新（data:changed 已在 useSync 中订阅），并刷新抽屉内入库记录
      try { window.dispatchEvent(new Event('data:changed')); } catch { /* noop */ }
      await onRefresh();
      await loadWarehousingList();
      cancelEdit();
    } catch (e: any) {
      if (e?.errorFields) return; // 表单校验失败，组件已显示
      // 后端 4xx 错误已由 axios 拦截器统一提示
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <>
      <SideDrawer
        open={open}
        onClose={onClose}
        title={record ? `商品编码详情 - ${skuCode}` : '商品编码详情'}
        width="85%"
        footer={(
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setInboundOpen(true)}>入库登记</Button>
            <Button icon={<HistoryOutlined />} onClick={() => setLogOpen(true)}>操作日志</Button>
            <Button icon={<ReloadOutlined />} onClick={() => { void loadWarehousingList(); }}>刷新</Button>
            <Button onClick={onClose}>关闭</Button>
          </Space>
        )}
      >
        {!record ? (
          <Empty description="未选中商品编码" />
        ) : (
          <>
            <Descriptions
              bordered
              column={{ xs: 1, sm: 2, md: 3, lg: 4 }}
              size="middle"
              style={{ marginBottom: 16 }}
              items={[
                { key: 'styleNo', label: '款号', children: <span style={{ fontWeight: 600 }}>{record.styleNo || '-'}</span> },
                { key: 'styleName', label: '款名', children: <span style={{ fontWeight: 600 }}>{record.styleName || '-'}</span> },
                {
                  key: 'skuCode',
                  label: '商品编码',
                  children: <span style={{ fontFamily: 'var(--font-family-mono, monospace)', fontWeight: 600 }}>{skuCode || '-'}</span>,
                },
                { key: 'color', label: '颜色', children: record.color || '-' },
                { key: 'size', label: '尺码', children: record.size || '-' },
                { key: 'factory', label: '工厂', children: record.factoryName || '-' },
                {
                  key: 'stock',
                  label: '当前库存',
                  children: (
                    <span style={{ fontWeight: 600, color: 'var(--color-success)', fontSize: 15 }}>
                      {liveStock?.availableQty ?? record.availableQty ?? 0} 件
                    </span>
                  ),
                },
              ]}
            />

            <div style={{ fontWeight: 600, fontSize: 15, margin: '4px 0 10px' }}>
              入库记录（{warehousingList.length} 条）
            </div>
            {loading ? (
              <Skeleton active />
            ) : warehousingList.length === 0 ? (
              <Empty description="该商品编码暂无入库记录" />
            ) : (
              <Table
                size="middle"
                rowKey="id"
                dataSource={warehousingList}
                pagination={false}
                scroll={{ x: 'max-content' }}
                columns={[
                  { title: '入库单号', dataIndex: 'warehousingNo', width: 180, render: (v: string) => <span style={{ fontFamily: 'var(--font-family-mono, monospace)' }}>{v || '-'}</span> },
                  { title: '入库日期', dataIndex: 'warehousingEndTime', width: 170, render: (v: string) => v || '-' },
                  {
                    title: '数量',
                    width: 100,
                    align: 'right' as const,
                    render: (_: unknown, r: WarehousingRow) => (
                      <span>
                        <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>{r.qualifiedQuantity ?? r.warehousingQuantity ?? 0}</span>
                        <span style={{ color: 'var(--color-text-tertiary)' }}> 件</span>
                      </span>
                    ),
                  },
                  {
                    title: '库位 / 库区',
                    width: 180,
                    render: (_: unknown, r: WarehousingRow) => (
                      <span>{r.warehouse || '-'}{r.warehouseAreaName ? ` · ${r.warehouseAreaName}` : ''}</span>
                    ),
                  },
                  {
                    title: '单价',
                    width: 110,
                    render: (_: unknown, r: WarehousingRow) => (
                      <span>{r.unitPrice != null ? `¥${Number(r.unitPrice).toFixed(2)}` : '-'}</span>
                    ),
                  },
                  { title: '操作人', dataIndex: 'warehousingOperatorName', width: 100, render: (v: string) => v || '-' },
                  {
                    title: '备注',
                    render: (_: unknown, r: WarehousingRow) => (
                      <span style={{ color: 'var(--color-text-tertiary)' }}>{r.defectRemark || '-'}</span>
                    ),
                  },
                  {
                    title: '操作',
                    width: 90,
                    fixed: 'right' as const,
                    render: (_: unknown, r: WarehousingRow) => (
                      <Button
                        size="small"
                        type="link"
                        icon={<EditOutlined />}
                        style={{ padding: 0 }}
                        onClick={() => startEdit(r)}
                      >编辑</Button>
                    ),
                  },
                ]}
              />
            )}

            {/*
             * 编辑框（在抽屉之内弹出，不跳页）。forceRender 让 Form 随抽屉先挂载，
             * startEdit 里的 setFieldsValue 立即生效（D-419 的 Form context 教训同样适用）。
             */}
            <Modal
              title={editingRow ? `编辑入库记录 - ${editingRow.warehousingNo || ''}` : '编辑入库记录'}
              open={!!editingRow}
              forceRender
              onCancel={cancelEdit}
              onOk={() => { void saveEdit(); }}
              confirmLoading={editSaving}
              okText="保存"
              cancelText="取消"
              width={520}
            >
              <Form form={editForm} layout="vertical">
                <Form.Item name="warehouse" label="库位" rules={[{ required: true, message: '请输入库位' }]}>
                  <Input placeholder="如 A-002" />
                </Form.Item>
                <Form.Item name="warehouseAreaId" label="库区">
                  <Select
                    allowClear
                    placeholder="选择库区"
                    loading={false}
                    options={areaOptions}
                  />
                </Form.Item>
                <Form.Item name="unitPrice" label="单价（元）">
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="入库单价" />
                </Form.Item>
                <Form.Item name="remark" label="备注">
                  <Input.TextArea rows={2} placeholder="备注 / 不合格原因" />
                </Form.Item>
              </Form>
            </Modal>
          </>
        )}
      </SideDrawer>

      {/*
       * 就地入库：复用商品仓储自由入库弹窗，带入当前商品编码自动添加一行（D-436）。
       * filter 取值依据（勿凭感觉改）：
       * - module='仓库管理'：AOP 的 resolveModule() 对 /api/warehouse/finished-inventory/*
       *   命中 u.contains("/warehouse/finished") 分支返回 "仓库管理"。
       * - 不传 targetType：AOP 的 resolveTargetType() 对同一 URI 返回的是 "仓库单"
       *   （命中 u.contains("/warehouse") 分支），不是"商品入库"；且入库编辑走的是
       *   Orchestrator + Helper 路径，targetType 恒为 null。传错就是 0 条。
       * - targetIds 传该 SKU 的入库单 id（AOP 从请求参数里解析出的就是 warehousingId），
       *   由 RecordLogDrawer 客户端过滤（拉最近 200 条再匹配）。
       */}
      <RecordLogDrawer
        open={logOpen}
        onClose={() => setLogOpen(false)}
        title={record ? `操作日志 - ${record.styleNo || ''} / ${skuCode}` : '操作日志'}
        filter={{
          module: '仓库管理',
          targetIds: warehousingList.map((r) => r.id).filter(Boolean),
        }}
      />

      <FreeInboundModal
        open={inboundOpen}
        onClose={() => setInboundOpen(false)}
        onSuccess={() => {
          setInboundOpen(false);
          void loadWarehousingList();
          void onRefresh();
        }}
        presetSkuCode={skuCode}
      />
    </>
  );
};

export default SkuDetailDrawer;
