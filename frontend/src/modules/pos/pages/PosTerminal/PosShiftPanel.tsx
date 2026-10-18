import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Input,
  InputNumber,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { LoginOutlined, LogoutOutlined, ReloadOutlined } from '@ant-design/icons';
import { posApi, type PosShift } from '@/services/pos/posApi';

const { Text } = Typography;

const money = (v: unknown) => `¥${Number(v ?? 0).toFixed(2)}`;

/**
 * D-817：交接班 / 钱箱（收银台内的一个 Tab）。
 *
 * <p><b>钱箱口径在界面上必须写明</b>：只有现金进钱箱，微信/支付宝线上到账、
 * 刷卡走对账单都不算 —— 否则收银员对着一个永远对不平的数字干瞪眼，
 * 最后干脆不看这个功能，交接班就形同虚设。
 */
const PosShiftPanel: React.FC = () => {
  const [cur, setCur] = useState<PosShift | null>(null);
  const [history, setHistory] = useState<PosShift[]>([]);
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [actualCash, setActualCash] = useState<number | null>(null);
  const [diffReason, setDiffReason] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, h] = await Promise.all([posApi.currentShift(), posApi.shifts(30)]);
      setCur(c ?? null);
      setHistory(h ?? []);
      if (c) setActualCash(Number(c.expectedCash ?? 0));
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载班次失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback(async () => {
    try {
      await posApi.openShift({ openingCash: Number(openingCash) || 0, terminal: '前台收银台' });
      message.success('已开班，钱箱备用金已登记');
      await load();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '开班失败');
    }
  }, [openingCash, load]);

  const close = useCallback(async () => {
    if (actualCash == null) {
      message.warning('请先填写实点现金');
      return;
    }
    try {
      const out = await posApi.closeShift({ actualCash, diffReason: diffReason || undefined });
      const diff = Number(out.diffAmount ?? 0);
      message.success(
        diff === 0
          ? '已交班，钱箱对平'
          : `已交班，${diff > 0 ? '长款' : '短款'} ${Math.abs(diff).toFixed(2)} 元`,
      );
      setActualCash(null);
      setDiffReason('');
      await load();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '交班失败');
    }
  }, [actualCash, diffReason, load]);

  const diff = cur && actualCash != null ? Number(actualCash) - Number(cur.expectedCash ?? 0) : null;

  return (
    <div className="pos-shift">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="钱箱只统计现金"
        description="微信 / 支付宝是线上到商户账户、刷卡走 POS 对账单，两者都不进钱箱；挂账不是收款。交班时实点与应有不一致，系统会要求填写差异原因。"
      />

      {!cur ? (
        <Space direction="vertical" size={12}>
          <Text strong>你当前没有开着的班次</Text>
          <Space>
            <Text>钱箱备用金：</Text>
            <InputNumber
              min={0}
              precision={2}
              value={openingCash}
              onChange={(v) => setOpeningCash(Number(v) || 0)}
              prefix="¥"
              style={{ width: 160 }}
            />
            <Button type="primary" icon={<LoginOutlined />} onClick={() => void open()}>
              开班
            </Button>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
              刷新
            </Button>
          </Space>
        </Space>
      ) : (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Tag color="blue">班次 {cur.shiftNo}</Tag>
            <Tag>收银员 {cur.cashierName}</Tag>
            <Text type="secondary">开班于 {String(cur.openedAt).replace('T', ' ').slice(0, 16)}</Text>
          </Space>

          <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="备用金">{money(cur.openingCash)}</Descriptions.Item>
            <Descriptions.Item label="本班订单">{cur.saleCount} 单</Descriptions.Item>
            <Descriptions.Item label="现金退款">{money(cur.refundCashAmount)}</Descriptions.Item>
            <Descriptions.Item label="现金收款"><Text strong>{money(cur.cashSaleAmount)}</Text></Descriptions.Item>
            <Descriptions.Item label="线上收款（微信/支付宝）">{money(cur.onlineSaleAmount)}</Descriptions.Item>
            <Descriptions.Item label="刷卡">{money(cur.cardSaleAmount)}</Descriptions.Item>
            <Descriptions.Item label="挂账">{money(cur.creditAmount)}</Descriptions.Item>
            <Descriptions.Item label="应有钱箱">
              <Text strong style={{ color: 'var(--color-primary)' }}>{money(cur.expectedCash)}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="差异">
              {diff == null ? (
                <Text type="secondary">待填写</Text>
              ) : diff === 0 ? (
                <Tag color="green">对平</Tag>
              ) : (
                <Tag color={diff > 0 ? 'orange' : 'red'}>{diff > 0 ? '长款' : '短款'} {Math.abs(diff).toFixed(2)}</Tag>
              )}
            </Descriptions.Item>
          </Descriptions>

          <Space wrap style={{ marginBottom: 24 }}>
            <Text>实点现金：</Text>
            <InputNumber
              min={0}
              precision={2}
              value={actualCash}
              onChange={(v) => setActualCash(v == null ? null : Number(v))}
              prefix="¥"
              style={{ width: 160 }}
            />
            <Input
              placeholder="差异原因（有差异时必填）"
              value={diffReason}
              onChange={(e) => setDiffReason(e.target.value)}
              style={{ width: 260 }}
            />
            <Button danger type="primary" icon={<LogoutOutlined />} onClick={() => void close()}>
              交班
            </Button>
          </Space>
        </>
      )}

      <Text strong>班次记录</Text>
      <Table<PosShift>
        size="small"
        rowKey="shiftNo"
        style={{ marginTop: 8 }}
        pagination={{ pageSize: 8, hideOnSinglePage: true }}
        dataSource={history}
        columns={[
          { title: '班次号', dataIndex: 'shiftNo', width: 190 },
          { title: '收银员', dataIndex: 'cashierName', width: 110 },
          { title: '备用金', dataIndex: 'openingCash', width: 100, render: money },
          { title: '现金收款', dataIndex: 'cashSaleAmount', width: 100, render: money },
          { title: '应有', dataIndex: 'expectedCash', width: 100, render: money },
          { title: '实点', dataIndex: 'actualCash', width: 100, render: (v: number | null) => (v == null ? '—' : money(v)) },
          {
            title: '差异',
            width: 110,
            render: (_: unknown, r: PosShift) => {
              const d = Number(r.diffAmount ?? 0);
              if (r.diffAmount == null) return <Text type="secondary">—</Text>;
              if (d === 0) return <Tag color="green">对平</Tag>;
              return <Tag color={d > 0 ? 'orange' : 'red'}>{d > 0 ? '长款' : '短款'} {Math.abs(d).toFixed(2)}</Tag>;
            },
          },
          {
            title: '状态',
            width: 90,
            render: (_: unknown, r: PosShift) => (r.status === 'OPEN' ? <Tag color="blue">上班中</Tag> : <Tag>已交班</Tag>),
          },
        ]}
      />
    </div>
  );
};

export default PosShiftPanel;
