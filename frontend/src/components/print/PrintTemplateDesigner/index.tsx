import React, { useState, useCallback, useMemo } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDroppable, useDraggable, closestCenter } from '@dnd-kit/core';
import { InputNumber, Select, Button, Input, Switch, Slider, Space, Divider, Card, Typography, Tooltip, message } from 'antd';
import { DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import type { TemplateConfig, TemplateField, DraggableFieldItem } from './types';
import { FIELD_LIST, DEFAULT_TEMPLATE_CONFIG, TEMPLATE_TYPE_OPTIONS } from './types';
import PrintPreview from '../PrintPreview';
import './styles.css';

const { Text, Title } = Typography;

interface PrintTemplateDesignerProps {
  templateConfig?: TemplateConfig;
  onSave?: (config: TemplateConfig) => void;
}

// 可拖拽的字段项
const DraggableField: React.FC<{ field: DraggableFieldItem }> = ({ field }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `field-${field.id}`,
    data: { field },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`draggable-field ${isDragging ? 'dragging' : ''}`}
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <Text className="field-label">{field.label}</Text>
      <Text className="field-category" type="secondary">({field.category})</Text>
    </div>
  );
};

// 可放置的画布区域
const DroppableCanvas: React.FC<{
  fields: TemplateField[];
  selectedFieldId?: string;
  onFieldSelect: (id: string) => void;
  onFieldDelete: (id: string) => void;
  config: TemplateConfig;
}> = ({ fields, selectedFieldId, onFieldSelect, onFieldDelete, config }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'canvas',
  });

  // mm to px 转换（96 DPI 标准）
  const scale = 3.78;
  const canvasWidth = config.width * scale;
  const canvasHeight = config.height * scale;

  return (
    <div
      ref={setNodeRef}
      className={`template-canvas ${isOver ? 'canvas-over' : ''}`}
      style={{
        width: canvasWidth,
        height: canvasHeight,
        minWidth: canvasWidth,
        minHeight: canvasHeight,
      }}
    >
      {fields.length === 0 && (
        <div className="canvas-empty">
          <Text type="secondary">拖拽左侧字段到此处</Text>
        </div>
      )}
      {fields.map((field) => (
        <div
          key={field.id}
          className={`canvas-field ${selectedFieldId === field.id ? 'selected' : ''}`}
          style={{
            left: field.x * scale,
            top: field.y * scale,
            fontSize: field.fontSize,
            textAlign: field.align,
            fontWeight: field.bold ? 700 : 400,
            width: field.width || 'auto',
          }}
          onClick={() => onFieldSelect(field.id)}
        >
          <Text>{field.label}</Text>
          <Tooltip title="删除">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              className="field-delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                onFieldDelete(field.id);
              }}
            />
          </Tooltip>
        </div>
      ))}
    </div>
  );
};

// 属性面板
const FieldPropertyPanel: React.FC<{
  field: TemplateField;
  onChange: (updates: Partial<TemplateField>) => void;
}> = ({ field, onChange }) => {
  return (
    <div className="property-panel">
      <Title level={5}>字段属性</Title>
      <Divider />
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div className="property-item">
          <Text className="property-label">标签名称</Text>
          <Input
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            size="small"
          />
        </div>
        <div className="property-item">
          <Text className="property-label">X 坐标 (mm)</Text>
          <InputNumber
            value={field.x}
            onChange={(v) => onChange({ x: v || 0 })}
            min={0}
            max={200}
            size="small"
          />
        </div>
        <div className="property-item">
          <Text className="property-label">Y 坐标 (mm)</Text>
          <InputNumber
            value={field.y}
            onChange={(v) => onChange({ y: v || 0 })}
            min={0}
            max={200}
            size="small"
          />
        </div>
        <div className="property-item">
          <Text className="property-label">字体大小</Text>
          <Slider
            value={field.fontSize}
            onChange={(v) => onChange({ fontSize: v })}
            min={8}
            max={24}
            marks={{ 8: '8', 12: '12', 16: '16', 24: '24' }}
          />
        </div>
        <div className="property-item">
          <Text className="property-label">对齐方式</Text>
          <Select
            value={field.align}
            onChange={(v) => onChange({ align: v })}
            options={[
              { value: 'left', label: '左对齐' },
              { value: 'center', label: '居中' },
              { value: 'right', label: '右对齐' },
            ]}
            size="small"
          />
        </div>
        <div className="property-item">
          <Text className="property-label">加粗</Text>
          <Switch
            checked={field.bold}
            onChange={(v) => onChange({ bold: v })}
          />
        </div>
      </Space>
    </div>
  );
};

