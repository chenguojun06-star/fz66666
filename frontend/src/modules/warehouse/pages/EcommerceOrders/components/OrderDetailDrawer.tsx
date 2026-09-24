import React from 'react';
import { Drawer, Descriptions, Divider, Spin, Tag, Typography } from 'antd';
import { CheckCircleOutlined, DeploymentUnitOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { getPlatformTag } from '@/utils/platform';
import { comboProductApi, type ComboProductVO } from '@/services/warehouse/comboProductApi';
import { STATUS_MAP, WH_MAP } from '../helpers';
import type { EcOrder } from '../types';

const { Text } = Typography;

interface Props {
  open: boolean;
  detail: EcOrder | null;
  onClose: () => void;
}

/** D-532：套装订单的子商品构成（按组合编码实时查组合商品） */
const ComboSection: React.FC<{ comboCode: string }> = ({ comboCode }) => {
  const [combo, setCombo] = React.useState<ComboProductVO | null>(null);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    comboProductApi.list({ page: 1, pageSize: 1, keyword: comboCode })
      .then((data) => { if (!cancelled) setCombo(data?.records?.[0] || null); })
      .catch(() => { if (!cancelled) setCombo(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [comboCode]);

  return (
    <Spin spinning={loading}>
      <Descriptions column={2} bordered size="small" style={{ marginBottom: 8 }}>
        <Descriptions.Item label="组合编码"><Tag color="geekblue" style={{ margin: 0 }}><DeploymentUnitOutlined /> {comboCode}</Tag></Descriptions.Item>
        <Descriptions.Item label="组合可售">
          <span className="u-fw-600" style={{ color: (combo?.availableStock || 0) > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {combo?.availableStock ?? '-'} 套
          </span>
        </Descriptions.Item>
      </Descriptions>
      <ResizableTable
        size="small"
        columns={[
          { title: '商品编码', dataIndex: 'skuCode', width: 190, render: (v: string) => <span style={{ fontFamily: 'var(--font-family-mono, monospace)' }}>{v}</span> },
          { title: '款号', dataIndex: 'styleNo', width: 120, render: (v: string) => v || '-' },
          { title: '颜色及规格', key: 'cs', width: 120, render: (_: unknown, r: ComboProductVO['items'][number]) => [r.color, r.size].filter(Boolean).join('/') || '-' },
          { title: '单套数量', dataIndex: 'quantity', width: 80, align: 'right' as const },
          {
            title: '子SKU可用', dataIndex: 'availableQty', width: 90, align: 'right' as const,
            render: (v: number | undefined) => <span style={{ color: (v || 0) > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{v ?? 0}</span>,
          },
        ] as never}
        dataSource={(combo?.items || []) as never}
        rowKey="skuCode"
        pagination={false}
        emptyDescription="未找到组合商品定义（可能已删除）"
      />
      <div className="u-fs-12 u-mt-8" style={{ color: 'var(--color-text-tertiary)' }}>
        出库时按上方子SKU逐个扣减库存，每个子SKU生成一行出库记录（共用一张出库单号），销售金额按套装单价分摊。
      </div>
    </Spin>
  );
};

const OrderDetailDrawer: React.FC<Props> = ({ open, detail, onClose }) => {
  return (
    <Drawer open={open} onClose={onClose} title="订单详情" styles={{ wrapper: { width: '85%' } }}>
      {detail && (
        <>
          <Descriptions column={2} bordered>
            <Descriptions.Item label="平台">
              <Tag color={getPlatformTag(detail.sourcePlatformCode).color}>
                {getPlatformTag(detail.sourcePlatformCode).label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="平台订单号">{detail.platformOrderNo || '-'}</Descriptions.Item>
            <Descriptions.Item label="内部单号" span={2}>{detail.orderNo}</Descriptions.Item>
            <Descriptions.Item label="订单状态">
              <Tag color={STATUS_MAP[detail.status]?.color}>{STATUS_MAP[detail.status]?.label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="仓库状态">
              <Tag color={WH_MAP[detail.warehouseStatus]?.color}>{WH_MAP[detail.warehouseStatus]?.label}</Tag>
            </Descriptions.Item>
          </Descriptions>
          {detail.comboCode && (
            <>
              <Divider style={{ margin: '12px 0' }}>组合套装构成</Divider>
              <ComboSection comboCode={detail.comboCode} />
            </>
          )}
          <Divider style={{ margin: '12px 0' }}>商品 &amp; 金额</Divider>
          <Descriptions column={2} bordered>
            <Descriptions.Item label="商品名" span={2}>{detail.productName || '-'}</Descriptions.Item>
            <Descriptions.Item label="商品编码">{detail.skuCode || '-'}</Descriptions.Item>
            <Descriptions.Item label="数量">{detail.quantity} 件</Descriptions.Item>
            <Descriptions.Item label="商品单价">¥{detail.unitPrice ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="订单总额">¥{detail.totalAmount ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="实付金额">
              <Text style={{ color: 'var(--color-warning)', fontWeight: 700 }}>¥{detail.payAmount ?? '-'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="运费">¥{detail.freight ?? 0}</Descriptions.Item>
            <Descriptions.Item label="优惠">-¥{detail.discount ?? 0}</Descriptions.Item>
            <Descriptions.Item label="支付方式">{detail.payType || '-'}</Descriptions.Item>
          </Descriptions>
          <Divider style={{ margin: '12px 0' }}>收件人</Divider>
          <Descriptions column={1} bordered>
            <Descriptions.Item label="姓名">{detail.receiverName}</Descriptions.Item>
            <Descriptions.Item label="电话">{detail.receiverPhone}</Descriptions.Item>
            <Descriptions.Item label="地址">{detail.receiverAddress}</Descriptions.Item>
          </Descriptions>
          <Divider style={{ margin: '12px 0' }}>物流 &amp; 关联</Divider>
          <Descriptions column={2} bordered>
            <Descriptions.Item label="快递公司">{detail.expressCompany || '-'}</Descriptions.Item>
            <Descriptions.Item label="快递单号">{detail.trackingNo || '-'}</Descriptions.Item>
            <Descriptions.Item label="关联生产单" span={2}>
              {detail.productionOrderNo
                ? <Tag color="blue" icon={<CheckCircleOutlined />}>{detail.productionOrderNo}</Tag>
                : <Tag color="orange">待处理 — 需关联生产单或现货出库</Tag>}
            </Descriptions.Item>
          </Descriptions>
          {(detail.buyerRemark || detail.sellerRemark) && (
            <>
              <Divider style={{ margin: '12px 0' }}>备注</Divider>
              <Descriptions column={1} bordered>
                {detail.buyerRemark && <Descriptions.Item label="买家备注">{detail.buyerRemark}</Descriptions.Item>}
                {detail.sellerRemark && <Descriptions.Item label="卖家备注">{detail.sellerRemark}</Descriptions.Item>}
              </Descriptions>
            </>
          )}
          <Divider style={{ margin: '12px 0' }}>时间节点</Divider>
          <Descriptions column={1} bordered>
            <Descriptions.Item label="下单时间">{detail.createTime?.slice(0, 16)}</Descriptions.Item>
            <Descriptions.Item label="付款时间">{detail.payTime?.slice(0, 16) || '-'}</Descriptions.Item>
            <Descriptions.Item label="发货时间">{detail.shipTime?.slice(0, 16) || '-'}</Descriptions.Item>
            <Descriptions.Item label="完成时间">{detail.completeTime?.slice(0, 16) || '-'}</Descriptions.Item>
          </Descriptions>
        </>
      )}
    </Drawer>
  );
};

export default OrderDetailDrawer;
