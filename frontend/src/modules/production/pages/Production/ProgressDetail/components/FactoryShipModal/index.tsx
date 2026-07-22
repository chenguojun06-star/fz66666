import React, { useMemo, useState } from 'react';
import {
  Form, Radio, Button, AutoComplete, Input, Divider, Popconfirm,
} from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { ProductionOrder, FactoryShipment } from '@/types/production';
import type { ShippableInfo, ShipDetailItem, ShippedDetailSum } from '@/services/production/factoryShipmentApi';
import { parseProductionOrderLines } from '@/utils/api';
import ShipSummaryBar from './ShipSummaryBar';
import ReferenceMatrix from './ReferenceMatrix';
import ShipHistoryList from './ShipHistoryList';
import ShipDetailTable from './ShipDetailTable';

interface FactoryShipModalProps {
  open: boolean;
  orderNo?: string;
  orderRecord?: ProductionOrder | null;
  shippableInfo: ShippableInfo | null;
  form: FormInstance;
  loading: boolean;
  shipDetails: ShipDetailItem[];
  onShipDetailsChange: (details: ShipDetailItem[]) => void;
  onSubmit: () => void;
  onCancel: () => void;
  shipHistory?: FactoryShipment[];
  detailSum?: ShippedDetailSum[];
}

const COLOR_OPTIONS = ['黑色', '白色', '红色', '蓝色', '灰色', '米色', '绿色', '黄色', '粉色', '紫色'];

const FactoryShipModal: React.FC<FactoryShipModalProps> = ({
  open, orderNo, orderRecord, shippableInfo, form, loading,
  shipDetails, onShipDetailsChange, onSubmit, onCancel,
  shipHistory = [], detailSum = [],
}) => {
  const [confirmVisible, setConfirmVisible] = useState(false);
  const orderLines = useMemo(() => parseProductionOrderLines(orderRecord), [orderRecord]);

  const allSizes = useMemo(() => {
    const fromOrder = orderLines.map(l => l.size).filter(s => !!s?.trim());
    const fromDetails = shipDetails.map(d => d.sizeName).filter(s => !!s?.trim());
    const seen = new Set<string>();
    const result: string[] = [];
    [...fromOrder, ...fromDetails].forEach(s => {
      if (!seen.has(s)) { seen.add(s); result.push(s); }
    });
    return result;
  }, [orderLines, shipDetails]);

  const colorOptions = useMemo(() => {
    const fromOrder = [...new Set(orderLines.map(l => l.color).filter(Boolean))];
    return fromOrder.length > 0 ? fromOrder : COLOR_OPTIONS;
  }, [orderLines]);

  const currentTotal = shipDetails.reduce((sum, d) => sum + (d.quantity || 0), 0);
  const canShip = shippableInfo?.remaining ?? 0;
  const alreadyShipped = shippableInfo?.shippedTotal ?? 0;

  const shipType = Form.useWatch('shipMethod', form) ?? 'SELF_DELIVERY';

  const hasMatrix = allSizes.length > 0 && detailSum.length > 0;

  return (
    <ResizableModal
      open={open}
      title={`工厂发货 — ${orderNo ?? ''}`}
      width="85vw"
      initialHeight={Math.round(window.innerHeight * 0.82)}
      onCancel={onCancel}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onCancel}>取消</Button>
          <Popconfirm
            title="确认发货"
            description={`本次发货 ${currentTotal} 件，确认提交？`}
            onConfirm={onSubmit}
            okText="确认发货"
            cancelText="再想想"
            open={confirmVisible}
            onOpenChange={setConfirmVisible}
          >
            <Button type="primary" loading={loading} disabled={currentTotal <= 0}>
              确认发货
            </Button>
          </Popconfirm>
        </div>
      }
      destroyOnHidden
    >
      <ShipSummaryBar
        shippableInfo={shippableInfo}
        alreadyShipped={alreadyShipped}
        canShip={canShip}
        currentTotal={currentTotal}
      />

      {hasMatrix && (
        <ReferenceMatrix
          orderRecord={orderRecord}
          detailSum={detailSum}
          allSizes={allSizes}
        />
      )}

      <ShipHistoryList shipHistory={shipHistory} />

      <Divider style={{ margin: '8px 0 12px' }} />

      <Form form={form} layout="vertical">
        <Form.Item label="发货方式" name="shipMethod" initialValue="SELF_DELIVERY" style={{ marginBottom: 10 }}>
          <Radio.Group>
            <Radio value="SELF_DELIVERY" style={{ marginRight: 24 }}>自发货</Radio>
            <Radio value="EXPRESS">快递发货</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item label="本次发货明细" style={{ marginBottom: 8 }}>
          <ShipDetailTable
            shipDetails={shipDetails}
            onShipDetailsChange={onShipDetailsChange}
            colorOptions={colorOptions}
            allSizes={allSizes}
            orderRecord={orderRecord}
            detailSum={detailSum}
          />
        </Form.Item>

        {shipType === 'EXPRESS' && (
          <>
            <Form.Item label="快递公司" name="expressCompany" style={{ marginBottom: 8 }}>
              <AutoComplete
                options={['顺丰速运', '中通快递', '圆通快递', '韵达快递', '申通快递', '京东快递'].map(v => ({ value: v }))}
                placeholder="请填写快递公司"
              />
            </Form.Item>
            <Form.Item label="快递单号" name="trackingNo" style={{ marginBottom: 8 }}>
              <Input placeholder="请填写快递单号" />
            </Form.Item>
          </>
        )}

        <Form.Item label="备注" name="remarks" style={{ marginBottom: 0 }}>
          <Input.TextArea autoSize={{ minRows: 2 }} placeholder="选填备注" />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default FactoryShipModal;
