import React from 'react';
import { Switch, Button, Input, Space, Tooltip, Dropdown, Form } from 'antd';
import { SyncOutlined, PlusOutlined, SaveOutlined, CloudUploadOutlined, EditOutlined, RollbackOutlined, PictureOutlined } from '@ant-design/icons';
import SmallModal from '@/components/common/SmallModal';
import StyleSkuColorImages from '../StyleSkuColorImages';
import type { StyleSkuTabProps } from './types';
import { useStyleSkuTabData } from './useStyleSkuTabData';
import SkuTable from './SkuTable';

const StyleSkuTab: React.FC<StyleSkuTabProps> = (props) => {
  const {
    styleId,
    styleNo,
    initialSkc,
    skcValue,
    useSkuPrefix,
    skus,
    loading,
    saving,
    syncing,
    isEditing,
    skcEditing,
    skcSaving,
    rollbackOpen,
    rollbackForm,
    colorImageMode,
    isManual,
    canEdit,
    addMenuItems,
    setSkcValue,
    setSkcEditing,
    setIsEditing,
    setRollbackOpen,
    setColorImageMode,
    fetchSkus,
    handleModeToggle,
    handleUseSkuPrefixChange,
    handleSaveSkc,
    handleSave,
    handleSyncToProduction,
    handleDeleteRow,
    handleCancelEdit,
    handleRollbackOk,
    handleFieldChange,
    getCellValue,
    onRefresh,
  } = useStyleSkuTabData(props);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space size="middle">
          <span style={{ fontWeight: 500, fontSize: 14 }}>SKU模式：</span>
          <Switch checked={isManual} onChange={handleModeToggle} checkedChildren="手动编辑" unCheckedChildren="自动生成" />
          <span style={{ fontSize: 14, color: 'var(--color-text-tertiary, #8c8c8c)' }}>
            {isManual ? '可自由编辑SKU编码、颜色、尺码等信息' : 'SKU编码按「款号+颜色+尺码」自动生成'}
          </span>
          <span style={{ fontWeight: 500, fontSize: 14, marginLeft: 24 }}>SKU前缀：</span>
          <Switch checked={useSkuPrefix} onChange={handleUseSkuPrefixChange} checkedChildren="加SKU" unCheckedChildren="不加SKU" />
        </Space>

        <Space>
          {isManual && !isEditing && (
            <Button type="primary" icon={<EditOutlined />} onClick={() => setIsEditing(true)}>
              编辑
            </Button>
          )}
          {isManual && isEditing && (
            <>
              <Dropdown menu={{ items: addMenuItems }} trigger={['hover']}>
                <Button icon={<PlusOutlined />}>新增SKU</Button>
              </Dropdown>
              <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
                保存
              </Button>
              <Button icon={<RollbackOutlined />} onClick={handleCancelEdit}>
                退回
              </Button>
            </>
          )}
          <Tooltip title="管理SKU颜色图片，支持批量上传到多个颜色">
            <Button
              icon={<PictureOutlined />}
              onClick={() => setColorImageMode(true)}
              type={colorImageMode ? 'primary' : 'default'}
            >
              颜色图片
            </Button>
          </Tooltip>
          <Tooltip title="将当前SKU信息同步到关联的大货订单">
            <Button icon={<CloudUploadOutlined />} onClick={handleSyncToProduction} loading={syncing}>
              同步到大货
            </Button>
          </Tooltip>
          <Button icon={<SyncOutlined />} onClick={fetchSkus} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--color-bg-container, var(--color-bg-container))', borderRadius: 6, border: '1px solid var(--color-border-light, var(--color-border-light))' }}>
        <Space size="middle" align="center">
          <span style={{ fontWeight: 500, fontSize: 14 }}>SKC编号：</span>
          {skcEditing ? (
            <>
              <Input value={skcValue} onChange={e => setSkcValue(e.target.value)} style={{ width: 200 }} placeholder="默认跟随款号，可修改" onPressEnter={handleSaveSkc} />
              <Button type="link" onClick={handleSaveSkc} loading={skcSaving}>保存</Button>
              <Button type="link" onClick={() => { setSkcEditing(false); setSkcValue(initialSkc || ''); }}>取消</Button>
            </>
          ) : (
            <>
              <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 500 }}>{skcValue || initialSkc || '-'}</span>
              <Button type="link" onClick={() => setSkcEditing(true)}>修改SKC</Button>
            </>
          )}
          <span style={{ fontSize: 14, color: 'var(--color-text-tertiary, #8c8c8c)' }}>
            默认跟随款号自动生成，修改后会同步到关联的生产订单
          </span>
        </Space>
      </div>

      {colorImageMode ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>SKU颜色图片管理</span>
            <Button onClick={() => setColorImageMode(false)}>返回SKU列表</Button>
          </div>
          <StyleSkuColorImages
            styleId={styleId}
            styleNo={styleNo}
            onSaved={() => {
              fetchSkus();
              onRefresh?.();
            }}
          />
        </div>
      ) : (
        <SkuTable
          skus={skus}
          loading={loading}
          canEdit={canEdit}
          isManual={isManual}
          getCellValue={getCellValue}
          onFieldChange={handleFieldChange}
          onDeleteRow={handleDeleteRow}
        />
      )}
      <SmallModal
        open={rollbackOpen}
        title="退回编辑"
        okText="确认退回"
        okButtonProps={{ danger: true }}
        onOk={() => rollbackForm.submit()}
        onCancel={() => { setRollbackOpen(false); rollbackForm.resetFields(); }}
        destroyOnHidden
      >
        <Form form={rollbackForm} layout="vertical" onFinish={handleRollbackOk}>
          <p style={{ marginBottom: 8, color: 'var(--color-text-secondary, #666)' }}>确定退回当前编辑？所有未保存的修改将被丢弃。</p>
          <Form.Item name="remark" label="退回备注（可选）">
            <Input.TextArea autoSize={{ minRows: 2 }} placeholder="请输入退回备注" autoFocus />
          </Form.Item>
        </Form>
      </SmallModal>
    </div>
  );
};

export default StyleSkuTab;
