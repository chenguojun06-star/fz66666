import React from 'react';
import { Button, Card, Tag } from 'antd';
import { PlusOutlined, ReloadOutlined, FileTextOutlined, AppstoreAddOutlined, EyeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import UniversalCardView from '@/components/common/UniversalCardView';
import StandardToolbar from '@/components/common/StandardToolbar';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { getMaterialTypeLabel } from '@/utils/materialType';
import type { MaterialColorCard } from './types';
import { MATERIAL_TYPE_OPTIONS } from './types';

// ===== 供应商色卡视图（renderCardView 抽取） =====
interface MaterialCardViewProps {
  cardDataList: MaterialColorCard[];
  cardLoading: boolean;
  cardPage: number;
  cardPageSize: number;
  cardTotal: number;
  cardKeyword: string;
  cardMaterialType: string;
  setCardKeyword: (v: string) => void;
  setCardMaterialType: (v: string) => void;
  setCardPage: (p: number) => void;
  fetchCardList: () => void;
  openCardItemsDialog: (card: MaterialColorCard) => void;
  handleGenerateCardMaterials: (card: MaterialColorCard) => void;
  openCardEditDialog: (card: MaterialColorCard) => void;
  openCardCreateDialog: () => void;
  handleCardDelete: (id: string) => void;
}

const MaterialCardView: React.FC<MaterialCardViewProps> = ({
  cardDataList, cardLoading, cardPage, cardPageSize, cardTotal,
  cardKeyword, cardMaterialType: _cardMaterialType,
  setCardKeyword, setCardMaterialType, setCardPage, fetchCardList,
  openCardItemsDialog, handleGenerateCardMaterials, openCardEditDialog, openCardCreateDialog, handleCardDelete,
}) => {
  return (
    <>
      {/* 卡片视图搜索栏 —— 使用标准 StandardToolbar + StandardSearchBar */}
      <Card style={{ marginBottom: 12, background: 'var(--color-bg-container)' }}>
        <StandardToolbar
          left={
            <StandardSearchBar
              searchValue={cardKeyword}
              onSearchChange={(v) => { setCardKeyword(v); setCardPage(1); }}
              searchPlaceholder="搜索编号/名称/供应商"
              showDate={false}
              showStatus={false}
              showSearchButton={false}
              showResetButton
              onReset={() => { setCardKeyword(''); setCardMaterialType(''); setCardPage(1); fetchCardList(); }}
              extraFilters={[
                {
                  key: 'materialType',
                  label: '物料类型',
                  type: 'select',
                  placeholder: '全部类型',
                  width: 130,
                  options: MATERIAL_TYPE_OPTIONS,
                },
              ]}
              onFilterChange={(key, value) => {
                if (key === 'materialType') {
                  setCardMaterialType((value as string) || '');
                  setCardPage(1);
                }
              }}
            />
          }
          right={
            <>
              <Button icon={<ReloadOutlined />} onClick={fetchCardList}>刷新</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCardCreateDialog}>新建物料色卡</Button>
            </>
          }
        />
      </Card>

      {/* 通用卡片网格 */}
      <UniversalCardView
        dataSource={cardDataList}
        loading={cardLoading}
        titleField="cardName"
        subtitleField="cardCode"
        coverField="coverImage"
        coverPlaceholder="暂无封面"
        columns={4}
        fields={[
          { label: '供应商', key: 'supplierName', format: (v) => v || '-' },
          { label: '联系人', key: 'supplierContactPerson', format: (v, r) => v ? `${v}${r?.supplierContactPhone ? ' · ' + r.supplierContactPhone : ''}` : '-' },
          { label: '幅宽', key: 'fabricWidth', format: (v) => v || '-' },
          { label: '克重', key: 'fabricWeight', format: (v) => v || '-' },
          { label: '规格', key: 'specifications', format: (v) => v || '-' },
          { label: '成分', key: 'fabricComposition', format: (v) => v || '-' },
        ]}
        titleTags={(record) => (
          <>
            <Tag color="blue">{getMaterialTypeLabel(record.materialType)}</Tag>
            <Tag color={record.materialCount && record.materialCount > 0 ? 'green' : 'default'}>
              {record.materialCount || 0} 条物料
            </Tag>
          </>
        )}
        actions={(record) => [
          { key: 'manage', label: '物料管理', icon: <AppstoreAddOutlined />, onClick: () => openCardItemsDialog(record) },
          { key: 'generate', label: '生成物料', icon: <EyeOutlined />, onClick: () => handleGenerateCardMaterials(record) },
          { key: 'edit', label: '编辑', icon: <EditOutlined />, onClick: () => openCardEditDialog(record) },
          { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => handleCardDelete(record.id) },
        ]}
        maxInlineActions={2}
        pagination={{
          current: cardPage,
          pageSize: cardPageSize,
          total: cardTotal,
          onChange: (p) => setCardPage(p),
          showTotal: (t) => `共 ${t} 条`,
        }}
        hoverRender={(record) => (
          <div style={{ maxWidth: 400 }}>
            {record.remark && <div style={{ marginBottom: 8, color: 'var(--color-text-secondary)' }}>备注：{record.remark}</div>}
            {record.supplierContactPerson && <div>联系人：{record.supplierContactPerson}</div>}
            {record.supplierContactPhone && <div>电话：{record.supplierContactPhone}</div>}
            <div>创建时间：{record.createTime?.slice(0, 19).replace('T', ' ')}</div>
          </div>
        )}
      />

      {/* 空状态 */}
      {cardDataList.length === 0 && !cardLoading && (
        <Card style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-tertiary)', marginTop: 12 }}>
          <FileTextOutlined style={{ fontSize: 48, marginBottom: 12 }} />
          <div>暂无物料色卡，点击右上角"新建物料色卡"开始创建</div>
        </Card>
      )}
    </>
  );
};

MaterialCardView.displayName = 'MaterialCardView';

export default MaterialCardView;
