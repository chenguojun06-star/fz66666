import React from 'react';
import { Button, Card, Input, InputNumber, Popconfirm, Space, Tag } from 'antd';
import CircleIconButton, { TagMinusCloseIcon } from '@/components/common/CircleIconButton';
import type { CuttingCreateTaskState } from '../hooks';
import { useMatrixInput } from './useMatrixInput';

interface Props {
  createTask: CuttingCreateTaskState;
}

const OrderLinesCard: React.FC<Props> = ({ createTask }) => {
  const matrix = useMatrixInput(createTask);

  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: 'rgba(0,0,0,0.85)', fontWeight: 50 }}>下单明细</span>
        <CircleIconButton type="add" size={24} title="新增一行" onClick={createTask.addCreateOrderLine} />
      </div>

      {/* ── 快速批量录入：颜色+码数 → 生成明细行 ───────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '6px 0', marginBottom: 8, borderBottom: '1px dashed var(--color-border)' }}>
        <span style={{ fontSize: 14, color: 'var(--color-text-secondary)', flexShrink: 0 }}>颜色</span>
        {matrix.matrixColors.map((c) => (
          <Tag
            key={c}
            closable
            color="blue"
            closeIcon={<TagMinusCloseIcon />}
            style={{ fontSize: 14, margin: 0 }}
            onClose={() => matrix.removeMatrixColor(c)}
          >{c}</Tag>
        ))}
        <Input

          style={{ width: 104 }}
          placeholder="输入颜色"
          value={matrix.colorInput}
          onChange={(e) => matrix.setColorInput(e.target.value)}
          onPressEnter={matrix.addMatrixColor}
          suffix={<CircleIconButton type="add" size={18} title="添加颜色" onClick={matrix.addMatrixColor} />}
        />
        <span style={{ fontSize: 14, color: 'var(--color-text-secondary)', flexShrink: 0, marginLeft: 8 }}>码数</span>
        {matrix.matrixSizes.map((s) => (
          <Tag
            key={s}
            closable
            color="blue"
            closeIcon={<TagMinusCloseIcon />}
            style={{ fontSize: 14, margin: 0 }}
            onClose={() => matrix.removeMatrixSize(s)}
          >{s}</Tag>
        ))}
        <Input

          style={{ width: 104 }}
          placeholder="输入码数"
          value={matrix.sizeInput}
          onChange={(e) => matrix.setSizeInput(e.target.value)}
          onPressEnter={matrix.addMatrixSize}
          suffix={<CircleIconButton type="add" size={18} title="添加码数" onClick={matrix.addMatrixSize} />}
        />
        {matrix.matrixColors.length > 0 && matrix.matrixSizes.length > 0 && (
          <Button type="primary" onClick={matrix.handleMatrixImport} style={{ marginLeft: 4 }}>
            生成明细（{matrix.matrixColors.length}色×{matrix.matrixSizes.length}码={matrix.matrixColors.length * matrix.matrixSizes.length}行）
          </Button>
        )}
      </div>
      {/* ─────────────────────────────────────────────────────────── */}
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
            <Popconfirm title="确定删除此行吗？" onConfirm={() => createTask.removeCreateOrderLine(index)} okText="确定" cancelText="取消">
              <CircleIconButton
                type="remove"
                size={24}
                title="删除此行"
                disabled={createTask.createOrderLines.length <= 1}
              />
            </Popconfirm>
          </Space>
        ))}
      </div>
      {createTask.createStyleName ? (
        <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>款名：{createTask.createStyleName}</div>
      ) : null}
    </Card>
  );
};

export default OrderLinesCard;
