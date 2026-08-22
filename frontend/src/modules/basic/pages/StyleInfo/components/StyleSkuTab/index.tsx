import React, { useMemo, useState } from 'react';
import {
  Modal, Switch, Button, Input, Space, Tooltip, Dropdown, Form, Alert, Badge, App,
} from 'antd';
import {
  SyncOutlined, PlusOutlined, SaveOutlined, CloudUploadOutlined,
  EditOutlined, RollbackOutlined, PictureOutlined,
  UndoOutlined, CheckCircleFilled,
} from '@ant-design/icons';
import SmallModal from '@/components/common/SmallModal';
import StyleSkuColorImages from '../StyleSkuColorImages';
import type { StyleSkuTabProps } from './types';
import { useStyleSkuTabData } from './useStyleSkuTabData';
import SkuTable from './SkuTable';
import type { ProductSku } from '@/types/style';
import { getRowKey } from './helpers';

const StyleSkuTab: React.FC<StyleSkuTabProps> = (props) => {
  const { message } = App.useApp();
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
    handleReorder,
    getCellValue,
    onRefresh,
  } = useStyleSkuTabData(props);

  // 批量选中的行 keys
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  // 批量填充字段的 UI 状态（仅真实后端字段：成本价/基本售价/吊牌价）
  const [batchCostPrice, setBatchCostPrice] = useState<string | number | null>(null);
  const [batchBasePrice, setBatchBasePrice] = useState<string | number | null>(null);
  const [batchTagPrice, setBatchTagPrice] = useState<string | number | null>(null);

  // 成本价为空的 SKU 数（用于橙色警示条）
  const emptyCostCount = useMemo(() => {
    if (!skus?.length) return 0;
    return skus.filter((s) => {
      const v = getCellValue(s, 'costPrice');
      return v == null || Number(v) === 0;
    }).length;
  }, [skus, getCellValue]);

  // 吊牌价为空的 SKU 数
  const emptyTagCount = useMemo(() => {
    if (!skus?.length) return 0;
    return skus.filter((s) => {
      const v = getCellValue(s, 'tagPrice');
      return v == null || Number(v) === 0;
    }).length;
  }, [skus, getCellValue]);

  // 批量填充确认：写入有后端字段的「成本价/基本售价/吊牌价」
  const handleBatchFillConfirm = () => {
    if (!canEditAttrs) return;
    const targets: Array<{ record: ProductSku; key: React.Key }> = selectedRowKeys.length > 0
      ? selectedRowKeys
          .map((k) => {
            const record = skus.find((s) => String(getRowKey(s)) === String(k));
            return record ? { record, key: getRowKey(record) } : null!;
          })
          .filter(Boolean)
      : skus.map((s) => ({ record: s, key: getRowKey(s) }));
    if (!targets.length) {
      message.warning('没有可填充的 SKU');
      return;
    }
    const hasCost = batchCostPrice != null && batchCostPrice !== '';
    const hasBase = batchBasePrice != null && batchBasePrice !== '';
    const hasTag = batchTagPrice != null && batchTagPrice !== '';
    if (!hasCost && !hasBase && !hasTag) {
      message.warning('请先在上方至少填写一个要批量填充的字段');
      return;
    }
    // 仅写入真实存在的后端字段（costPrice/salesPrice/tagPrice），杜绝假编辑
    targets.forEach(({ key }) => {
      if (hasCost) handleFieldChange(key as number | string, 'costPrice', Number(batchCostPrice));
      if (hasBase) handleFieldChange(key as number | string, 'salesPrice', Number(batchBasePrice));
      if (hasTag) handleFieldChange(key as number | string, 'tagPrice', Number(batchTagPrice));
    });
    const labels: string[] = [];
    if (hasCost) labels.push('成本价');
    if (hasBase) labels.push('基本售价');
    if (hasTag) labels.push('吊牌价');
    if (labels.length) {
      message.success(`已对 ${targets.length} 个 SKU 批量填充：${labels.join('、')}（点「保存」后生效）`);
    }
  };

  // 重置批量填充输入
  const resetBatchFill = () => {
    setBatchCostPrice(null);
    setBatchBasePrice(null);
    setBatchTagPrice(null);
  };

  // 批量启用/禁用：真实写入 status 草稿（保存后生效），仅作用于勾选行
  const handleBatchToggleStatus = (key: string) => {
    if (!canEditAttrs) {
      message.warning('请先点击「编辑」进入编辑态');
      return;
    }
    if (!selectedRowKeys.length) {
      message.warning('请先勾选要修改状态的行');
      return;
    }
    const statusVal = key === 'enable' ? 'ENABLED' : 'DISABLED';
    selectedRowKeys.forEach((k) => {
      const record = skus.find((s) => String(getRowKey(s)) === String(k));
      if (record) handleFieldChange(getRowKey(record), 'status', statusVal);
    });
    message.success(`已${key === 'enable' ? '启用' : '禁用'} ${selectedRowKeys.length} 个 SKU（点「保存」后生效）`);
  };

  return (
    <div>
      {/* ─── 第一层：编码模式 + 前缀开关 + 操作按钮（左右分开） ─── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        gap: 12,
      }}>
        {/* 左：编码模式 / 前缀开关 — 语义集中 */}
        <Space size="middle" wrap>
          <Space size={8} align="center">
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>编码模式</span>
            <Switch
              checked={isManual}
              onChange={handleModeToggle}
              checkedChildren="手动编辑"
              unCheckedChildren="自动生成"
            />
          </Space>
          <span style={{
            fontSize: 12, color: 'var(--color-text-tertiary)',
            padding: '2px 8px',
            background: isManual ? 'var(--color-warning-bg, #fffbe6)' : 'var(--color-primary-bg, #e6f4ff)',
            borderRadius: 10,
          }}>
            {isManual ? '您手动维护：编码·颜色·尺码均可改' : '按「款号+颜色+尺码」自动生成，无需手写'}
          </span>
          <Space size={8} align="center">
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>字面前缀</span>
            <Switch
              checked={useSkuPrefix}
              onChange={handleUseSkuPrefixChange}
              checkedChildren="加前缀"
              unCheckedChildren="不加"
            />
          </Space>
        </Space>

        {/* 右：操作按钮 — 全部靠右对齐，主次分层 */}
        <Space size={4} wrap>
          {!isEditing ? (
            <Button type="primary" icon={<EditOutlined />} onClick={() => setIsEditing(true)}>
              编辑
            </Button>
          ) : (
            <>
              {isManual && (
                <Dropdown menu={{ items: addMenuItems }} trigger={['hover']}>
                  <Button icon={<PlusOutlined />}>新增编码</Button>
                </Dropdown>
              )}
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={saving}
                danger={!!(emptyCostCount || emptyTagCount)}
              >
                保存{isEditing && (emptyCostCount || emptyTagCount) ? `·${emptyCostCount + emptyTagCount}项必填未填` : ''}
              </Button>
              <Button icon={<RollbackOutlined />} onClick={handleCancelEdit}>
                退回
              </Button>
            </>
          )}
          <Tooltip title="颜色图片管理：支持批量上传多张颜色图">
            <Button icon={<PictureOutlined />} onClick={() => setColorImageMode(true)}>
              颜色图片
            </Button>
          </Tooltip>
          <Tooltip title="同步到大货订单的商品编码/SKC/价格">
            <Button icon={<CloudUploadOutlined />} onClick={handleSyncToProduction} loading={syncing}>
              同步到大货
            </Button>
          </Tooltip>
          <Button icon={<SyncOutlined />} onClick={fetchSkus} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      {/* ─── 第二层：SKC 编号信息条（和工具栏视觉上分层，细边框更清爽） ─── */}
      <div style={{
        marginBottom: 12,
        padding: '10px 16px',
        background: 'var(--color-bg-layout, #fafafa)',
        borderRadius: 8,
        border: '1px solid var(--color-border-light, #f0f0f0)',
      }}>
        <Space size="middle" align="center" wrap>
          <Space size={8} align="center">
            <CheckCircleFilled style={{ color: 'var(--color-primary, #2563eb)', fontSize: 14 }} />
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>SKC编号</span>
          </Space>
          {skcEditing ? (
            <>
              <Input
                value={skcValue}
                onChange={(e) => setSkcValue(e.target.value)}
                style={{ width: 220 }}
                placeholder="默认跟随款号，可修改"
                onPressEnter={handleSaveSkc}
                size="small"
              />
              <Button type="link" size="small" onClick={handleSaveSkc} loading={skcSaving}>保存</Button>
              <Button type="link" size="small" onClick={() => { setSkcEditing(false); setSkcValue(initialSkc || ''); }}>取消</Button>
            </>
          ) : (
            <>
              <span style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                fontSize: 14, fontWeight: 600,
                padding: '2px 8px',
                background: '#fff',
                border: '1px solid var(--color-border-light)',
                borderRadius: 4,
              }}>
                {skcValue || initialSkc || '-'}
              </span>
              <Button type="link" size="small" onClick={() => setSkcEditing(true)}>修改SKC编号</Button>
            </>
          )}
          <span style={{ fontSize: 12, color: 'var(--color-text-quaternary)' }}>
            SKC = 款式+颜色编号，同步到关联生产订单；改商品编码请先切换「手动编辑」再点编辑
          </span>
        </Space>
      </div>

      {/* ─── 第三层：批量填充工具栏（仅真实字段：成本价/基本售价/吊牌价） ─── */}
      <div id="batch-fill-toolbar" style={{
        marginBottom: 12,
        padding: '10px 14px',
        background: 'var(--color-bg-container, #f5f5f5)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        {/* 左：批量填充区 — 仅真实后端字段 */}
        <Space size={8} wrap align="center">
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }}>填充：</span>
          <Input
            size="small"
            placeholder="成本价"
            value={batchCostPrice ?? ''}
            onChange={(e) => setBatchCostPrice(e.target.value)}
            style={{ width: 108 }}
            prefix={<span style={{ color: 'var(--color-text-quaternary)' }}>¥</span>}
            disabled={!canEditAttrs}
          />
          <Input
            size="small"
            placeholder="基本售价"
            value={batchBasePrice ?? ''}
            onChange={(e) => setBatchBasePrice(e.target.value)}
            style={{ width: 108 }}
            prefix={<span style={{ color: 'var(--color-text-quaternary)' }}>¥</span>}
            disabled={!canEditAttrs}
          />
          <Input
            size="small"
            placeholder="吊牌价"
            value={batchTagPrice ?? ''}
            onChange={(e) => setBatchTagPrice(e.target.value)}
            style={{ width: 108 }}
            prefix={<span style={{ color: 'var(--color-text-quaternary)' }}>¥</span>}
            disabled={!canEditAttrs}
          />
          <Button type="primary" size="small" onClick={handleBatchFillConfirm} disabled={!canEditAttrs}>
            确认填充{selectedRowKeys.length ? `（选中${selectedRowKeys.length}行）` : '（全部）'}
          </Button>
          <Button size="small" icon={<UndoOutlined />} onClick={resetBatchFill}>重置</Button>
        </Space>

        {/* 右：批量启用/禁用（真实写入 status，保存后生效） */}
        <Space size={4} wrap align="center">
          <Dropdown
            menu={{
              items: [
                { key: 'enable', label: '批量启用' },
                { key: 'disable', label: '批量禁用' },
              ],
              onClick: ({ key }) => handleBatchToggleStatus(key),
            }}
            trigger={['hover']}
          >
            <Button size="small" disabled={!canEditAttrs || !selectedRowKeys.length}>
              批量启用/禁用{selectedRowKeys.length ? `（${selectedRowKeys.length}行）` : ''}
            </Button>
          </Dropdown>
        </Space>
      </div>

      {/* ─── 第四层：表格 ─── */}
      <SkuTable
        skus={skus}
        loading={loading}
        canEdit={canEdit}
        canEditAttrs={canEditAttrs}
        isManual={isManual}
        getCellValue={getCellValue}
        onFieldChange={handleFieldChange}
        onDeleteRow={handleDeleteRow}
        onReorder={handleReorder}
        onSelectedRowKeysChange={(keys) => setSelectedRowKeys(keys)}
      />

      {/* ─── 第五层：底部警示条（橙色Alert，对应图片底部「有 X 个SKU的成本价为空」） ─── */}
      {(emptyCostCount > 0 || emptyTagCount > 0 || selectedRowKeys.length > 0) && (
        <div style={{ marginTop: 10 }}>
          {emptyCostCount > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 6, borderRadius: 6 }}
              message={
                <span>
                  <strong>有 {emptyCostCount} 个 SKU 的成本价为空</strong>，
                  保存后将会覆盖基础资料的成本价（置 0），请检查确认后提交。
                  {canEditAttrs && (
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: '0 4px', height: 'auto' }}
                      onClick={() => {
                        // 定位到工具栏：聚焦到对应输入框（通过滚动到批量填充区）
                        document.getElementById('batch-fill-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                    >
                      去批量填充
                    </Button>
                  )}
                </span>
              }
            />
          )}
          {emptyTagCount > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 6, borderRadius: 6 }}
              message={
                <span>
                  <strong>有 {emptyTagCount} 个 SKU 的吊牌价为空</strong>，
                  吊牌价是必填项，保存后会影响打印和对外展示。
                  {canEditAttrs && (
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: '0 4px', height: 'auto' }}
                      onClick={() => {
                        document.getElementById('batch-fill-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                    >
                      去批量填充
                    </Button>
                  )}
                </span>
              }
            />
          )}
          {selectedRowKeys.length > 0 && (
            <Alert
              type="info"
              showIcon
              style={{ borderRadius: 6 }}
              message={
                <Space size={8} align="center">
                  <Badge count={selectedRowKeys.length} style={{ backgroundColor: 'var(--color-primary)' }} offset={[4, 0]} />
                  <span>已选中 <strong>{selectedRowKeys.length}</strong> 行，批量填充、批量修改状态仅作用于选中行；清空勾选则作用于全部</span>
                </Space>
              }
            />
          )}
        </div>
      )}

      {/* ─── 弹窗：颜色图片管理 ─── */}
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
          onSaved={() => { fetchSkus(); onRefresh?.(); }}
        />
      </Modal>

      {/* ─── 弹窗：退回编辑 ─── */}
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
          <p style={{ marginBottom: 8, color: 'var(--color-text-secondary)' }}>
            确定退回当前编辑？所有未保存的修改将被丢弃。
          </p>
          <Form.Item name="remark" label="退回备注（可选）">
            <Input.TextArea autoSize={{ minRows: 2 }} placeholder="请输入退回备注" autoFocus />
          </Form.Item>
        </Form>
      </SmallModal>

      {/* 全局自定义样式：选中行高亮 + 必填缺漏行淡红底 */}
      <style>{`
        /* 选中行：浅蓝背景 + 左侧蓝色边（和图片一致） */
        .ant-table-tbody > tr.ant-table-row-selected > td {
          background: var(--color-info-bg, #e6f4ff) !important;
        }
        .ant-table-tbody > tr.ant-table-row-selected:hover > td {
          background: var(--color-info-bg, #e6f4ff) !important;
        }
        /* 缺必填（成本价 0 / 空）：极淡红底，一眼扫出漏填项 */
        .sku-row-empty-required > td {
          background-color: rgba(255, 77, 79, 0.04) !important;
        }
        .sku-row-empty-required + .ant-table-row-striped > td,
        .sku-row-empty-required > td {
          transition: background-color 0.15s;
        }
      `}</style>
    </div>
  );
};

export default StyleSkuTab;
