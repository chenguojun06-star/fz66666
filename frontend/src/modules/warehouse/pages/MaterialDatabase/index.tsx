import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Tag, message, Segmented, Space } from 'antd';
import { UnorderedListOutlined, AppstoreOutlined, EditOutlined, DeleteOutlined, PrinterOutlined, BookOutlined, HistoryOutlined } from '@ant-design/icons';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import RecordLogDrawer from '@/components/common/RecordLogDrawer';
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
import PriceComparisonDrawer from './PriceComparisonDrawer';

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
  const { pagination, onChange, setTotal } = useTablePagination(20);
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
    recognizeEntriesAndSave, replaceItemsAndAutosave,
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
        const records = Array.isArray(data) ? data : data.records || [];
        setDataList(records);
        // 分页 total 必须回填，否则表格/卡片视图的翻页器会因 total=0 不渲染
        setTotal(typeof data.total === 'number' ? data.total : records.length);
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
    deleteTarget, setDeleteTarget, deleteLoading, handleDeleteConfirm,
    fetchMaterialCode, uploadImage, openDialog, closeDialog, handleSubmit,
    handleDelete, handleComplete, handleReturn, handleReturnConfirm,
    handleDisable, handleEnable, toLocalDateTimeInputValue,
  } = useMaterialDatabaseActions({ dataList, fetchList });

  // ===== 操作日志侧滑（物料数据库） =====
  const [operationLogOpen, setOperationLogOpen] = useState(false);

  // ===== 色卡本颜色详情弹窗 =====
  const [colorItemsVisible, setColorItemsVisible] = useState(false);
  const [colorItemsData, setColorItemsData] = useState<any>(null);
  const [colorItemsLoading, setColorItemsLoading] = useState(false);

  const viewColorItems = useCallback(async (record: MaterialDatabase) => {
    if (!record?.id) return;
    setColorItemsLoading(true);
    try {
      const res = await api.get<any>(`/material-color-card/by-material/${record.id}`);
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

  // D-445/D-447：多供应商比价抽屉（锚定物料主档分级匹配：色卡报价 + 采购成交价）
  const [priceCompare, setPriceCompare] = useState<{ open: boolean; materialId: string; materialName: string }>({ open: false, materialId: '', materialName: '' });
  const handlePriceCompare = React.useCallback((record: MaterialDatabase) => {
    setPriceCompare({ open: true, materialId: String(record.id || ''), materialName: String(record.materialName || '') });
  }, []);

  const columns = getMaterialDatabaseColumns({
    openDialog, handleComplete, handleDelete, handleReturn, handleDisable, handleEnable, viewColorItems, handlePriceCompare, user,
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
        <div className="u-d-flex u-jc-between u-ai-center u-mb-0">
          <h2 className="u-m-0"> 物料资料库</h2>
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
            <Button icon={<HistoryOutlined />} onClick={() => setOperationLogOpen(true)}>操作日志</Button>
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
                {record.supplierName && <div className="u-mb-6">供应商：{record.supplierName}</div>}
                {record.supplierContactPerson && <div>联系人：{record.supplierContactPerson}{record.supplierContactPhone ? ` · ${record.supplierContactPhone}` : ''}</div>}
                {record.description && <div className="u-mt-6" style={{ color: 'var(--color-gray-dark)' }}>{record.description}</div>}
                {record.remark && <div className="u-mt-6" style={{ color: 'var(--color-amber-700)' }}>备注：{record.remark}</div>}
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

      {/* ===== 物料管理/编辑抽屉（抽取为 MaterialFormDrawer） ===== */}
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

      {/* ===== 删除原因弹窗（必填，原因落 t_operation_log.details） ===== */}
      <RejectReasonModal
        open={deleteTarget !== null}
        title={`确认删除${deleteTarget ? ` - ${deleteTarget.materialCode || deleteTarget.materialName || ''}` : ''}`}
        description="删除后该物料不可恢复。删除原因会写入操作日志，便于后续追溯。"
        fieldLabel="删除原因" placeholder="请填写删除原因（如：录入错误 / 重复建档 / 已停用替代）" required
        okText="确认删除" loading={deleteLoading}
        onOk={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ===== 物料资料库操作日志 ===== */}
      {/*
       * filter 取值依据（勿凭感觉改）：
       * 物料资料库的操作日志由 MaterialDatabaseLogAppendHelper 落库，
       * 经 OperationLogAppendUtil.writeLog(entityName=..., ...) 写入，
       * 而 writeLog 的第一个实参进的是 **module** 字段（不是 targetType），
       * 且 Helper 路径**从不设置 targetType**（恒为 null）。
       * 所以这里必须只传 module='物料数据库'（= getEntityName() 返回值）。
       *
       * ⚠️ 不要加 targetType：后端 OperationLogServiceImpl 用 wrapper.eq 精确匹配，
       *    传任何 targetType 都会因库中为 null 而查到 0 条。
       * ⚠️ 也不要写成 module='生产管理'：AOP 的 resolveModule() 只返回
       *    样衣开发/大货生产/仓库管理/财务管理/下单管理/基础设置/模板库/其他，没有"生产管理"。
       */}
      <RecordLogDrawer
        open={operationLogOpen}
        onClose={() => setOperationLogOpen(false)}
        title="物料资料库操作日志"
        filter={{ module: '物料数据库' }}
      />

      {/* ===== 色卡本颜色详情弹窗（抽取为 MaterialColorItemsModal） ===== */}
      <PriceComparisonDrawer
        open={priceCompare.open}
        materialId={priceCompare.materialId}
        materialName={priceCompare.materialName}
        onClose={() => setPriceCompare({ open: false, materialId: '', materialName: '' })}
      />

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
        recognizeEntriesAndSave={recognizeEntriesAndSave}
        replaceItemsAndAutosave={replaceItemsAndAutosave}
      />
    </>
  );
};

export default MaterialDatabasePage;
