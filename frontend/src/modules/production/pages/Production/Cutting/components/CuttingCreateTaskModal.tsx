import React from 'react';
import { AutoComplete, Button, Card, Input, InputNumber, Space } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { UnifiedDatePicker, dayjs } from '@/components/common/UnifiedDatePicker';
import type { CuttingCreateTaskState } from '../hooks';

interface Props {
  createTask: CuttingCreateTaskState;
}

const CuttingCreateTaskModal: React.FC<Props> = ({ createTask }) => {
  return (
    <ResizableModal
      open={createTask.createTaskOpen}
      title="新建裁剪任务"
      width="60vw"
      centered
      onCancel={() => createTask.setCreateTaskOpen(false)}
      okText="创建"
      confirmLoading={createTask.createTaskSubmitting}
      onOk={createTask.handleSubmitCreateTask}
    >
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <span>款号</span>
          <AutoComplete
            value={createTask.createStyleNo}
            style={{ width: 260 }}
            placeholder="输入或选择已维护工价的款号"
            options={createTask.createStyleOptions.map((x) => ({
              value: x.styleNo,
              label: x.styleName ? `${x.styleNo}（${x.styleName}）` : x.styleNo,
            }))}
            onSearch={(v) => createTask.fetchStyleInfoOptions(v)}
            onChange={(v) => createTask.handleStyleNoChange(v)}
            filterOption={false}
            allowClear
            onClear={() => createTask.handleStyleNoChange('')}
          />
          <span>下单日期</span>
          <UnifiedDatePicker
            value={createTask.createOrderDate ? dayjs(createTask.createOrderDate, 'YYYY-MM-DD') : null}
            style={{ width: 160 }}
            placeholder="请选择下单日期"
            onChange={(value) => createTask.setCreateOrderDate(Array.isArray(value) ? '' : (value ? value.format('YYYY-MM-DD') : ''))}
          />
          <span>订单交期</span>
          <UnifiedDatePicker
            value={createTask.createDeliveryDate ? dayjs(createTask.createDeliveryDate, 'YYYY-MM-DD') : null}
            style={{ width: 160 }}
            placeholder="请选择订单交期"
            onChange={(value) => createTask.setCreateDeliveryDate(Array.isArray(value) ? '' : (value ? value.format('YYYY-MM-DD') : ''))}
          />
        </Space>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'rgba(0,0,0,0.85)', fontWeight: 500 }}>下单明细</span>
            <Button size="small" type="dashed" onClick={createTask.addCreateOrderLine}>新增一行</Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {createTask.createOrderLines.map((line, index) => (
              <Space key={`order-line-${index}`} wrap style={{ display: 'flex' }}>
                <span style={{ minWidth: 44 }}>颜色</span>
                <Input
                  value={line.color}
                  style={{ width: 160 }}
                  placeholder="必填，如 黑色"
                  onChange={(e) => createTask.updateCreateOrderLine(index, 'color', e.target.value)}
                />
                <span style={{ minWidth: 44 }}>尺码</span>
                <Input
                  value={line.size}
                  style={{ width: 140 }}
                  placeholder="必填，如 XL"
                  onChange={(e) => createTask.updateCreateOrderLine(index, 'size', e.target.value)}
                />
                <span style={{ minWidth: 44 }}>数量</span>
                <InputNumber
                  value={line.quantity}
                  style={{ width: 140 }}
                  min={1}
                  precision={0}
                  placeholder="必填"
                  onChange={(value) => createTask.updateCreateOrderLine(index, 'quantity', typeof value === 'number' ? value : null)}
                />
                <Button
                  size="small"
                  danger
                  disabled={createTask.createOrderLines.length <= 1}
                  onClick={() => createTask.removeCreateOrderLine(index)}
                >
                  删除
                </Button>
              </Space>
            ))}
          </div>
        </div>
        {createTask.createStyleName ? (
          <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>款名：{createTask.createStyleName}</div>
        ) : null}
      </Card>

      <Card size="small">
        <div style={{ color: 'rgba(0,0,0,0.65)', lineHeight: 1.8 }}>
          这里会先创建一条带基础下单信息的模板款号生产订单与裁剪任务起点。
          创建完成后，领取、生成菲号、打印裁剪单，继续回到裁剪页按正常订单逻辑处理。
        </div>
      </Card>
    </ResizableModal>
  );
};

export default CuttingCreateTaskModal;
