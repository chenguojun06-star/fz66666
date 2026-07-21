import React, { useMemo } from 'react';
import { Button, Card, Input, Select, Space } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { useColorCardData } from './useColorCardData';
import { buildColumns, buildPreviewColumns } from './columns';
import CardEditModal from './components/CardEditModal';
import ItemsManageModal from './components/ItemsManageModal';
import RecognizeModal from './components/RecognizeModal';
import PreviewModal from './components/PreviewModal';
import { MATERIAL_TYPE_OPTIONS } from './types';
import type { ColorCard } from './types';

const ColorCardPage: React.FC = () => {
  const data = useColorCardData();

  // ===== 主表格列定义 =====
  const columns = useMemo(() => buildColumns({
    onEdit: data.openEditDialog,
    onItems: data.openItemsDialog,
    onRecognize: data.openRecognize,
    onPreview: data.openPreview,
    onDelete: data.handleDelete,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data.openEditDialog, data.openItemsDialog, data.openRecognize, data.openPreview, data.handleDelete]);

  // ===== 预览表格列定义 =====
  const previewColumns = useMemo(() => buildPreviewColumns({
    selectedItems: data.selectedItems,
    onToggleSelect: data.toggleSelect,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data.selectedItems, data.toggleSelect]);

  return (
    <>
      <Card style={{ marginBottom: 12, background: 'var(--color-bg-container)' }}>
        <Space.Compact style={{ width: '100%', display: 'flex' }}>
          <Input placeholder="搜索色卡本编号/名称/供应商" value={data.keyword}
            onChange={(e) => data.setKeyword(e.target.value)} style={{ maxWidth: 280 }} allowClear />
          <Select placeholder="物料类型" value={data.materialType || undefined} onChange={data.setMaterialType}
            style={{ width: 140 }} allowClear>
            {MATERIAL_TYPE_OPTIONS.map(o => (
              <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={data.fetchList}>刷新</Button>
          <div style={{ flexGrow: 1 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={data.openCreateDialog}>新建色卡本</Button>
        </Space.Compact>
      </Card>

      <ResizableTable<ColorCard>
        columns={columns}
        dataSource={data.dataList}
        rowKey={(r: ColorCard) => String(r.id)}
        loading={data.loading}
        scroll={{ x: 1200 }}
        pagination={{
          current: data.page, pageSize: data.pageSize, total: data.total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 本色卡本`,
          onChange: (p, ps) => { data.setPage(p); data.setPageSize(ps); },
        }}
        emptyDescription="暂无数据"
      />

      {/* ===== 色卡本新建/编辑弹窗 ===== */}
      <CardEditModal
        open={data.dialogVisible}
        currentCard={data.currentCard}
        form={data.form}
        submitting={data.submitting}
        coverImageFiles={data.coverImageFiles}
        setCoverImageFiles={data.setCoverImageFiles}
        uploadImage={data.uploadImage}
        onCancel={() => data.setDialogVisible(false)}
        onOk={data.handleSave}
      />

      {/* ===== 颜色管理弹窗 ===== */}
      <ItemsManageModal
        open={data.itemVisible}
        currentCardName={data.currentCardName}
        currentItems={data.currentItems}
        nextColorNoRef={data.nextColorNoRef}
        onAddEmptyItem={data.addEmptyItem}
        onUpdateItem={data.updateItem}
        onRemoveItem={data.removeItem}
        onSaveItems={data.saveItems}
        onOpenRecognize={() => {
          data.setCurrentCardId(data.currentCardId);
          data.setRecognizeImage('');
          data.setRecognizeVisible(true);
        }}
        onCancel={() => data.setItemVisible(false)}
        uploadImage={data.uploadImage}
      />

      {/* ===== 拍照识别弹窗 ===== */}
      <RecognizeModal
        open={data.recognizeVisible}
        recognizeImage={data.recognizeImage}
        recognizing={data.recognizing}
        onPickImage={data.onPickImage}
        onRunRecognition={data.runRecognition}
        onCancel={() => data.setRecognizeVisible(false)}
      />

      {/* ===== 生成物料预览弹窗 ===== */}
      <PreviewModal
        open={data.previewVisible}
        previewCard={data.previewCard}
        previewItems={data.previewItems}
        selectedItems={data.selectedItems}
        previewColumns={previewColumns}
        onConfirmGenerate={data.confirmGenerate}
        onSelectAll={(selectAll: boolean) => {
          if (selectAll) data.setSelectedItems(new Set(data.previewItems.map((_, i) => i)));
          else data.setSelectedItems(new Set());
        }}
        onCancel={() => data.setPreviewVisible(false)}
      />
    </>
  );
};

export default ColorCardPage;
