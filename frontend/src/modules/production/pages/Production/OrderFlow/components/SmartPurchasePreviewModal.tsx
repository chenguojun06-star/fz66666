import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Table, Tag, Input, Alert, Button } from 'antd';
import { purchaseCartApi } from '@/services/purchaseCartApi';
import api from '@/utils/api';

interface SmartPurchasePreviewModalProps {
  open: boolean;
  /** 大货模式：订单号，弹窗内按订单拉净需求分析 */
  orderNo?: string;
  /** 样衣模式：款式ID，弹窗内调 check-stock 做库存对比分析 */
  styleId?: string | number;
  /** 样衣模式款式号（仅标题展示） */
  styleNo?: string;
  generating: boolean;
  onClose: () => void;
  /** 生成全部物料采购（原「从物料清单生成采购」链路） */
  onGenerateAll: (reason: string) => void;
  /**
   * 仅缺料处理：
   *   大货模式 = 按净需求直接生成采购任务（第二参不带 rows）
   *   样衣模式 = 缺料加入采购车（第二参带回缺料行，由调用方批量入车）
   */
  onGenerateShortage: (reason: string, shortageRows?: any[]) => void;
}

/**
 * 物料采购 · 统一缺料分析弹窗（D-360）
 *
 * 大货/样衣两个链路的「生成采购」都先弹本弹窗，让用户看清哪些缺、哪些库存足够：
 *   - 大货：净需求 = 用量×订单数量×(1+损耗) − 可用库存 − 在途（后端 smart-sourcing）
 *           底部动作 = [生成全部] [仅缺料生成采购（直生成）]
 *   - 样衣：物料清单 × 仓库库存（check-stock 接口）
 *           底部动作 = [生成全部] [仅缺料加入采购车]（样衣链不支持缺料直生成，走购物车合并下单）
 * 原因输入仅大货模式显示（写入订单操作记录），选填。
 */
const SmartPurchasePreviewModal: React.FC<SmartPurchasePreviewModalProps> = ({
  open,
  orderNo,
  styleId,
  styleNo,
  generating,
  onClose,
  onGenerateAll,
  onGenerateShortage,
}) => {
  const isSampleMode = !orderNo;
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [analyzeError, setAnalyzeError] = useState('');
  const [reason, setReason] = useState('');

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

  const loadSampleStockAnalysis = useCallback(async () => {
    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) {
      setAnalyzeError('无效的款式ID，无法分析库存');
      setRows([]);
      return;
    }
    setLoading(true);
    setAnalyzeError('');
    try {
      const result = await api.post<{ code: number; message?: string; data: any[] }>(`/style/bom/check-stock/${sid}`);
      if (result.code === 200 && Array.isArray(result.data)) {
        const mapped = result.data.map((bom: any) => {
          const status = String(bom.stockStatus || 'unchecked');
          return {
            materialCode: bom.materialCode,
            materialName: bom.materialName,
            specification: bom.specification || bom.specifications,
            color: bom.color,
            unit: bom.unit,
            demand: Number(bom.devUsageAmount ?? bom.usageAmount) || 0,
            availableStock: bom.availableStock,
            inTransit: null,
            recommendedSupplier: bom.supplier || bom.supplierName
              ? { supplierName: bom.supplier || bom.supplierName, isBomDesignated: true }
              : null,
            needPurchase: status !== 'sufficient' && status !== 'no_usage',
            stockStatus: status,
          };
        });
        setRows(mapped);
      } else {
        setAnalyzeError(String(result.message || '库存分析失败，仍可直接生成全部物料采购'));
        setRows([]);
      }
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : '库存分析失败，仍可直接生成全部物料采购');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [styleId]);

  useEffect(() => {
    if (open) {
      setReason('');
      if (isSampleMode) void loadSampleStockAnalysis();
      else void loadNetDemand();
    }
  }, [open, isSampleMode, loadNetDemand, loadSampleStockAnalysis]);

  const needRows = rows.filter((r) => r.needPurchase);
  const enoughCount = rows.length - needRows.length;

  const handleGenerateShortage = () => {
    onGenerateShortage(
      isSampleMode ? '仅缺料加入采购车' : (reason.trim() || '仅缺料生成采购'),
      isSampleMode ? needRows : undefined,
    );
    onClose();
  };

  const handleGenerateAll = () => {
    onGenerateAll(reason.trim() || '从物料清单生成采购');
    onClose();
  };

  const titleSuffix = orderNo || styleNo || '';

  return (
    <Modal
      open={open}
      title={`生成采购${titleSuffix ? ` · ${titleSuffix}` : ''}`}
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
            <Button
              style={{ marginLeft: 8 }}
              onClick={handleGenerateAll}
            >
              生成全部{rows.length > 0 ? `（${rows.length}项）` : ''}
            </Button>
            <Button
              type="primary"
              style={{ marginLeft: 8 }}
              loading={generating}
              disabled={rows.length > 0 && needRows.length === 0}
              onClick={handleGenerateShortage}
            >
              {isSampleMode
                ? `仅缺料加入采购车${needRows.length > 0 ? `（${needRows.length}项）` : ''}`
                : `仅缺料生成采购${needRows.length > 0 ? `（${needRows.length}项）` : ''}`}
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
          message={isSampleMode
            ? `有 ${enoughCount} 项物料库存足够：点「仅缺料加入采购车」时这些不会加入；库存足够的物料可在物料清单表格内直接领取。`
            : `有 ${enoughCount} 项物料库存足够：点「仅缺料生成采购」时这些不会生成；库存足够的物料到仓库领料即可。`}
        />
      )}

      <Table
        size="small"
        loading={loading}
        dataSource={rows}
        rowKey={(r: any) => String(r.materialCode || r.materialName || Math.random())}
        pagination={false}
        scroll={{ x: 720, y: 360 }}
        rowClassName={(r) => (r.needPurchase ? '' : 'smart-sourcing-no-need')}
        columns={[
          {
            title: '状态',
            dataIndex: 'needPurchase',
            width: 76,
            fixed: 'left',
            render: (need: boolean, r: any) => {
              if (r.stockStatus === 'no_usage') return <Tag color="orange">未填用量</Tag>;
              if (r.stockStatus === 'unchecked') return <Tag color="default">未检查</Tag>;
              return need ? <Tag color="red">需采购</Tag> : <Tag color="green">充足</Tag>;
            },
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
            render: (_: any, r: any) => {
              const net = r.netDemand ?? (r.needPurchase ? Math.max(0, Number(r.demand || 0) - Number(r.availableStock || 0)) : 0);
              return (
                <span style={{ color: r.needPurchase ? 'var(--color-error)' : 'var(--color-text-quaternary)', fontWeight: r.needPurchase ? 600 : 400 }}>
                  {net} {r.unit || ''}
                </span>
              );
            },
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

      {!isSampleMode && (
        <Input.TextArea
          style={{ marginTop: 12 }}
          rows={2}
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="操作原因（选填，默认记录为「从物料清单生成采购」，将写入订单操作记录）"
        />
      )}
    </Modal>
  );
};

export default SmartPurchasePreviewModal;
