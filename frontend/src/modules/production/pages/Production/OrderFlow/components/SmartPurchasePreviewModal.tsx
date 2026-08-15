import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Table, Tag, Input, Alert, Button, App } from 'antd';
import { ShoppingCartOutlined } from '@ant-design/icons';
import { purchaseCartApi } from '@/services/purchaseCartApi';

interface SmartPurchasePreviewModalProps {
  open: boolean;
  orderNo: string;
  generating: boolean;
  onClose: () => void;
  /** 生成全部物料采购（原「从物料清单生成采购」链路） */
  onGenerateAll: (reason: string) => void;
  /** 仅缺料加入采购车成功后回调（父级打开购物车） */
  onPushedToCart: () => void;
}

/**
 * 大货物料采购 · 缺料分析预览弹窗
 *
 * 点击「生成采购」先展示净需求分析（用量×订单数量×(1+损耗) − 可用库存 − 在途），
 * 让用户一眼看清哪些缺、哪些库存足够，再选择：
 *   - 生成采购单（全部物料，走原链路）
 *   - 仅缺料加入采购车（可与其它订单/款式合并下单，购物车里最终确认）
 * 原因输入改为选填（默认"从物料清单生成采购"），不再强制手写。
 */
const SmartPurchasePreviewModal: React.FC<SmartPurchasePreviewModalProps> = ({
  open,
  orderNo,
  generating,
  onClose,
  onGenerateAll,
  onPushedToCart,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [analyzeError, setAnalyzeError] = useState('');
  const [reason, setReason] = useState('');
  const [pushing, setPushing] = useState(false);

  const loadNetDemand = useCallback(async () => {
    if (!orderNo) return;
    setLoading(true);
    setAnalyzeError('');
    try {
      const data = await purchaseCartApi.getNetDemand(orderNo);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : '需求分析失败，仍可直接生成全部物料采购');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orderNo]);

  useEffect(() => {
    if (open) {
      setReason('');
      void loadNetDemand();
    }
  }, [open, loadNetDemand]);

  const needRows = rows.filter((r) => r.needPurchase);
  const enoughCount = rows.length - needRows.length;

  const handlePushShortage = async () => {
    if (!orderNo) return;
    setPushing(true);
    try {
      await purchaseCartApi.generateSmartSourcing(orderNo);
      message.success(`已将 ${needRows.length} 项缺料加入采购车，请在采购车中确认下单`);
      onPushedToCart();
      onClose();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加入采购车失败');
    } finally {
      setPushing(false);
    }
  };

  const handleGenerateAll = () => {
    onGenerateAll(reason.trim() || '从物料清单生成采购');
    onClose();
  };

  return (
    <Modal
      open={open}
      title={`生成采购 · ${orderNo}`}
      width={920}
      onCancel={onClose}
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {rows.length > 0
              ? `共 ${rows.length} 项物料：缺料 ${needRows.length} 项，库存足够 ${enoughCount} 项`
              : ''}
          </span>
          <span>
            <Button onClick={onClose}>取消</Button>
            {rows.length > 0 && needRows.length > 0 && (
              <Button
                icon={<ShoppingCartOutlined />}
                style={{ marginLeft: 8 }}
                loading={pushing}
                onClick={handlePushShortage}
              >
                仅缺料加入采购车（{needRows.length}项）
              </Button>
            )}
            <Button
              type="primary"
              style={{ marginLeft: 8 }}
              loading={generating}
              onClick={handleGenerateAll}
            >
              生成采购单{rows.length > 0 ? `（全部 ${rows.length}项）` : ''}
            </Button>
          </span>
        </div>
      }
    >
      {analyzeError ? (
        <Alert type="warning" showIcon message={analyzeError} style={{ marginBottom: 12 }} />
      ) : null}

      {rows.length > 0 && enoughCount > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={`有 ${enoughCount} 项物料库存足够：若选择「生成采购单（全部）」会一并采购；建议改用「仅缺料加入采购车」，库存足够的物料到仓库领料即可。`}
        />
      )}

      <Table
        size="small"
        loading={loading}
        dataSource={rows}
        rowKey="materialCode"
        pagination={false}
        scroll={{ x: 720, y: 360 }}
        rowClassName={(r) => (r.needPurchase ? '' : 'smart-sourcing-no-need')}
        columns={[
          {
            title: '状态',
            dataIndex: 'needPurchase',
            width: 76,
            fixed: 'left',
            render: (need: boolean) =>
              need ? <Tag color="red">需采购</Tag> : <Tag color="green">充足</Tag>,
          },
          {
            title: '物料',
            dataIndex: 'materialName',
            width: 200,
            fixed: 'left',
            render: (_: string, r: any) => (
              <div>
                <div style={{ fontWeight: 500 }}>{r.materialName || '-'}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                  {r.materialCode}
                  {r.specification ? ` | ${r.specification}` : ''}
                  {r.color ? ` | ${r.color}` : ''}
                </div>
              </div>
            ),
          },
          {
            title: '总需求',
            dataIndex: 'demand',
            width: 100,
            render: (v: any, r: any) => (
              <span style={{ fontWeight: 500 }}>{v} {r.unit || ''}</span>
            ),
          },
          { title: '可用库存', dataIndex: 'availableStock', width: 90, render: (v: number) => v ?? 0 },
          { title: '在途', dataIndex: 'inTransit', width: 70, render: (v: any) => v || 0 },
          {
            title: '净需求',
            dataIndex: 'netDemand',
            width: 100,
            render: (v: any, r: any) => (
              <span style={{ color: r.needPurchase ? 'var(--color-error)' : 'var(--color-text-quaternary)', fontWeight: r.needPurchase ? 600 : 400 }}>
                {v} {r.unit || ''}
              </span>
            ),
          },
          {
            title: '推荐供应商',
            dataIndex: 'recommendedSupplier',
            width: 150,
            render: (s: any) => (s?.supplierName ? (
              <span>
                {s.supplierName}
                {s.isBomDesignated ? <Tag color="blue" style={{ marginLeft: 4, fontSize: 10 }}>清单指定</Tag> : null}
              </span>
            ) : <span style={{ color: 'var(--color-text-quaternary)' }}>暂无</span>),
          },
        ]}
      />

      <Input.TextArea
        style={{ marginTop: 12 }}
        rows={2}
        maxLength={200}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="操作原因（选填，默认记录为「从物料清单生成采购」，将写入订单操作记录）"
      />
    </Modal>
  );
};

export default SmartPurchasePreviewModal;
