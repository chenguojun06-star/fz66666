import React, { useMemo } from 'react';
import { Button, Card, Dropdown, InputNumber, Select, Space, Tag, Tooltip } from 'antd';
import { DeleteOutlined, DownOutlined, ImportOutlined, PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { STAGE_ACCENT, STAGE_ACCENT_LIGHT } from '@/utils/stageStyles';
import { CUTTING_STAGE_ORDER, computeStageSortedAndSpan } from '@/utils/productionStage';
import type { CuttingCreateTaskState } from '../hooks';
import { useTemplateImport } from './useTemplateImport';
import { cardStyle } from './helpers';

interface Props {
  createTask: CuttingCreateTaskState;
  debouncedFetchStyleInfoOptions: (v: string) => void;
}

const ProcessFlowCard: React.FC<Props> = ({ createTask, debouncedFetchStyleInfoOptions }) => {
  const { sorted, spanMap } = computeStageSortedAndSpan(createTask.createProcessNodes, CUTTING_STAGE_ORDER);
  const template = useTemplateImport(createTask);

  const _stageSummary = useMemo(() => {
    const stages: Record<string, { count: number; total: number }> = {};
    CUTTING_STAGE_ORDER.forEach((s) => { stages[s] = { count: 0, total: 0 }; });
    createTask.createProcessNodes.forEach((n) => {
      const stage = String(n.progressStage || '').trim() || '裁剪';
      const price = Number(n.unitPrice || 0) || 0;
      if (stages[stage]) {
        stages[stage].count += 1;
        stages[stage].total += price;
      }
    });
    return stages;
  }, [createTask.createProcessNodes]);

  const totalCost = useMemo(() => {
    return createTask.createProcessNodes.reduce((sum, n) => sum + (Number(n.unitPrice || 0) || 0), 0);
  }, [createTask.createProcessNodes]);

  const uniqueSizes = useMemo(() => {
    const sizeSet = new Set<string>();
    createTask.createOrderLines.forEach((l) => {
      if (l.size) sizeSet.add(l.size);
    });
    return Array.from(sizeSet);
  }, [createTask.createOrderLines]);

  const colCount = 9 + uniqueSizes.length;

  const handleUpdateSizePrice = (nodeIndex: number, size: string, value: number) => {
    createTask.setCreateProcessNodes((prev) =>
      prev.map((n, idx) => {
        if (idx !== nodeIndex) return n;
        return { ...n, sizePrices: { ...(n.sizePrices || {}), [size]: value } };
      })
    );
  };

  const handleAddToStage = (stage: string) => {
    createTask.addProcessNodeToStage(stage);
  };

  return (
    <Card

      title={
        <span>
          工序流程
          <Tooltip title="填写款号自动加载工序模板，可自由增减子工序和修改单价，工序单价直接影响工资结算">
            <QuestionCircleOutlined style={{ marginLeft: 6, color: 'var(--color-primary)', cursor: 'help' }} />
          </Tooltip>
        </span>
      }
      extra={
        <Space size={8}>
          <Select
            showSearch

            style={{ width: 180 }}
            placeholder="选择款号导入模板"
            value={template.templateStyleNo || undefined}
            onSearch={(v) => debouncedFetchStyleInfoOptions(v)}
            onChange={(v) => template.setTemplateStyleNo(v)}
            filterOption={false}
            loading={createTask.createStyleLoading}
            options={createTask.createStyleOptions.map((s) => ({ label: `${s.styleNo}${s.styleName ? ` - ${s.styleName}` : ''}`, value: s.styleNo }))}
            allowClear
          />
          <Button

            type="primary"
            ghost
            icon={<ImportOutlined />}
            loading={template.templateLoading}
            disabled={!template.templateStyleNo.trim()}
            onClick={template.handleImportTemplate}
          >
            模板导入
          </Button>
          <Dropdown
            menu={{
              items: CUTTING_STAGE_ORDER.map((s) => ({ key: s, label: s, icon: <PlusOutlined /> })),
              onClick: ({ key }) => handleAddToStage(key),
            }}
          >
            <Button type="dashed" icon={<PlusOutlined />}>
              添加工序 <DownOutlined />
            </Button>
          </Dropdown>
        </Space>
      }
      style={{ marginBottom: 12 }}
    >
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={cardStyle}>
          <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>工序单价（总计）</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>¥{totalCost.toFixed(2)}</span>
          <span style={{ fontSize: 14, color: 'var(--color-text-quaternary)', marginLeft: 'auto' }}>{createTask.createProcessNodes.length} 道工序</span>
        </div>
      </div>

      <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 900 + uniqueSizes.length * 90 }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 100 }} />
            {uniqueSizes.map((s) => <col key={s} style={{ width: 90 }} />)}
            <col style={{ width: 50 }} />
          </colgroup>
          <thead>
            <tr style={{ background: 'var(--color-bg-container)' }}>
              <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>排序</th>
              <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>工序编号</th>
              <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>工序名称</th>
              <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>进度节点</th>
              <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>机器类型</th>
              <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>工序难度</th>
              <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>工时(秒)</th>
              <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>工价(元)</th>
              {uniqueSizes.map((s) => (
                <th key={s} style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>{s}码</th>
              ))}
              <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((node, index) => {
              const spanInfo = spanMap.get(index);
              const originalIndex = createTask.createProcessNodes.indexOf(node);
              return (
                <tr key={`process-row-${originalIndex}`}>
                  <td style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--color-border-light)' }}>
                    {index + 1}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--color-border-light)', color: 'var(--color-text-tertiary)' }}>
                    {String(index + 1).padStart(2, '0')}
                  </td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid var(--color-border-light)' }}>
                    <DictAutoComplete
                      dictType="process_name"
                      autoCollect
                      value={node.name}
                      placeholder="请选择或输入工序名称"
                      style={{ width: '100%' }}
                      onChange={(v) => createTask.updateProcessNode(originalIndex, 'name', v)}
                    />
                  </td>
                  {spanInfo && spanInfo.rowSpan > 0 ? (
                    <td
                      rowSpan={spanInfo.rowSpan}
                      style={{
                        padding: '8px 8px',
                        background: STAGE_ACCENT_LIGHT,
                        borderLeft: `3px solid ${STAGE_ACCENT}`,
                        verticalAlign: 'middle',
                        textAlign: 'center',
                        borderBottom: '1px solid var(--color-border-light)',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <Tag style={{ background: STAGE_ACCENT, color: 'var(--color-bg-base)', border: 'none', fontWeight: 600, fontSize: 14 }}>
                          {spanInfo.stage}
                        </Tag>
                        <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>{spanInfo.count} 个工序</span>
                        <Button
                          type="link"

                          icon={<PlusOutlined />}
                          onClick={() => handleAddToStage(spanInfo.stage)}
                          style={{ fontSize: 14, padding: 0 }}
                        >
                          添加
                        </Button>
                      </div>
                    </td>
                  ) : null}
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid var(--color-border-light)' }}>
                    <DictAutoComplete
                      dictType="machine_type"
                      autoCollect
                      value={node.machineType || ''}
                      placeholder="请选择或输入"
                      style={{ width: '100%' }}
                      onChange={(v) => createTask.updateProcessNode(originalIndex, 'machineType', v)}
                    />
                  </td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid var(--color-border-light)' }}>
                    <Select

                      value={node.difficulty || undefined}
                      allowClear
                      placeholder="选择"
                      style={{ width: '100%' }}
                      onChange={(v) => createTask.updateProcessNode(originalIndex, 'difficulty', v || '')}
                      options={[
                        { value: '易', label: '易' },
                        { value: '中', label: '中' },
                        { value: '难', label: '难' },
                      ]}
                    />
                  </td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid var(--color-border-light)' }}>
                    <InputNumber

                      value={node.standardTime || 0}
                      style={{ width: '100%' }}
                      min={0}
                      onChange={(v) => createTask.updateProcessNode(originalIndex, 'standardTime', typeof v === 'number' ? v : 0)}
                    />
                  </td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid var(--color-border-light)' }}>
                    <InputNumber

                      value={node.unitPrice}
                      style={{ width: '100%' }}
                      min={0}
                      precision={2}
                      step={0.01}
                      prefix="¥"
                      placeholder="0"
                      onChange={(v) => createTask.updateProcessNode(originalIndex, 'unitPrice', typeof v === 'number' ? v : 0)}
                    />
                  </td>
                  {uniqueSizes.map((s) => (
                    <td key={s} style={{ padding: '4px 6px', borderBottom: '1px solid var(--color-border-light)' }}>
                      <InputNumber

                        value={node.sizePrices?.[s] ?? node.unitPrice}
                        style={{ width: '100%' }}
                        min={0}
                        precision={2}
                        step={0.01}
                        prefix="¥"
                        onChange={(v) => handleUpdateSizePrice(originalIndex, s, typeof v === 'number' ? v : 0)}
                      />
                    </td>
                  ))}
                  <td style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--color-border-light)' }}>
                    <Button

                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      disabled={createTask.createProcessNodes.length <= 1}
                      onClick={() => createTask.removeProcessNode(originalIndex)}
                    />
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={colCount} style={{ padding: 16, textAlign: 'center', color: 'rgba(0,0,0,0.25)' }}>
                  暂无工序，点击"添加工序"开始
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default ProcessFlowCard;
