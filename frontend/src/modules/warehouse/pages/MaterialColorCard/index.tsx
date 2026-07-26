import React from 'react';
import {
  Button, Card, Input, Select, Row, Col, Space, Pagination, Empty,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { MATERIAL_TYPE_OPTIONS } from './types';
import { useMaterialColorCardData } from './hooks/useMaterialColorCardData';
import MaterialCardItem from './components/MaterialCardItem';
import CardEditModal from './components/CardEditModal';
import ItemsManageModal from './components/ItemsManageModal';
import ColorDetailModal from './components/ColorDetailModal';

const MaterialColorCardPage: React.FC = () => {
  const {
    // 列表
    dataList, loading, keyword, setKeyword,
    materialType, setMaterialType,
    page, setPage, pageSize, setPageSize, total,
    fetchList,
    // 母卡编辑
    dialogVisible, setDialogVisible,
    currentCard, form, submitting, coverImageFiles, setCoverImageFiles,
    openCreateDialog, openEditDialog, handleSave, handleDelete,
    // 颜色详情
    colorDetailVisible, setColorDetailVisible,
    colorDetailItem, colorDetailParent,
    openColorDetail,
    // 物料管理
    itemVisible, setItemVisible,
    currentItems, currentCardName,
    openItemsDialog, addEmptyItem, updateItem, removeItem, saveItems,
    // 生成物料
    handleGenerateMaterials,
  } = useMaterialColorCardData();

  return (
    <>
      {/* 搜索工具栏 */}
      <Card style={{ marginBottom: 12, background: 'var(--color-bg-container)' }}>
        <Space.Compact style={{ width: '100%', display: 'flex' }}>
          <Input placeholder="搜索色卡编号/名称/供应商" value={keyword}
            onChange={(e) => setKeyword(e.target.value)} style={{ maxWidth: 280 }} allowClear />
          <Select placeholder="物料类型" value={materialType || undefined} onChange={setMaterialType}
            style={{ width: 140 }} allowClear>
            {MATERIAL_TYPE_OPTIONS.map((o) => (
              <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
          <div style={{ flexGrow: 1 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDialog}>新建物料色卡</Button>
        </Space.Compact>
      </Card>

      {/* 卡片网格 */}
      {dataList.length === 0 && !loading ? (
        <Card style={{ textAlign: 'center', padding: '60px 0' }}>
          <Empty
            image={<FileTextOutlined style={{ fontSize: 48, color: 'var(--color-text-quaternary)', marginBottom: 12 }} />}
            description={<span style={{ color: 'var(--color-text-tertiary)' }}>暂无物料色卡，点击右上角「新建物料色卡」开始创建</span>}
          />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {dataList.map((card) => (
            <Col xs={24} sm={24} md={12} lg={8} xl={6} key={card.id}>
              <MaterialCardItem
                card={card}
                onEdit={openEditDialog}
                onDelete={handleDelete}
                onOpenItems={openItemsDialog}
                onGenerateMaterials={handleGenerateMaterials}
              />
            </Col>
          ))}
        </Row>
      )}

      {/* 分页：使用 antd Pagination */}
      {total > 0 && (
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            showTotal={(t) => `共 ${t} 张色卡`}
            pageSizeOptions={[12, 24, 48]}
            onChange={(p, ps) => { setPage(p); setPageSize(ps); }}
          />
        </div>
      )}

      {/* ===== 母卡新建/编辑弹窗 ===== */}
      <CardEditModal
        visible={dialogVisible}
        onCancel={() => setDialogVisible(false)}
        onOk={handleSave}
        currentCard={currentCard}
        form={form}
        submitting={submitting}
        coverImageFiles={coverImageFiles}
        setCoverImageFiles={setCoverImageFiles}
      />

      {/* ===== 物料管理弹窗 ===== */}
      <ItemsManageModal
        visible={itemVisible}
        onCancel={() => setItemVisible(false)}
        onSave={saveItems}
        currentCardName={currentCardName}
        currentItems={currentItems}
        colorDetailParent={colorDetailParent}
        onAddEmptyItem={addEmptyItem}
        onUpdateItem={updateItem}
        onRemoveItem={removeItem}
        onOpenColorDetail={openColorDetail}
      />

      {/* ===== 颜色详情弹窗（合并母卡+颜色信息） ===== */}
      <ColorDetailModal
        visible={colorDetailVisible}
        onCancel={() => setColorDetailVisible(false)}
        colorDetailItem={colorDetailItem}
        colorDetailParent={colorDetailParent}
      />
    </>
  );
};

export default MaterialColorCardPage;
