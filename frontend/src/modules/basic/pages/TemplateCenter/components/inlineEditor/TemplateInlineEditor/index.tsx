import React from 'react';
import { Button, Form, Input, Select, Tag } from 'antd';
import {
  isBomTableContainer,
  isBomTableData,
  isProcessTableData,
  isSizeTableData,
  type BomTableContainer,
  type BomTableData,
  type ProcessTableData,
  type SizeTableData,
  typeColor,
  typeLabel,
} from '../../../utils/templateUtils';
import BomInlineTable from '../BomInlineTable';
import ProcessInlineTable from '../ProcessInlineTable';
import SizeInlineTable from '../SizeInlineTable';
import { compactFieldLabelStyle, metaTextStyle } from './helpers';
import { useTemplateInlineEditorData } from './useTemplateInlineEditorData';
import type { TemplateInlineEditorProps } from './types';

const TemplateInlineEditor: React.FC<TemplateInlineEditorProps> = ({
  row,
  onSaved,
  onCancel,
  readOnly = false,
  compact = false,
  maintenanceMode = false,
  allowSourceStyleSelection = false,
  styleNoOptions = [],
  styleNoLoading = false,
  onStyleNoSearch,
  onStyleNoDropdownOpen,
}) => {
  const {
    form,
    saving,
    imageUploading,
    editTableData,
    setEditTableData,
    showSizePrices,
    setShowSizePrices,
    templateSizes,
    newSizeName,
    setNewSizeName,
    imageUrls,
    handleUploadImage,
    addSize,
    removeSize,
    handleSave,
    handleRemoveImage,
  } = useTemplateInlineEditorData({ row, onSaved });

  const renderEditor = () => {
    const normalizedType = String(row.templateType || '').trim().toLowerCase();
    if (normalizedType === 'size' && isSizeTableData(editTableData)) {
      return <SizeInlineTable value={editTableData as SizeTableData} onChange={setEditTableData} readOnly={readOnly} compact={compact} />;
    }
    if (normalizedType === 'bom' && (isBomTableData(editTableData) || isBomTableContainer(editTableData))) {
      return <BomInlineTable value={editTableData as BomTableData | BomTableContainer} onChange={setEditTableData} readOnly={readOnly} compact={compact} />;
    }
    if ((normalizedType === 'process' || normalizedType === 'process_price') && isProcessTableData(editTableData)) {
      return (
        <ProcessInlineTable
          value={editTableData as ProcessTableData}
          onChange={setEditTableData as (next: ProcessTableData) => void}
          readOnly={readOnly}
          compact={compact}
          allowProcessPriceImages={normalizedType === 'process_price'}
          showSizePrices={showSizePrices}
          onShowSizePricesChange={setShowSizePrices}
          templateSizes={templateSizes}
          newSizeName={newSizeName}
          onNewSizeNameChange={setNewSizeName}
          onAddSize={addSize}
          onRemoveSize={removeSize}
          imageUrls={imageUrls}
          imageUploading={imageUploading}
          onUploadImage={handleUploadImage}
          onRemoveImage={handleRemoveImage}
        />
      );
    }
    return (
      <div style={{ padding: 16, color: 'var(--neutral-text-disabled)' }}>
        当前模板内容无法识别，请联系管理员检查模板数据。
      </div>
    );
  };

  const renderCompactField = (
    name: string,
    label: string,
    node: React.ReactNode,
    rules?: Array<{ required?: boolean; message?: string }>,
  ) => (
    <div>
      <div style={compactFieldLabelStyle}>{label}</div>
      <Form.Item name={name} rules={rules} style={{ marginBottom: 0 }}>
        {node}
      </Form.Item>
    </div>
  );

  const showTemplateMetaShell = !maintenanceMode;

  return (
    <div>
      {showTemplateMetaShell ? (
        <div style={{ marginBottom: compact ? 8 : 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Tag color={typeColor(String(row.templateType || ''))} style={{ marginInlineEnd: 0 }}>
              {typeLabel(String(row.templateType || ''))}
            </Tag>
            <span style={metaTextStyle}>款号 {row.sourceStyleNo || '-'}</span>
            {row.operatorName ? <span style={metaTextStyle}>维护 {row.operatorName}</span> : null}
          </div>
          {row.updateTime ? <span style={metaTextStyle}>更新 {row.updateTime}</span> : null}
        </div>
      ) : null}

      <Form form={form} layout="vertical">
        {readOnly && !compact && showTemplateMetaShell ? (
          <div style={{ marginBottom: 12, color: 'var(--neutral-text-secondary)', fontSize: 14 }}>
            当前为只读预览，退回后可直接在此页面编辑。
          </div>
        ) : null}
        {showTemplateMetaShell ? (
          <div style={{ display: 'grid', gridTemplateColumns: allowSourceStyleSelection ? 'minmax(0,1.8fr) minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1.8fr) minmax(0,1fr)', gap: compact ? 8 : 12, marginBottom: compact ? 10 : 16 }}>
            {compact
              ? renderCompactField(
                'templateName',
                '模板名称',
                <Input placeholder="请输入模板名称" disabled={readOnly} />,
                [{ required: true, message: '请输入模板名称' }],
              )
              : (
                <Form.Item
                  name="templateName"
                  label="模板名称"
                  rules={[{ required: true, message: '请输入模板名称' }]}
                  style={{ marginBottom: 0 }}
                >
                  <Input placeholder="请输入模板名称" disabled={readOnly} />
                </Form.Item>
              )}
            {compact
              ? renderCompactField('templateKey', '模板标识', <Input placeholder="可选" disabled={readOnly} />)
              : (
                <Form.Item name="templateKey" label="模板标识" style={{ marginBottom: 0 }}>
                  <Input placeholder="可选" disabled={readOnly} />
                </Form.Item>
              )}
            {allowSourceStyleSelection ? (compact
              ? renderCompactField(
                'sourceStyleNo',
                '来源款号',
                <Select
                  allowClear
                  showSearch
                  filterOption={false}
                  disabled={readOnly}
                  loading={styleNoLoading}
                  placeholder="搜索/选择款号"
                  options={styleNoOptions}
                  onSearch={onStyleNoSearch}
                  onOpenChange={onStyleNoDropdownOpen}
                />,
              )
              : (
                <Form.Item name="sourceStyleNo" label="来源款号" style={{ marginBottom: 0 }}>
                  <Select
                    allowClear
                    showSearch
                    filterOption={false}
                    disabled={readOnly}
                    loading={styleNoLoading}
                    placeholder="搜索/选择款号"
                    options={styleNoOptions}
                    onSearch={onStyleNoSearch}
                    onOpenChange={onStyleNoDropdownOpen}
                  />
                </Form.Item>
              )) : null}
          </div>
        ) : null}
      </Form>

      {renderEditor()}

      {!readOnly ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: compact ? 10 : 16 }}>
          {onCancel ? (
            <Button onClick={onCancel}>取消修改</Button>
          ) : null}
          <Button type="primary" loading={saving} onClick={handleSave}>
            保存
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default TemplateInlineEditor;
