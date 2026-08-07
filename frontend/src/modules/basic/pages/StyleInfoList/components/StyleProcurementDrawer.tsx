import React from 'react';
import { Drawer } from 'antd';
import { StyleInfo } from '@/types/style';
import MaterialPurchaseDetail from '@/modules/production/pages/Production/MaterialPurchaseDetail';

interface StyleProcurementDrawerProps {
  open: boolean;
  record: StyleInfo | null;
  onClose: () => void;
  onSync: () => void;
}

/**
 * 样衣采购管理 Drawer（侧滑弹窗）。
 * 复用 MaterialPurchaseDetail 的 embedded 模式，sampleMode=true：
 * - 不查询生产订单（样衣场景无订单）
 * - 按 sourceType='sample' + styleNo 过滤采购数据
 * - 新增/编辑采购单时默认 sourceType='sample'，不填 orderNo
 * - 抑制"订单不存在"警告
 */
const StyleProcurementDrawer: React.FC<StyleProcurementDrawerProps> = ({
  open, record, onClose, onSync,
}) => {
  const styleNo = record?.styleNo || '';

  const handleClose = () => {
    onClose();
    // 关闭时同步外层列表，刷新采购进度球
    onSync();
  };

  return (
    <Drawer
      open={open}
      title={record ? `${record.styleNo} · 采购管理` : '采购管理'}
      onClose={handleClose}
      size="large"
      styles={{ wrapper: { width: '85%' }, body: { padding: 0 } }}
      destroyOnHidden
    >
      {record && styleNo && (
        <MaterialPurchaseDetail
          styleNo={styleNo}
          embedded
          sampleMode
          onClose={handleClose}
        />
      )}
    </Drawer>
  );
};

export default StyleProcurementDrawer;
