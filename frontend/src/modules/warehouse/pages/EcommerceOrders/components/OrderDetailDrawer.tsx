import React from 'react';
import { Drawer, Descriptions, Divider, Tag, Typography } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { getPlatformTag } from '@/utils/platform';
import { STATUS_MAP, WH_MAP } from '../helpers';
import type { EcOrder } from '../types';

const { Text } = Typography;

interface Props {
  open: boolean;
  detail: EcOrder | null;
  onClose: () => void;
}

const OrderDetailDrawer: React.FC<Props> = ({ open, detail, onClose }) => {
  return (
    <Drawer open={open} onClose={onClose} title="订单详情" size={480}>
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
          <Divider style={{ margin: '12px 0' }}>商品 &amp; 金额</Divider>
          <Descriptions column={2} bordered>
            <Descriptions.Item label="商品名" span={2}>{detail.productName || '-'}</Descriptions.Item>
            <Descriptions.Item label="SKU">{detail.skuCode || '-'}</Descriptions.Item>
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
