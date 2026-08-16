import React from 'react';
import { Modal, Switch, Button, Input, Space, Tooltip, Dropdown, Form } from 'antd';
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
    canEditAttrs,
    hasChanges,
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
          <span style={{ fontWeight: 500, fontSize: 14 }}>编码模式：</span>
          <Switch checked={isManual} onChange={handleModeToggle} checkedChildren="手动编辑" unCheckedChildren="自动生成" />
          <span style={{ fontSize: 14, color: 'var(--color-text-tertiary, var(--color-text-muted))' }}>
            {isManual ? '可自由编辑商品编码、颜色、尺码等信息' : '商品编码按「款号+颜色+尺码」自动生成'}
          </span>
          <span style={{ fontWeight: 500, fontSize: 14, marginLeft: 24 }}>商品编码字面前缀：</span>
          <Switch checked={useSkuPrefix} onChange={handleUseSkuPrefixChange} checkedChildren="加前缀" unCheckedChildren="不加" />
        </Space>

        <Space>
          {isManual && !isEditing && (
            <Button type="primary" icon={<EditOutlined />} onClick={() => setIsEditing(true)}>
              编辑
            </Button>
          )}
          {/* 自动生成模式下填写了备注/69码/价格等属性 → 出现保存按钮，无需切手动编辑 */}
          {!isManual && hasChanges && (
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
              保存修改
            </Button>
          )}
          {isManual && isEditing && (
            <>
              <Dropdown menu={{ items: addMenuItems }} trigger={['hover']}>
                <Button icon={<PlusOutlined />}>新增编码</Button>
              </Dropdown>
              <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
                保存
              </Button>
              <Button icon={<RollbackOutlined />} onClick={handleCancelEdit}>
                退回
              </Button>
            </>
          )}
          <Tooltip title="管理颜色图片，支持批量上传到多个颜色">
            <Button
              icon={<PictureOutlined />}
              onClick={() => setColorImageMode(true)}
            >
              颜色图片
            </Button>
          </Tooltip>
          <Tooltip title="将当前商品编码信息同步到关联的大货订单">
            <Button icon={<CloudUploadOutlined />} onClick={handleSyncToProduction} loading={syncing}>
              同步到大货
            </Button>
          </Tooltip>
          <Button icon={<SyncOutlined />} onClick={fetchSkus} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--color-bg-container, var(--color-bg-container))', borderRadius: 6, border: '1px solid var(--color-border-light, var(--color-border-light))' }}>
        <Space size="middle" align="center" wrap>
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
              <Tooltip title="SKC = 款式+颜色的编号，用于关联生产订单；如需修改下方表格中的商品编码，请将编码模式切换为「手动编辑」">
                <Button type="link" onClick={() => setSkcEditing(true)}>修改SKC编号</Button>
              </Tooltip>
            </>
          )}
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary, var(--color-text-muted))' }}>
            默认跟随款号自动生成，修改后会同步到关联的生产订单
          </span>
        </Space>
      </div>

      {/* 颜色图片管理用弹窗承载（不再整块替换表格），表格常驻、操作上下文不丢失 */}
      <Modal
        open={colorImageMode}
        title="颜色图片管理"
        footer={null}
        width={960}
        onCancel={() => setColorImageMode(false)}
        styles={{ body: { maxHeight: '72vh', overflowY: 'auto', paddingTop: 8 } }}
      >
        <StyleSkuColorImages
          styleId={styleId}
          styleNo={styleNo}
          hideHeader
          onSaved={() => {
            fetchSkus();
            onRefresh?.();
          }}
        />
      </Modal>

      <SkuTable
        skus={skus}
        loading={loading}
        canEdit={canEdit}
        canEditAttrs={canEditAttrs}
        isManual={isManual}
        getCellValue={getCellValue}
        onFieldChange={handleFieldChange}
        onDeleteRow={handleDeleteRow}
      />
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
          <p style={{ marginBottom: 8, color: 'var(--color-text-secondary, var(--color-gray-dark))' }}>确定退回当前编辑？所有未保存的修改将被丢弃。</p>
          <Form.Item name="remark" label="退回备注（可选）">
            <Input.TextArea autoSize={{ minRows: 2 }} placeholder="请输入退回备注" autoFocus />
          </Form.Item>
        </Form>
      </SmallModal>
    </div>
  );
};

export default StyleSkuTab;
