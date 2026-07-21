import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Tag, message, Segmented, Space } from 'antd';
import { UnorderedListOutlined, AppstoreOutlined, EditOutlined, DeleteOutlined, PrinterOutlined, BookOutlined } from '@ant-design/icons';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import StandardToolbar from '@/components/common/StandardToolbar';
import { useUser } from '@/utils/AuthContext';
import ResizableTable from '@/components/common/ResizableTable';
import UniversalCardView from '@/components/common/UniversalCardView';
import '@/components/common/UniversalCardView/style.css';
import { MaterialDatabase } from '@/types/production';
import api from '@/utils/api';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { useViewport } from '@/utils/useViewport';
import { useTablePagination } from '@/hooks';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { useMaterialDatabaseActions } from './useMaterialDatabaseActions';
import { getMaterialDatabaseColumns } from './materialDatabaseColumns';
import { useMaterialColorCard } from './useMaterialColorCard';
import { useMaterialPrint } from './useMaterialPrint';
import MaterialCardView from './MaterialCardView';
import MaterialFormDrawer from './MaterialFormDrawer';
import MaterialColorCardDialog from './MaterialColorCardDialog';
import MaterialColorCardItemsModal from './MaterialColorCardItemsModal';
import MaterialColorItemsModal from './MaterialColorItemsModal';

