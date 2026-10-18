import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Popconfirm, Space, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, ReloadOutlined, UndoOutlined } from '@ant-design/icons';
import { posApi, type PosHoldRow } from '@/services/pos/posApi';

const { Text } = Typography;

export interface PosHoldPanelProps {
  /** 取回后由收银台还原购物车 */
  onResumed: (payload: { lines: unknown[]; customerName: string | null; customerPhone: string | null; payMethod: string | null }) => void;
  /** 当前购物车行（挂单用） */
  cartLines: unknown[];
  customerName: string | null;
  customerPhone: string | null;
  payMethod: string | null;
}

/**
 * D-817：挂单面板（收银台内的一个 Tab）。
 *
 * <p>挂单是**暂存的购物区**，不是单据：不产生应收、不扣库存、不开小票、不进任何统计。
 * 它的存在只是为了让顾客临时离开时不丢购物车 —— 零售最高频却最容易被忽略的操作。
 */
const PosHoldPanel: React.FC<PosHoldPanelProps> = ({
  onResumed,
  cartLines,
  customerName,
  customerPhone,
  payMethod,
}) => {
  const [rows, setRows] = useState<PosHoldRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await posApi.holds(showClosed);
      setRows(Array.isArray(list) ? list : []);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载挂单失败');
    } finally {
      setLoading(false);
    }
  }, [showClosed]);

  useEffect(() => {
    void load();
  }, [load]);

  const doHold = useCallback(async () => {
    if (!cartLines.length) {
      message.warning('购物车是空的，没有需要挂起的商品');
      return;
    }
    try {
      const out = await posApi.hold({
        lines: cartLines,
        customerName,
        customerPhone,
        payMethod,
        remark: '收银台挂起',
      });
      message.success(`已挂起 ${out.itemCount} 件（单号 ${out.holdNo}），可清空购物车继续接下一位`);
      await load();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '挂单失败');
    }
  }, [cartLines, customerName, customerPhone, payMethod, load]);

  const resume = useCallback(
    async (holdNo: string) => {
      try {
        const out = await posApi.resumeHold(holdNo);
        onResumed({
          lines: out.lines ?? [],
          customerName: out.customerName,
          customerPhone: out.customerPhone,
          payMethod: out.payMethod,
        });
        message.success(`已取回 ${holdNo}`);
        await load();
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : '取回失败');
      }
    },
    [onResumed, load],
  );

  const discard = useCallback(
    async (holdNo: string) => {
      try {
        await posApi.discardHold(holdNo, '顾客放弃');
        message.success(`已丢弃 ${holdNo}`);
        await load();
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : '丢弃失败');
      }
    },
    [load],
  );

  return (
    <div className="pos-hold">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="挂单是暂存购物区，不是单据"
        description="挂起后不产生应收、不扣库存、不开小票、不计入任何统计；只有点「收款」才会变成真正的销售单。"
      />

      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={() => void doHold()} disabled={!cartLines.length}>
          挂起当前购物车（{cartLines.length} 行）
        </Button>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
          刷新
        </Button>
        <Button type={showClosed ? 'primary' : 'default'} onClick={() => setShowClosed((v) => !v)}>
          {showClosed ? '只看挂起中' : '含已处理'}
        </Button>
      </Space>

      <Table<PosHoldRow>
        size="small"
        rowKey="holdNo"
        loading={loading}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        dataSource={rows}
        columns={[
          { title: '挂单号', dataIndex: 'holdNo', width: 180 },
          {
            title: '客户',
            width: 150,
            render: (_: unknown, r: PosHoldRow) => r.customerName || <Text type="secondary">散客</Text>,
          },
          { title: '件数', dataIndex: 'itemCount', width: 70 },
          {
            title: '金额',
            width: 110,
            render: (_: unknown, r: PosHoldRow) => `¥${Number(r.goodsAmount ?? 0).toFixed(2)}`,
          },
          { title: '挂起人', dataIndex: 'creatorName', width: 110 },
          {
            title: '时间',
            dataIndex: 'createTime',
            width: 170,
            render: (v: string) => (v ? String(v).replace('T', ' ').slice(0, 16) : '—'),
          },
          {
            title: '状态',
            width: 90,
            render: (_: unknown, r: PosHoldRow) =>
              r.status === 'HELD' ? (
                <Tag color="blue">挂起中</Tag>
              ) : r.status === 'RESUMED' ? (
                <Tag>已取回</Tag>
              ) : (
                <Tag color="default">已丢弃</Tag>
              ),
          },
          {
            title: '操作',
            width: 150,
            render: (_: unknown, r: PosHoldRow) =>
              r.status === 'HELD' ? (
                <Space size={4}>
                  <Button size="small" type="link" icon={<UndoOutlined />} onClick={() => void resume(r.holdNo)}>
                    取回
                  </Button>
                  <Popconfirm title="丢弃该挂单？" description="顾客放弃购买。记录会保留可追溯。" onConfirm={() => void discard(r.holdNo)}>
                    <Button size="small" type="link" danger icon={<DeleteOutlined />}>
                      丢弃
                    </Button>
                  </Popconfirm>
                </Space>
              ) : (
                <Text type="secondary">—</Text>
              ),
          },
        ]}
      />
    </div>
  );
};

export default PosHoldPanel;
