import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Form, Input, InputNumber, Skeleton, Space, Table, Tag } from 'antd';
import { EditOutlined, ReloadOutlined, HistoryOutlined } from '@ant-design/icons';
import SideDrawer from '@/components/common/SideDrawer';
import RecordLogDrawer from '@/components/common/RecordLogDrawer';
import api from '@/utils/api';
import type { FinishedInventoryRow } from './flattenBySku';

/**
 * SkuDetailDrawer —— 编码点击后的 SKU 详情侧滑。
 *
 * 设计目标：
 * - 顶部只读卡片：款号 / 款名 / 商品编码 / 颜色 / 尺码 / 工厂 / 实时库存
 * - 中部：该 SKU 历次入库记录列表（按 skuCode 客户端过滤），每行可点 [编辑]
 * - 编辑表单：库位 / 库区 / 备注 / 单价（仅后端 /edit 接口允许的字段）
 * - 保存调用 POST /api/warehouse/finished-inventory/edit，成功后广播 data:changed 触发首页刷新
 * - 底部操作日志按钮 → RecordLogDrawer，便于追溯该款的出入库/编辑历史
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
  /** 顶部数据源（含当前 SKU 的实时库存/价格等，用于只读卡片） */
  rawDataSource: any[];
}

const SkuDetailDrawer: React.FC<SkuDetailDrawerProps> = ({ open, onClose, record, onRefresh, rawDataSource }) => {
  const [warehousingList, setWarehousingList] = useState<WarehousingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm] = Form.useForm();
  const [editSaving, setEditSaving] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const skuCode = record?.__skuCode || '';
  const styleNo = record?.styleNo || '';

  // 只读卡片：当前实时库存（来自 rawDataSource 的同 SKU 行）
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
      setEditingId(null);
      editForm.resetFields();
    }
  }, [open, record, loadWarehousingList, editForm]);

  const startEdit = (row: WarehousingRow) => {
    setEditingId(row.id);
    editForm.setFieldsValue({
      warehouse: row.warehouse || '',
      warehouseAreaId: row.warehouseAreaId || '',
      remark: row.defectRemark || '',
      unitPrice: row.unitPrice ?? null,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    editForm.resetFields();
  };

  const saveEdit = async () => {
    if (!editingId) return;
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
      await api.post('/warehouse/finished-inventory/edit', { warehousingId: editingId, changes });
      // 触发首页刷新（data:changed 已在 useSync 中订阅）
      try { window.dispatchEvent(new Event('data:changed')); } catch { /* noop */ }
      await onRefresh();
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
        width={760}
        footer={(
          <Space>
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
            <Card size="small" style={{ marginBottom: 12 }}>
              <div className="u-d-flex u-fwrap-wrap u-gap-16" style={{ rowGap: 8 }}>
                <div style={{ minWidth: 120 }}>
                  <div className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>款号</div>
                  <div className="u-fw-600">{record.styleNo || '-'}</div>
                </div>
                <div style={{ minWidth: 160 }}>
                  <div className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>款名</div>
                  <div className="u-fw-600">{record.styleName || '-'}</div>
                </div>
                <div style={{ minWidth: 200 }}>
                  <div className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>商品编码</div>
                  <div style={{ fontFamily: 'var(--font-family-mono, monospace)', fontWeight: 600 }}>{skuCode || '-'}</div>
                </div>
                <div style={{ minWidth: 80 }}>
                  <div className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>颜色</div>
                  <Tag color="blue" style={{ margin: 0 }}>{record.color || '-'}</Tag>
                </div>
                <div style={{ minWidth: 60 }}>
                  <div className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>尺码</div>
                  <Tag color="default" style={{ margin: 0 }}>{record.size || '-'}</Tag>
                </div>
                <div style={{ minWidth: 140 }}>
                  <div className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>工厂</div>
                  <div>{record.factoryName || '-'}</div>
                </div>
                <div style={{ minWidth: 100 }}>
                  <div className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>当前库存</div>
                  <div className="u-fw-600" style={{ color: 'var(--color-success)' }}>
                    {liveStock?.availableQty ?? record.availableQty ?? 0} 件
                  </div>
                </div>
              </div>
            </Card>

            <div className="u-fw-600 u-mb-8 u-fs-14">入库记录（{warehousingList.length} 条）</div>
            {loading ? (
              <Skeleton active />
            ) : warehousingList.length === 0 ? (
              <Empty description="该商品编码暂无入库记录" />
            ) : (
              <Table
                size="small"
                rowKey="id"
                dataSource={warehousingList}
                pagination={false}
                columns={[
                  { title: '入库单号', dataIndex: 'warehousingNo', width: 160, render: (v: string) => <span style={{ fontFamily: 'var(--font-family-mono, monospace)' }}>{v || '-'}</span> },
                  { title: '入库日期', dataIndex: 'warehousingEndTime', width: 150, render: (v: string) => v || '-' },
                  {
                    title: '数量',
                    width: 90,
                    align: 'right' as const,
                    render: (_: unknown, r: WarehousingRow) => (
                      <span>
                        <span className="u-fw-600" style={{ color: 'var(--color-success)' }}>{r.qualifiedQuantity ?? r.warehousingQuantity ?? 0}</span>
                        <span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}> 件</span>
                      </span>
                    ),
                  },
                  {
                    title: '库位 / 库区',
                    width: 160,
                    render: (_: unknown, r: WarehousingRow) => editingId === r.id ? (
                      <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name="warehouse" noStyle>
                          <Input placeholder="库位" />
                        </Form.Item>
                        <Form.Item name="warehouseAreaId" noStyle>
                          <Input placeholder="库区ID" />
                        </Form.Item>
                      </Space.Compact>
                    ) : (
                      <span>
                        {r.warehouse || '-'}{r.warehouseAreaName ? ` · ${r.warehouseAreaName}` : ''}
                      </span>
                    ),
                  },
                  {
                    title: '单价',
                    width: 110,
                    render: (_: unknown, r: WarehousingRow) => editingId === r.id ? (
                      <Form.Item name="unitPrice" noStyle>
                        <InputNumber style={{ width: '100%' }} min={0} placeholder="单价" />
                      </Form.Item>
                    ) : (
                      <span>{r.unitPrice != null ? `¥${Number(r.unitPrice).toFixed(2)}` : '-'}</span>
                    ),
                  },
                  {
                    title: '操作人',
                    dataIndex: 'warehousingOperatorName',
                    width: 90,
                    render: (v: string) => v || '-',
                  },
                  {
                    title: '备注',
                    render: (_: unknown, r: WarehousingRow) => editingId === r.id ? (
                      <Form.Item name="remark" noStyle>
                        <Input placeholder="备注 / 不合格原因" />
                      </Form.Item>
                    ) : (
                      <span style={{ color: 'var(--color-text-tertiary)' }}>{r.defectRemark || '-'}</span>
                    ),
                  },
                  {
                    title: '操作',
                    width: 110,
                    fixed: 'right' as const,
                    render: (_: unknown, r: WarehousingRow) => editingId === r.id ? (
                      <Space>
                        <Button size="small" type="primary" loading={editSaving} onClick={() => { void saveEdit(); }}>保存</Button>
                        <Button size="small" onClick={cancelEdit} disabled={editSaving}>取消</Button>
                      </Space>
                    ) : (
                      <Button size="small" type="link" icon={<EditOutlined />} style={{ padding: 0 }} onClick={() => startEdit(r)}>编辑</Button>
                    ),
                  },
                ]}
              />
            )}
            {/* 把编辑表单挂到抽屉内（Table 内的 Form.Item 不会冒泡提交） */}
            <Form form={editForm} component="div" style={{ display: 'none' }} />
          </>
        )}
      </SideDrawer>

      {/*
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
    </>
  );
};

export default SkuDetailDrawer;