import { memo, useCallback, useEffect } from 'react';
import { Button, Input, Modal, Popover, Space, Spin, Upload, Tooltip } from 'antd';
import {
  CloudSyncOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
  UndoOutlined,
  CameraOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import useProcessPriceColumns from './hooks/useProcessPriceColumns';
import useProcessPriceActions from './hooks/useProcessPriceActions';

export interface SyncProcessPriceModalProps {
  open: boolean;
  onCancel: () => void;
  onSynced?: () => void;
  styleNo?: string;
}

const SyncProcessPriceModal = memo(function SyncProcessPriceModal({
  open,
  onCancel,
  onSynced,
  styleNo,
}: SyncProcessPriceModalProps) {
  const {
    matchedScope, styleInputVal,
    data, loadingTemplate, editMode, saving, syncing, sizes, imageUrls,
    imageUploading, newSizeName, addSizePopoverOpen, readyForScope,
    setStyleInputVal, setNewSizeName, setAddSizePopoverOpen, setImageUrls,
    scheduleStyleSearch, handleUploadImage,
    enterEdit, exitEdit, handleAdd, handleDelete,
    updateField, updateSizePrice, handleAddSize, handleRemoveSize,
    saveAll, syncToOrders, saveAndSync: hookSaveAndSync, handleClose,
  } = useProcessPriceActions(open, styleNo);

  const columns = useProcessPriceColumns(
    editMode, sizes, data, updateField, updateSizePrice, handleRemoveSize, handleDelete,
  );

  const handleCancel = useCallback(() => {
    handleClose();
    onCancel();
  }, [handleClose, onCancel]);

  const handleSyncOnly = useCallback(async () => {
    if (await syncToOrders()) {
      onSynced?.();
    }
  }, [syncToOrders, onSynced]);

  const handleSaveAndSync = useCallback(async () => {
    if (await hookSaveAndSync()) {
      onSynced?.();
    }
  }, [hookSaveAndSync, onSynced]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) handleCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, handleCancel]);

  const renderStyleSelector = () => (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
      <Input
        placeholder="输入款号搜索..."
        allowClear
        value={styleInputVal}
        onChange={(e) => {
          setStyleInputVal(e.target.value);
          scheduleStyleSearch(e.target.value);
        }}
        style={{ width: 280 }}
      />
      <span style={{ color: 'var(--color-text-3)', fontSize: 12 }}>
        {matchedScope === 'style' ? '✅ 已匹配款号模板' : matchedScope === 'order' ? '📋 从订单工序数据加载' : '未匹配，将创建新模板'}
      </span>
    </div>
  );

  const renderToolbar = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <Space>
        {editMode ? (
          <>
            <Button size="small" icon={<PlusOutlined />} onClick={handleAdd}>添加工序</Button>
            <Popover
              open={addSizePopoverOpen}
              onOpenChange={setAddSizePopoverOpen}
              content={
                <div style={{ display: 'flex', gap: 4 }}>
                  <Input
                    size="small"
                    placeholder="尺码名"
                    value={newSizeName}
                    onChange={(e) => setNewSizeName(e.target.value)}
                    onPressEnter={handleAddSize}
                    style={{ width: 80 }}
                  />
                  <Button size="small" type="primary" onClick={handleAddSize}>添加</Button>
                </div>
              }
              trigger="click"
            >
              <Button size="small" icon={<PlusOutlined />}>添加尺码</Button>
            </Popover>
          </>
        ) : (
          <Button size="small" icon={<EditOutlined />} onClick={enterEdit}>编辑</Button>
        )}
      </Space>
      <Space>
        {editMode && (
          <>
            <Button size="small" icon={<UndoOutlined />} onClick={exitEdit}>取消编辑</Button>
            <Button size="small" type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveAll}>
              保存
            </Button>
          </>
        )}
        {readyForScope && !editMode && (
          <>
            <Tooltip title="保存并同步到订单">
              <Button size="small" type="primary" icon={<CloudSyncOutlined />} loading={syncing} onClick={handleSaveAndSync}>
                保存并同步
              </Button>
            </Tooltip>
            <Tooltip title="仅同步到订单（不保存当前编辑）">
              <Button size="small" icon={<CloudSyncOutlined />} loading={syncing} onClick={handleSyncOnly}>
                仅同步
              </Button>
            </Tooltip>
          </>
        )}
      </Space>
    </div>
  );

  const renderImageArea = () => (
    <div style={{ marginBottom: 12 }}>
      <Upload
        accept="image/*"
        showUploadList={false}
        beforeUpload={handleUploadImage}
        disabled={!readyForScope || imageUploading}
      >
        <Button size="small" icon={imageUploading ? <Spin size="small" /> : <CameraOutlined />} disabled={!readyForScope}>
          上传工艺图
        </Button>
      </Upload>
      {imageUrls.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {imageUrls.map((url, idx) => (
            <div key={idx} style={{ position: 'relative', width: 64, height: 64, border: '1px solid var(--color-border)', borderRadius: 4, overflow: 'hidden' }}>
              <img src={url} alt={`工艺图${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {editMode && (
                <DeleteOutlined
                  style={{ position: 'absolute', top: 2, right: 2, color: 'var(--color-danger)', cursor: 'pointer', background: 'rgba(255,255,255,0.8)', borderRadius: '50%', padding: 2 }}
                  onClick={() => {
                    const next = [...imageUrls];
                    next.splice(idx, 1);
                    setImageUrls(next);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Modal
      title="工序单价配置"
      open={open}
      onCancel={handleCancel}
      width="90vw"
      style={{ top: 20 }}
      footer={null}
      destroyOnClose
    >
      {renderStyleSelector()}
      {renderToolbar()}
      {renderImageArea()}
      <ResizableTable
        columns={columns}
        dataSource={data}
        rowKey="id"
        size="small"
        bordered
        loading={loadingTemplate}
        scroll={{ x: 'max-content', y: 'calc(100vh - 380px)' }}
        pagination={false}
      />
    </Modal>
  );
});

export default SyncProcessPriceModal;
