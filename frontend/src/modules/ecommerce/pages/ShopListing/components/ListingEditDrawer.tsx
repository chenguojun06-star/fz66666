import React, { useMemo } from 'react';
import { Alert, Button, Space, Spin, Typography } from 'antd';
import SideDrawer from '@/components/common/SideDrawer';
import CoverColorImagesSection from './CoverColorImagesSection';
import SkuPriceStockSection from './SkuPriceStockSection';
import ListingInfoSection from './ListingInfoSection';
import LayoutEditorSection from './LayoutEditorSection';
import type { EditableSku, ListingRow } from '../types';

const { Text } = Typography;

interface Props {
  open: boolean;
  loading: boolean;
  saving: boolean;
  row: ListingRow | null;
  skus: EditableSku[];
  setSkus: React.Dispatch<React.SetStateAction<EditableSku[]>>;
  cover: string | null;
  setCover: (v: string | null) => void;
  colorImages: Record<string, string>;
  setColorImages: (v: Record<string, string>) => void;
  remark: string;
  setRemark: (v: string) => void;
  listed: boolean;
  toggling: boolean;
  onToggleListing: (listed: boolean) => void;
  onClose: () => void;
  onSave: () => void;
}

/**
 * 店铺商品编辑抽屉（D-768）：图片区 / SKU 售价库存区 / 上架信息区，宽度统一 85%。
 */
const ListingEditDrawer: React.FC<Props> = ({
  open, loading, saving, row, skus, setSkus,
  cover, setCover, colorImages, setColorImages, remark, setRemark,
  listed, toggling, onToggleListing, onClose, onSave,
}) => {
  const colors = useMemo(() => {
    const seen: string[] = [];
    skus.forEach((s) => {
      if (s.color && !seen.includes(s.color)) seen.push(s.color);
    });
    return seen;
  }, [skus]);

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      width="85%"
      title={row ? `店铺商品 · ${row.styleName || row.styleNo || ''}` : '店铺商品'}
      footer={
        <>
          <Button onClick={onClose}>关闭</Button>
          <Button type="primary" loading={saving} onClick={onSave} disabled={loading}>
            保存图片与售价库存
          </Button>
        </>
      }
      footerExtra={<Text type="secondary">上下架开关即时生效，其余改动点「保存」后生效</Text>}
    >
      {loading ? (
        <div className="shop-listing__loading">
          <Spin />
          <Text type="secondary">加载商品详情…</Text>
        </div>
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="图片怎么改"
            description="主图决定店铺列表卡片和详情页的默认大图；给每个颜色单独配图后，顾客在详情页切换颜色时会换成对应的图。"
          />
          <CoverColorImagesSection
            cover={cover}
            setCover={setCover}
            colorImages={colorImages}
            setColorImages={setColorImages}
            colors={colors}
          />
          <SkuPriceStockSection skus={skus} setSkus={setSkus} />
          <LayoutEditorSection styleId={row?.id ?? null} />
          <ListingInfoSection
            listed={listed}
            toggling={toggling}
            onToggleListing={onToggleListing}
            remark={remark}
            setRemark={setRemark}
          />
        </Space>
      )}
    </SideDrawer>
  );
};

export default ListingEditDrawer;