const PrintTemplateDesigner: React.FC<PrintTemplateDesignerProps> = ({
  templateConfig,
  onSave,
}) => {
  const [config, setConfig] = useState<TemplateConfig>(templateConfig || DEFAULT_TEMPLATE_CONFIG);
  const [selectedFieldId, setSelectedFieldId] = useState<string | undefined>();
  const [activeDragField, setActiveDragField] = useState<DraggableFieldItem | null>(null);

  // 左侧字段列表按类别分组
  const groupedFields = useMemo(() => {
    const groups: Record<string, DraggableFieldItem[]> = {};
    FIELD_LIST.forEach((field) => {
      const cat = field.category || '其他';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(field);
    });
    return groups;
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const fieldData = active.data.current?.field as DraggableFieldItem;
    setActiveDragField(fieldData);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragField(null);

    if (over && over.id === 'canvas') {
      const fieldData = active.data.current?.field as DraggableFieldItem;
      if (fieldData) {
        // 新增字段到画布
        const newField: TemplateField = {
          id: `${fieldData.id}-${Date.now()}`,
          label: fieldData.label,
          x: 5,
          y: config.fields.length * 8 + 5,
          fontSize: 12,
          align: 'left',
          bold: false,
        };
        setConfig((prev) => ({
          ...prev,
          fields: [...prev.fields, newField],
        }));
        setSelectedFieldId(newField.id);
        message.success(`已添加字段: ${fieldData.label}`);
      }
    }
  };

  const handleFieldSelect = useCallback((id: string) => {
    setSelectedFieldId(id);
  }, []);

  const handleFieldDelete = useCallback((id: string) => {
    setConfig((prev) => ({
      ...prev,
      fields: prev.fields.filter((f) => f.id !== id),
    }));
    if (selectedFieldId === id) {
      setSelectedFieldId(undefined);
    }
  }, [selectedFieldId]);

  const handleFieldUpdate = useCallback((updates: Partial<TemplateField>) => {
    if (!selectedFieldId) return;
    setConfig((prev) => ({
      ...prev,
      fields: prev.fields.map((f) =>
        f.id === selectedFieldId ? { ...f, ...updates } : f
      ),
    }));
  }, [selectedFieldId]);

  const handleConfigUpdate = useCallback((updates: Partial<TemplateConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleSave = useCallback(() => {
    onSave?.(config);
    message.success('模板已保存');
  }, [config, onSave]);

  const selectedField = useMemo(
    () => config.fields.find((f) => f.id === selectedFieldId),
    [config.fields, selectedFieldId]
  );

  // 示例数据用于预览
  const sampleData = useMemo(() => ({
    styleNo: 'ST20260704001',
    styleName: '女士连衣裙',
    color: '蓝色',
    size: 'M',
    quantity: 100,
    customerName: '广州时装公司',
    orderNo: 'PO20260704001',
    orderDate: '2026-07-04',
    deliveryDate: '2026-07-15',
    price: '¥150',
    totalAmount: '¥15000',
    factoryName: '东方制衣厂',
    operatorName: '张师傅',
    processName: '裁剪',
    barcode: '6901234567890',
    qrCode: 'https://example.com/qrcode',
    remark: '请按时交货',
  }), []);

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      collisionDetection={closestCenter}
    >
      <div className="designer-container">
        {/* 左侧字段列表 */}
        <Card className="left-panel" title="可用字段" size="small">
          {Object.entries(groupedFields).map(([category, fields]) => (
            <div key={category} className="field-group">
              <Text className="group-title" strong>{category}</Text>
              {fields.map((field) => (
                <DraggableField key={field.id} field={field} />
              ))}
            </div>
          ))}
        </Card>

        {/* 中间画布区域 */}
        <div className="canvas-panel">
          <div className="canvas-toolbar">
            <Space>
              <Text>模板类型:</Text>
              <Select
                value={config.type}
                onChange={(v) => handleConfigUpdate({ type: v })}
                options={TEMPLATE_TYPE_OPTIONS}
                size="small"
              />
              <Divider type="vertical" />
              <Text>宽度(mm):</Text>
              <InputNumber
                value={config.width}
                onChange={(v) => handleConfigUpdate({ width: v || 80 })}
                min={40}
                max={210}
                size="small"
              />
              <Text>高度(mm):</Text>
              <InputNumber
                value={config.height}
                onChange={(v) => handleConfigUpdate({ height: v || 50 })}
                min={20}
                max={150}
                size="small"
              />
            </Space>
          </div>
          <div className="canvas-wrapper">
            <DroppableCanvas
              fields={config.fields}
              selectedFieldId={selectedFieldId}
              onFieldSelect={handleFieldSelect}
              onFieldDelete={handleFieldDelete}
              config={config}
            />
          </div>
        </div>

        {/* 右侧属性面板 + 预览 */}
        <div className="right-panel">
          {selectedField ? (
            <FieldPropertyPanel
              field={selectedField}
              onChange={handleFieldUpdate}
            />
          ) : (
            <Card className="property-panel empty" size="small">
              <Text type="secondary">点击画布中的字段进行编辑</Text>
            </Card>
          )}
          <Divider />
          {/* 实时预览 */}
          <Card className="preview-panel" title="实时预览" size="small">
            <PrintPreview template={config} data={sampleData} />
          </Card>
        </div>

        {/* 底部工具栏 */}
        <div className="bottom-panel">
          <Space>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
              保存模板
            </Button>
          </Space>
        </div>

        {/* 拖拽覆盖层 */}
        <DragOverlay>
          {activeDragField ? (
            <div className="drag-overlay-field">
              <Text>{activeDragField.label}</Text>
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
};

export default PrintTemplateDesigner;