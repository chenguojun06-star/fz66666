import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  InputNumber,
  Radio,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { ReloadOutlined, RollbackOutlined, SwapOutlined } from '@ant-design/icons';
import { posApi, type PosReturnType, type PosReturnableLine } from '@/services/pos/posApi';

const { Text } = Typography;

/**
 * D-816：退货 / 换货面板（收银台内的一个 Tab）。
 *
 * <p><b>为什么放在收银台里而不是独立页面</b>：退货必然发生在结账现场，
 * 收银员要能在同一屏完成「查原单 → 退 → 需要换货时接着收新货」，
 * 来回跳页面在高峰期就是排队变慢。
 *
 * <p><b>换货的边界说明（重要）</b>：本面板只负责**退**。
 * 换货时收的那一件走正常收银台扫码结账 —— 复用既有的扣库存、收款、开小票、
 * 出库台账链路，不另写一套「换货专用结算」，否则两套逻辑迟早对不上账。
 * 差价由收银员在线下处理（顾客补差）或从应退款里扣。
 */
const PosReturnPanel: React.FC<{ onGoCheckout: () => void }> = ({ onGoCheckout }) => {
  const [saleNo, setSaleNo] = useState('');
  const [rows, setRows] = useState<PosReturnableLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [type, setType] = useState<PosReturnType>('RETURN');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const no = saleNo.trim();
    if (!no) {
      message.warning('请先输入原销售单号');
      return;
    }
    setLoading(true);
    try {
      const list = await posApi.returnable(no);
      setRows(list ?? []);
      setSearched(true);
      setQty({});
      const none = (list ?? []).filter((r) => r.returnableQty <= 0).length;
      if (!(list ?? []).length) {
        message.info('该单没有可退的商品');
      } else if (none === (list ?? []).length) {
        message.warning('该单已全部退完，没有可退数量');
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '查询可退数量失败');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [saleNo]);

  const totalQty = useMemo(
    () => Object.values(qty).reduce((a, b) => a + (Number(b) || 0), 0),
    [qty],
  );

  const submit = useCallback(async () => {
    const no = saleNo.trim();
    if (!no) {
      message.warning('请先输入原销售单号');
      return;
    }
    const lines = Object.entries(qty)
      .map(([id, q]) => ({ saleItemId: Number(id), quantity: Number(q) || 0 }))
      .filter((l) => l.quantity > 0);
    if (!lines.length) {
      message.warning('请至少选择一件要退的商品');
      return;
    }
    setSubmitting(true);
    try {
      const out = await posApi.createReturn(no, { lines, returnType: type, reason });
      message.success(
        `退货单 ${out.returnNo} 已生成，应退 ¥${Number(out.totalAmount ?? 0).toFixed(2)}。${out.refundStatusHint ?? ''}`,
        8,
      );
      if (type === 'EXCHANGE') {
        message.info('请切到「收银」Tab 扫入要换的新商品，按差额收款完成换货', 8);
      }
      setQty({});
      setReason('');
      await load();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '创建退货单失败');
    } finally {
      setSubmitting(false);
    }
  }, [saleNo, qty, type, reason, load]);

  return (
    <div className="pos-return">
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="本系统未接支付渠道退款接口"
        description="退货单生成后状态为「待退款」，需要收银员在线下真实退款后，再在上方列表点「确认已退款」。系统不会自动标记已退款。"
      />

      <Space.Compact style={{ width: 520, marginBottom: 12 }}>
        <Input
          placeholder="输入原销售单号（如 PS20260101120001）"
          value={saleNo}
          onChange={(e) => setSaleNo(e.target.value)}
          onPressEnter={() => void load()}
          style={{ width: 400 }}
        />
        <Button type="primary" loading={loading} onClick={() => void load()}>
          查可退商品
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
      </Space.Compact>

      {searched && rows.length > 0 && (
        <>
          <Table<PosReturnableLine>
            size="small"
            rowKey="saleItemId"
            pagination={false}
            style={{ marginBottom: 16 }}
            dataSource={rows}
            columns={[
              { title: '商品', dataIndex: 'styleName', render: (v: string, r) => `${v}（${r.color ?? ''} ${r.size ?? ''}）` },
              { title: '单价', dataIndex: 'unitPrice', width: 90, render: (v: number) => `¥${Number(v ?? 0).toFixed(2)}` },
              { title: '已售', dataIndex: 'soldQty', width: 70 },
              { title: '已退', dataIndex: 'returnedQty', width: 70 },
              {
                title: '可退',
                dataIndex: 'returnableQty',
                width: 70,
                render: (v: number) => (v > 0 ? <Tag color="blue">{v}</Tag> : <Text type="secondary">已退完</Text>),
              },
              {
                title: '本次退',
                width: 120,
                render: (_: unknown, r: PosReturnableLine) => (
                  <InputNumber
                    size="small"
                    min={0}
                    max={r.returnableQty}
                    value={qty[r.saleItemId] ?? 0}
                    disabled={r.returnableQty <= 0}
                    onChange={(v) => setQty((prev) => ({ ...prev, [r.saleItemId]: Number(v) || 0 }))}
                    style={{ width: 100 }}
                  />
                ),
              },
            ]}
          />

          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space wrap>
              <Text>处理方式：</Text>
              <Radio.Group value={type} onChange={(e) => setType(e.target.value as PosReturnType)}>
                <Radio.Button value="RETURN">退货退款</Radio.Button>
                <Radio.Button value="REFUND">仅退款（货已不在）</Radio.Button>
                <Radio.Button value="EXCHANGE">换货</Radio.Button>
              </Radio.Group>
            </Space>

            {type === 'EXCHANGE' && (
              <Alert
                type="info"
                showIcon
                message="换货 = 先退旧、再收新"
                description="点下方「确认退货」后，请切到「收银」Tab 扫入要换的新商品并按差额收款。收新货走的是正常结账链路（扣库存 / 收款 / 开小票），不另写换货专用结算。"
              />
            )}

            <Space.Compact style={{ width: 520 }}>
              <Input
                placeholder="退货原因（如：尺码不合适 / 客户不买了）"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
              />
            </Space.Compact>

            <Space>
              <Button
                type="primary"
                danger={type !== 'EXCHANGE'}
                icon={type === 'EXCHANGE' ? <SwapOutlined /> : <RollbackOutlined />}
                loading={submitting}
                disabled={totalQty <= 0}
                onClick={() => void submit()}
              >
                {type === 'EXCHANGE' ? '确认退货（去收新货）' : '确认退货'}（共 {totalQty} 件）
              </Button>
              <Button onClick={onGoCheckout}>去收银 Tab 收新货</Button>
            </Space>
          </Space>
        </>
      )}

      {searched && rows.length === 0 && (
        <Alert type="info" showIcon message="没有查到该销售单的可退商品，请确认单号是否正确、是否已收款。" />
      )}
    </div>
  );
};

export default PosReturnPanel;
