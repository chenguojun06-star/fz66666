import React, { useMemo, useState } from 'react';
import { AutoComplete, Button, Card, Dropdown, Input, InputNumber, Select, Segmented, Space, Tag, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, DownOutlined, QuestionCircleOutlined, ImportOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import { UnifiedDatePicker, dayjs } from '@/components/common/UnifiedDatePicker';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { STAGE_ACCENT, STAGE_ACCENT_LIGHT } from '@/utils/stageStyles';
import { CUTTING_STAGE_ORDER, computeStageSortedAndSpan } from '@/utils/productionStage';
import type { FactoryCapacityItem } from '@/services/production/productionApi';
import type { CuttingCreateTaskState } from '../hooks';

interface Props {
  createTask: CuttingCreateTaskState;
}

const CuttingCreateTaskModal: React.FC<Props> = ({ createTask }) => {
  const { sorted, spanMap } = computeStageSortedAndSpan(createTask.createProcessNodes, CUTTING_STAGE_ORDER);

  // ── 快速批量录入 状态 ──────────────────────────────────────────────────
  const [matrixColors, setMatrixColors] = useState<string[]>([]);
  const [matrixSizes, setMatrixSizes] = useState<string[]>([]);
  const [colorInput, setColorInput] = useState('');
  const [sizeInput, setSizeInput] = useState('');

  const addMatrixColor = () => {
    const v = colorInput.trim();
    if (!v || matrixColors.includes(v)) { setColorInput(''); return; }
    setMatrixColors((prev) => [...prev, v]);
    setColorInput('');
  };

  const addMatrixSize = () => {
    const v = sizeInput.trim();
    if (!v || matrixSizes.includes(v)) { setSizeInput(''); return; }
    setMatrixSizes((prev) => [...prev, v]);
    setSizeInput('');
  };

  const handleMatrixImport = () => {
    if (matrixColors.length === 0 || matrixSizes.length === 0) return;
    // 生成 颜色×码数 组合行，数量留空由用户填写
    const newLines: { color: string; size: string; quantity: number | null }[] = [];
    for (const c of matrixColors) {
      for (const s of matrixSizes) {
        newLines.push({ color: c, size: s, quantity: null });
      }
    }
    createTask.setCreateOrderLines((prev) => {
      const filled = prev.filter((l) => l.color || l.size || l.quantity);
      return [...(filled.length ? filled : []), ...newLines];
    });
    setMatrixColors([]);
    setMatrixSizes([]);
  };
  // ─────────────────────────────────────────────────────────────────────

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

  const cardStyle: React.CSSProperties = {
    padding: '6px 10px',
    background: '#fafafa',
    borderRadius: 6,
    border: '1px solid #e8e8e8',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const uniqueSizes = useMemo(() => {
    const sizeSet = new Set<string>();
    createTask.createOrderLines.forEach((l) => {
      if (l.size) sizeSet.add(l.size);
    });
    return Array.from(sizeSet);
  }, [createTask.createOrderLines]);

  const handleUpdateSizePrice = (nodeIndex: number, size: string, value: number) => {
    createTask.setCreateProcessNodes((prev) =>
      prev.map((n, idx) => {
        if (idx !== nodeIndex) return n;
        return { ...n, sizePrices: { ...(n.sizePrices || {}), [size]: value } };
      })
    );
  };

  const colCount = 9 + uniqueSizes.length;

  const handleAddToStage = (stage: string) => {
    createTask.addProcessNodeToStage(stage);
  };

  const [templateStyleNo, setTemplateStyleNo] = useState<string>('');
  const [templateLoading, setTemplateLoading] = useState(false);

  const handleImportTemplate = async () => {
    const sn = templateStyleNo.trim();
    if (!sn) return;
    setTemplateLoading(true);
    try {
      await createTask.importFromTemplate(sn);
    } finally {
      setTemplateLoading(false);
    }
  };

  return (
    <ResizableModal
      open={createTask.createTaskOpen}
      title="无资料下单"
      width="70vw"
      initialHeight={Math.round(window.innerHeight * 0.82)}
      centered
      onCancel={() => createTask.setCreateTaskOpen(false)}
      okText="创建"
      confirmLoading={createTask.createTaskSubmitting}
      onOk={createTask.handleSubmitCreateTask}
    >
      <Card style={{ marginBottom: 12 }}>
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
            onSelect={(v) => createTask.handleStyleNoSelect(String(v || ''))}
            onBlur={createTask.handleStyleNoBlur}
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
          <span>生产方</span>
          <Segmented
            value={createTask.createFactoryMode}
            options={[
              { label: '内部工厂', value: 'INTERNAL' },
              { label: '外发加工', value: 'EXTERNAL' },
            ]}
            style={{ width: 220 }}
            onChange={(value) => {
              const nextMode = value as 'INTERNAL' | 'EXTERNAL';
              createTask.setCreateFactoryMode(nextMode);
              createTask.setCreateOrgUnitId('');
              createTask.setCreateFactoryId('');
              if (nextMode === 'INTERNAL') {
                createTask.fetchInternalUnitOptions();
              } else {
                createTask.fetchFactoryOptions('', nextMode);
              }
            }}
          />
          <Select
            value={createTask.createFactoryMode === 'INTERNAL'
              ? (createTask.createOrgUnitId || undefined)
              : (createTask.createFactoryId || undefined)}
            style={{ width: 290 }}
            placeholder={createTask.createFactoryMode === 'INTERNAL' ? '请选择内部生产组/车间' : '请选择外发工厂'}
            showSearch
            allowClear
            loading={createTask.createFactoryLoading}
            filterOption={createTask.createFactoryMode === 'INTERNAL'}
            optionFilterProp="label"
            onSearch={(value) => {
              if (createTask.createFactoryMode === 'EXTERNAL') {
                createTask.fetchFactoryOptions(value, createTask.createFactoryMode);
              }
            }}
            onChange={(value) => {
              if (createTask.createFactoryMode === 'INTERNAL') {
                createTask.setCreateOrgUnitId(String(value || ''));
              } else {
                createTask.setCreateFactoryId(String(value || ''));
              }
            }}
            options={createTask.createFactoryMode === 'INTERNAL'
              ? createTask.createInternalUnitOptions.map((unit) => ({
                  value: String(unit.id || '').trim(),
                  label: String(unit.pathNames || unit.unitName || unit.nodeName || '').trim(),
                }))
              : createTask.createFactoryOptions.map((factory) => ({
                  value: String(factory.id || '').trim(),
                  label: `${factory.factoryName}${factory.factoryType === 'INTERNAL' ? '（本厂）' : '（外发）'}`,
                }))}
          />
        </Space>
        {createTask.selectedFactoryStat && <FactoryCapacityCard stat={createTask.selectedFactoryStat} />}
        <div style={{ display: 'flex', gap: 16, marginTop: 12, alignItems: 'flex-start' }}>
          {/* 左：款式图上传（支持点击/拖拽/粘贴） */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ color: 'rgba(0,0,0,0.65)', marginBottom: 6, fontSize: 13 }}>款式图</div>
            <ImageUploadBox
              value={createTask.createStyleImageUrl}
              onChange={(url) => createTask.setCreateStyleImageUrl(url)}
              width={120}
              height={150}
              enableDrop
              maxSizeMB={10}
              label="点击/拖拽/粘贴上传"
              borderRadius={6}
            />
          </div>
          {/* 右：下单明细 */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'rgba(0,0,0,0.85)', fontWeight: 500 }}>下单明细</span>
              <Button type="dashed" onClick={createTask.addCreateOrderLine}>新增一行</Button>
            </div>

            {/* ── 快速批量录入：颜色+码数 → 生成明细行 ───────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '6px 0', marginBottom: 8, borderBottom: '1px dashed #e8e8e8' }}>
              <span style={{ fontSize: 12, color: '#555', flexShrink: 0 }}>颜色</span>
              {matrixColors.map((c) => (
                <Tag
                  key={c}
                  closable
                  color="blue"
                  style={{ fontSize: 12, margin: 0 }}
                  onClose={() => setMatrixColors((prev) => prev.filter((x) => x !== c))}
                >{c}</Tag>
              ))}
              <Input
               
                style={{ width: 88 }}
                placeholder="输入颜色"
                value={colorInput}
                onChange={(e) => setColorInput(e.target.value)}
                onPressEnter={addMatrixColor}
                suffix={<PlusOutlined style={{ cursor: 'pointer', color: '#1677ff' }} onClick={addMatrixColor} />}
              />
              <span style={{ fontSize: 12, color: '#555', flexShrink: 0, marginLeft: 8 }}>码数</span>
              {matrixSizes.map((s) => (
                <Tag
                  key={s}
                  closable
                  color="blue"
                  style={{ fontSize: 12, margin: 0 }}
                  onClose={() => setMatrixSizes((prev) => prev.filter((x) => x !== s))}
                >{s}</Tag>
              ))}
              <Input
               
                style={{ width: 88 }}
                placeholder="输入码数"
                value={sizeInput}
                onChange={(e) => setSizeInput(e.target.value)}
                onPressEnter={addMatrixSize}
                suffix={<PlusOutlined style={{ cursor: 'pointer', color: '#1677ff' }} onClick={addMatrixSize} />}
              />
              {matrixColors.length > 0 && matrixSizes.length > 0 && (
                <Button type="primary" onClick={handleMatrixImport} style={{ marginLeft: 4 }}>
                  生成明细（{matrixColors.length}色×{matrixSizes.length}码={matrixColors.length * matrixSizes.length}行）
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
                  <Button
                   
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
        </div>
        {createTask.createStyleName ? (
          <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>款名：{createTask.createStyleName}</div>
        ) : null}
      </Card>

      <Card
       
        title={
          <span>
            工序流程
            <Tooltip title="填写款号自动加载工序模板，可自由增减子工序和修改单价，工序单价直接影响工资结算">
              <QuestionCircleOutlined style={{ marginLeft: 6, color: '#1677ff', cursor: 'help' }} />
            </Tooltip>
          </span>
        }
        extra={
          <Space size={8}>
            <Select
              showSearch
             
              style={{ width: 180 }}
              placeholder="选择款号导入模板"
              value={templateStyleNo || undefined}
              onSearch={(v) => createTask.fetchStyleInfoOptions(v)}
              onChange={(v) => setTemplateStyleNo(v)}
              filterOption={false}
              loading={createTask.createStyleLoading}
              options={createTask.createStyleOptions.map((s) => ({ label: `${s.styleNo}${s.styleName ? ` - ${s.styleName}` : ''}`, value: s.styleNo }))}
              allowClear
            />
            <Button
             
              type="primary"
              ghost
              icon={<ImportOutlined />}
              loading={templateLoading}
              disabled={!templateStyleNo.trim()}
              onClick={handleImportTemplate}
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
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>工序单价（总计）</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>¥{totalCost.toFixed(2)}</span>
            <span style={{ fontSize: 12, color: '#bfbfbf', marginLeft: 'auto' }}>{createTask.createProcessNodes.length} 道工序</span>
          </div>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 900 + uniqueSizes.length * 90 }}>
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
              <tr style={{ background: '#fafafa' }}>
                <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>排序</th>
                <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>工序编号</th>
                <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>工序名称</th>
                <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>进度节点</th>
                <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>机器类型</th>
                <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>工序难度</th>
                <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>工时(秒)</th>
                <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>工价(元)</th>
                {uniqueSizes.map((s) => (
                  <th key={s} style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>{s}码</th>
                ))}
                <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((node, index) => {
                const spanInfo = spanMap.get(index);
                const originalIndex = createTask.createProcessNodes.indexOf(node);
                return (
                  <tr key={`process-row-${originalIndex}`}>
                    <td style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>
                      {index + 1}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #f0f0f0', color: '#8c8c8c' }}>
                      {String(index + 1).padStart(2, '0')}
                    </td>
                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #f0f0f0' }}>
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
                          borderBottom: '1px solid #f0f0f0',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <Tag style={{ background: STAGE_ACCENT, color: '#fff', border: 'none', fontWeight: 600, fontSize: 13 }}>
                            {spanInfo.stage}
                          </Tag>
                          <span style={{ fontSize: 12, color: '#999' }}>{spanInfo.count} 个工序</span>
                          <Button
                            type="link"
                           
                            icon={<PlusOutlined />}
                            onClick={() => handleAddToStage(spanInfo.stage)}
                            style={{ fontSize: 12, padding: 0 }}
                          >
                            添加
                          </Button>
                        </div>
                      </td>
                    ) : null}
                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #f0f0f0' }}>
                      <DictAutoComplete
                        dictType="machine_type"
                        autoCollect
                        value={node.machineType || ''}
                        placeholder="请选择或输入"
                        style={{ width: '100%' }}
                        onChange={(v) => createTask.updateProcessNode(originalIndex, 'machineType', v)}
                      />
                    </td>
                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #f0f0f0' }}>
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
                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #f0f0f0' }}>
                      <InputNumber
                       
                        value={node.standardTime || 0}
                        style={{ width: '100%' }}
                        min={0}
                        onChange={(v) => createTask.updateProcessNode(originalIndex, 'standardTime', typeof v === 'number' ? v : 0)}
                      />
                    </td>
                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #f0f0f0' }}>
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
                      <td key={s} style={{ padding: '4px 6px', borderBottom: '1px solid #f0f0f0' }}>
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
                    <td style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>
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

      <Card>
        <div style={{ color: 'rgba(0,0,0,0.65)', lineHeight: 1.8 }}>
          创建完成后，领取、生成菲号、打印裁剪单，继续回到裁剪页按正常订单逻辑处理。
          工序单价直接影响工资结算，请根据实际工价填写。
        </div>
      </Card>
    </ResizableModal>
  );
};

export default CuttingCreateTaskModal;

const FactoryCapacityCard: React.FC<{ stat: FactoryCapacityItem }> = ({ stat }) => (
  <div
    style={{
      marginTop: 8,
      padding: '6px 10px',
      background: 'var(--color-bg-container, #fafafa)',
      border: '1px solid var(--color-border, #e8e8e8)',
      borderRadius: 6,
      fontSize: 12,
      lineHeight: '20px',
      color: 'var(--color-text-secondary, #888)',
    }}
  >
    {stat.matchScore > 0 && (
      <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 600, color: stat.matchScore >= 70 ? '#52c41a' : stat.matchScore >= 40 ? '#fa8c16' : '#ff4d4f' }}>
          推荐指数 {stat.matchScore}分
        </span>
        {stat.matchScore >= 70 && <span style={{ background: '#f6ffed', color: '#52c41a', padding: '0 6px', borderRadius: 4, fontSize: 11, border: '1px solid #b7eb8f' }}>推荐</span>}
        {stat.capacitySource === 'configured' && <span style={{ background: '#fff7e6', color: '#fa8c16', padding: '0 6px', borderRadius: 4, fontSize: 11, border: '1px solid #ffd591' }}>配置产能</span>}
        {stat.capacitySource === 'none' && <span style={{ background: '#fff1f0', color: '#ff4d4f', padding: '0 6px', borderRadius: 4, fontSize: 11, border: '1px solid #ffa39e' }}>无产能数据</span>}
      </div>
    )}
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <span>生产中 <b style={{ color: '#333' }}>{stat.totalOrders}</b> 单</span>
      <span>共 <b style={{ color: '#333' }}>{stat.totalQuantity?.toLocaleString() ?? 0}</b> 件</span>
      <span>
        货期完成率
        <b style={{ marginLeft: 4, color: stat.deliveryOnTimeRate < 0 ? '#888' : stat.deliveryOnTimeRate >= 80 ? '#52c41a' : stat.deliveryOnTimeRate >= 60 ? '#fa8c16' : '#ff4d4f' }}>
          {stat.deliveryOnTimeRate < 0 ? '暂无' : `${stat.deliveryOnTimeRate}%`}
        </b>
      </span>
      {stat.atRiskCount > 0 ? <span style={{ color: '#fa8c16' }}>高风险 <b>{stat.atRiskCount}</b> 单</span> : null}
      {stat.overdueCount > 0 ? <span style={{ color: '#ff4d4f' }}>逾期 <b>{stat.overdueCount}</b> 单</span> : null}
    </div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, paddingTop: 4, borderTop: '1px dashed var(--color-border, #e8e8e8)' }}>
      <span>生产人数 <b style={{ color: '#333' }}>{stat.activeWorkers}</b> 人</span>
      {stat.avgDailyOutput > 0 ? <span>日均产量 <b style={{ color: '#1890ff' }}>{stat.avgDailyOutput}</b> 件/天{stat.capacitySource === 'configured' ? '（配置值）' : ''}</span> : null}
      {stat.estimatedCompletionDays > 0 ? (
        <span>
          预计
          <b style={{ marginInline: 4, color: stat.estimatedCompletionDays > 30 ? '#ff4d4f' : stat.estimatedCompletionDays > 15 ? '#fa8c16' : '#52c41a' }}>
            {stat.estimatedCompletionDays}
          </b>
          天可完工
        </span>
      ) : null}
      {stat.activeWorkers <= 0 && stat.avgDailyOutput <= 0 ? <span style={{ color: '#bbb' }}>暂无产能数据（该车间近30天无扫码记录）</span> : null}
    </div>
  </div>
);