const MaterialDatabasePage: React.FC = () => {
  const { isMobile } = useViewport();
  const { user } = useUser();
  const [dataList, setDataList] = useState<MaterialDatabase[]>([]);
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = isSmartFeatureEnabled('smart.production.precheck.enabled' as any);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusValue, setStatusValue] = useState('');
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);
  const { pagination, onChange } = useTablePagination(20);
  const currentPage = pagination.current;
  const currentPageSize = pagination.pageSize;

  // ===== 视图切换：列表 / 物料卡片 / 供应商色卡 =====
  const [viewMode, setViewMode] = useState<'list' | 'materialCard' | 'supplierCard'>('list');

  // ===== 供应商色卡相关状态与业务逻辑（抽取到 useMaterialColorCard） =====
  const {
    cardDataList, cardLoading, cardPage, cardPageSize, cardTotal, cardKeyword, cardMaterialType,
    setCardKeyword, setCardMaterialType, setCardPage, fetchCardList,
    itemVisible, setItemVisible, currentItems, currentCardName, currentCard,
    openCardItemsDialog, addEmptyCardItem, updateCardItem, removeCardItem, saveCardItems,
    handleGenerateCardMaterials,
    cardDialogVisible, setCardDialogVisible, cardForm, coverImageFiles, setCoverImageFiles,
    openCardEditDialog, openCardCreateDialog, handleCardSave, handleCardDelete, uploadCardImage,
  } = useMaterialColorCard();

  // 切换到供应商色卡时加载数据
  useEffect(() => {
    if (viewMode === 'supplierCard') fetchCardList();
  }, [viewMode, fetchCardList]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        page: currentPage,
        pageSize: currentPageSize,
        keyword: searchKeyword,
        status: statusValue,
        startDate: dateRange?.[0],
        endDate: dateRange?.[1],
      };
      const res = await api.get<any>('/material/database/list', { params });
      const result = res as any;
      if (result.code === 200) {
        const data = result.data || {};
        setDataList(Array.isArray(data) ? data : data.records || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [currentPage, currentPageSize, searchKeyword, statusValue, dateRange]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const {
    form, visible, currentMaterial, imageFiles, setImageFiles,
    returnTarget, setReturnTarget, returnLoading, submitLoading,
    fetchMaterialCode, uploadImage, openDialog, closeDialog, handleSubmit,
    handleDelete, handleComplete, handleReturn, handleReturnConfirm,
    handleDisable, handleEnable, toLocalDateTimeInputValue,
  } = useMaterialDatabaseActions({ dataList, fetchList });

  // ===== 色卡本颜色详情弹窗 =====
  const [colorItemsVisible, setColorItemsVisible] = useState(false);
  const [colorItemsData, setColorItemsData] = useState<any>(null);
  const [colorItemsLoading, setColorItemsLoading] = useState(false);

  const viewColorItems = useCallback(async (record: MaterialDatabase) => {
    if (!record?.id) return;
    setColorItemsLoading(true);
    try {
      const res = await api.get<any>(`/color-card/by-material/${record.id}`);
      const result = res as any;
      if (result.code === 200) {
        setColorItemsData(result.data);
        setColorItemsVisible(true);
      } else {
        message.error(result.message || '加载失败');
      }
    } catch (e: any) {
      message.error(e?.message || '加载失败');
    } finally {
      setColorItemsLoading(false);
    }
  }, []);

  const columns = getMaterialDatabaseColumns({
    openDialog, handleComplete, handleDelete, handleReturn, handleDisable, handleEnable, viewColorItems, user,
  });

  // ===== 打印功能（抽取到 useMaterialPrint） =====
  const { handlePrintMaterialDatabase } = useMaterialPrint(dataList);

  // 列表/卡片视图共用的搜索栏配置
  const listStatusOptions = [
    { label: '全部', value: '' }, { label: '面料', value: 'fabric' },
    { label: '里料', value: 'lining' }, { label: '辅料', value: 'accessory' },
    { label: '已停用', value: 'disabled' },
  ];

  return (
    <>
      {showSmartErrorNotice && smartError ? (
        <Card style={{ marginBottom: 12 }}>
          <SmartErrorNotice error={smartError} onFix={() => { void fetchList(); }} />
        </Card>
      ) : null}

      {/* 视图切换 + 标题栏 */}
      <Card style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
          <h2 style={{ margin: 0 }}> 物料资料库</h2>
          <Space>
            <Segmented
              value={viewMode}
              onChange={(v) => setViewMode(v as 'list' | 'materialCard' | 'supplierCard')}
              options={[
                { value: 'list', label: <span><UnorderedListOutlined /> 列表</span> },
                { value: 'materialCard', label: <span><AppstoreOutlined /> 物料卡片</span> },
                { value: 'supplierCard', label: <span><BookOutlined /> 供应商色卡</span> },
              ]}
            />
            {viewMode === 'list' && (
              <Button icon={<PrinterOutlined />} onClick={handlePrintMaterialDatabase}>打印清单</Button>
            )}
          </Space>
        </div>
      </Card>

      {/* 列表视图 */}
      {viewMode === 'list' && (
        <Card style={{ marginTop: 12 }}>
          <Card style={{ marginBottom: 12, background: 'var(--color-bg-container)' }}>
            <StandardToolbar
              left={(
                <StandardSearchBar
                  searchValue={searchKeyword} onSearchChange={setSearchKeyword}
                  searchPlaceholder="搜索物料编号/名称" dateValue={dateRange} onDateChange={setDateRange}
                  statusValue={statusValue} onStatusChange={setStatusValue} showDatePresets={false}
                  statusOptions={listStatusOptions}
                />
              )}
              right={<Button type="primary" onClick={() => openDialog('create')}>新增物料信息</Button>}
            />
          </Card>
          <ResizableTable<MaterialDatabase>
            columns={columns} dataSource={dataList} rowKey={(r) => String(r?.id || r?.materialCode || '')}
            loading={loading} stickyHeader scroll={{ x: 'max-content' }} size={isMobile ? 'small' : 'middle'} emptyDescription="暂无物料数据"
            pagination={{ ...pagination, simple: false, showTotal: (t) => `共 ${t} 条`, showSizeChanger: true, pageSizeOptions: ['20', '50', '100', '200'], onChange, size: isMobile ? 'small' : 'default' }}
          />
        </Card>
      )}

      {/* 物料卡片视图 */}
      {viewMode === 'materialCard' && (
        <Card style={{ marginTop: 12 }}>
          <Card style={{ marginBottom: 12, background: 'var(--color-bg-container)' }}>
            <StandardToolbar
              left={(
                <StandardSearchBar
                  searchValue={searchKeyword} onSearchChange={setSearchKeyword}
                  searchPlaceholder="搜索物料编号/名称" dateValue={dateRange} onDateChange={setDateRange}
                  statusValue={statusValue} onStatusChange={setStatusValue} showDatePresets={false}
                  statusOptions={listStatusOptions}
                />
              )}
              right={<Button type="primary" onClick={() => openDialog('create')}>新增物料信息</Button>}
            />
          </Card>
          <UniversalCardView
            dataSource={dataList}
            loading={loading}
            titleField="materialName"
            subtitleField="materialCode"
            coverField="image"
            coverPlaceholder="暂无图片"
            fields={[
              { label: '类型', key: 'materialType', format: (v) => getMaterialTypeLabel(v) },
              { label: '颜色', key: 'color', format: (v) => v || '-' },
              { label: '幅宽', key: 'fabricWidth', format: (v) => v || '-' },
              { label: '克重', key: 'fabricWeight', format: (v) => v || '-' },
              { label: '规格', key: 'specifications', format: (v) => v || '-' },
              { label: '成分', key: 'fabricComposition', format: (v) => v || '-' },
              { label: '单价', key: 'unitPrice', format: (v) => v != null ? `¥${v}` : '-' },
              { label: '单位', key: 'unit', format: (v) => v || '-' },
            ]}
            titleTags={(record) => (
              <>
                <Tag color="blue">{getMaterialTypeLabel(record.materialType)}</Tag>
                {record.disabled === 1 && <Tag color="default">已停用</Tag>}
              </>
            )}
            actions={(record) => [
              { key: 'edit', label: '编辑', icon: <EditOutlined />, onClick: () => openDialog('edit', record) },
              { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => handleDelete(record) },
            ]}
            maxInlineActions={2}
            pagination={{
              ...pagination, showTotal: (t) => `共 ${t} 条`, showSizeChanger: true,
              pageSizeOptions: ['20', '50', '100', '200'], onChange, size: isMobile ? 'small' : 'default',
            }}
            hoverRender={(record) => (
              <div style={{ maxWidth: 400 }}>
                {record.supplierName && <div style={{ marginBottom: 6 }}>供应商：{record.supplierName}</div>}
                {record.supplierContactPerson && <div>联系人：{record.supplierContactPerson}{record.supplierContactPhone ? ` · ${record.supplierContactPhone}` : ''}</div>}
                {record.description && <div style={{ marginTop: 6, color: '#666' }}>{record.description}</div>}
                {record.remark && <div style={{ marginTop: 6, color: '#874d00' }}>备注：{record.remark}</div>}
              </div>
            )}
          />
        </Card>
      )}

      {/* 供应商色卡视图 */}
      {viewMode === 'supplierCard' && (
        <Card style={{ marginTop: 12 }}>
          <MaterialCardView
            cardDataList={cardDataList}
            cardLoading={cardLoading}
            cardPage={cardPage}
            cardPageSize={cardPageSize}
            cardTotal={cardTotal}
            cardKeyword={cardKeyword}
            cardMaterialType={cardMaterialType}
            setCardKeyword={setCardKeyword}
            setCardMaterialType={setCardMaterialType}
            setCardPage={setCardPage}
            fetchCardList={fetchCardList}
            openCardItemsDialog={openCardItemsDialog}
            handleGenerateCardMaterials={handleGenerateCardMaterials}
            openCardEditDialog={openCardEditDialog}
            openCardCreateDialog={openCardCreateDialog}
            handleCardDelete={handleCardDelete}
          />
        </Card>
      )}

      {/* ===== 物料新增/编辑抽屉（抽取为 MaterialFormDrawer） ===== */}
      <MaterialFormDrawer
        visible={visible}
        currentMaterial={currentMaterial}
        form={form}
        imageFiles={imageFiles}
        setImageFiles={setImageFiles}
        uploadImage={uploadImage}
        fetchMaterialCode={fetchMaterialCode}
        closeDialog={closeDialog}
        handleSubmit={handleSubmit}
        submitLoading={submitLoading}
        toLocalDateTimeInputValue={toLocalDateTimeInputValue}
        isMobile={isMobile}
      />

      {/* ===== 退回编辑原因弹窗 ===== */}
      <RejectReasonModal
        open={returnTarget !== null} title="确认退回编辑"
        description="退回后该物料将恢复为待处理状态，可重新编辑。"
        fieldLabel="退回原因" placeholder="请填写退回原因（可选）" required={false}
        okText="确认退回" loading={returnLoading} onOk={handleReturnConfirm} onCancel={() => setReturnTarget(null)}
      />

      {/* ===== 色卡本颜色详情弹窗（抽取为 MaterialColorItemsModal） ===== */}
      <MaterialColorItemsModal
        open={colorItemsVisible}
        loading={colorItemsLoading}
        data={colorItemsData}
        onCancel={() => setColorItemsVisible(false)}
      />

      {/* ===== 物料色卡母卡新建/编辑弹窗（抽取为 MaterialColorCardDialog） ===== */}
      <MaterialColorCardDialog
        open={cardDialogVisible}
        currentCard={currentCard}
        cardForm={cardForm}
        coverImageFiles={coverImageFiles}
        setCoverImageFiles={setCoverImageFiles}
        uploadCardImage={uploadCardImage}
        onCancel={() => setCardDialogVisible(false)}
        onOk={handleCardSave}
      />

      {/* ===== 物料色卡子物料管理弹窗（抽取为 MaterialColorCardItemsModal） ===== */}
      <MaterialColorCardItemsModal
        open={itemVisible}
        currentCardName={currentCardName}
        currentItems={currentItems}
        onCancel={() => setItemVisible(false)}
        onSave={saveCardItems}
        addEmptyCardItem={addEmptyCardItem}
        updateCardItem={updateCardItem}
        removeCardItem={removeCardItem}
        uploadCardImage={uploadCardImage}
      />
    </>
  );
};

export default MaterialDatabasePage;
