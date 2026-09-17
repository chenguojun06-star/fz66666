import React, { useState } from 'react';
import { App, Button, Card, Col, Image, Input, InputNumber, Popconfirm, Row, Select, Space, Tag } from 'antd';
import { AppstoreAddOutlined, CameraOutlined, PlusOutlined } from '@ant-design/icons';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import api from '@/utils/api';
import SideDrawer from '@/components/common/SideDrawer';
import type { MaterialColorCardItem } from './types';
import { MATERIAL_TYPE_OPTIONS } from './types';
import { colorNameToHex } from './MaterialColorItemsModal';

// ===== 物料色卡子物料管理（D-444：弹窗统一为侧滑抽屉 + 批量单价处理 + 无图色块 + D-446 拍照识别） =====
interface MaterialColorCardItemsModalProps {
  open: boolean;
  currentCardName: string;
  currentItems: MaterialColorCardItem[];
  onCancel: () => void;
  onSave: () => void;
  addEmptyCardItem: () => void;
  appendRecognizedItems?: (items: MaterialColorCardItem[]) => void;
  updateCardItem: (idx: number, field: keyof MaterialColorCardItem, value: any) => void;
  removeCardItem: (idx: number) => void;
  uploadCardImage: (file: File) => Promise<string>;
}

const MaterialColorCardItemsModal: React.FC<MaterialColorCardItemsModalProps> = ({
  open, currentCardName, currentItems,
  onCancel, onSave, addEmptyCardItem, appendRecognizedItems, updateCardItem, removeCardItem, uploadCardImage,
}) => {
  const { message } = App.useApp();
  const [unifiedPrice, setUnifiedPrice] = useState<number | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [recognizeProgress, setRecognizeProgress] = useState('');
  const recognizeInputRef = React.useRef<HTMLInputElement | null>(null);

  // D-444：批量单价处理——一个价应用到全部明细（与出库统一单价同款交互）
  const handleApplyUnifiedPrice = () => {
    if (unifiedPrice == null || unifiedPrice <= 0) { message.warning('请先输入统一单价'); return; }
    if (currentItems.length === 0) { message.warning('暂无物料明细'); return; }
    currentItems.forEach((_, idx) => updateCardItem(idx, 'unitPrice', unifiedPrice));
    message.success(`已将单价 ${unifiedPrice} 元应用到全部 ${currentItems.length} 条明细`);
  };

  const handleUploadImage = async (idx: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    const file: File | undefined = await new Promise((resolve) => {
      input.onchange = (ev: any) => resolve(ev.target.files?.[0]);
      input.click();
    });
    if (!file) return; // 用户取消选择
    try {
      const url = await uploadCardImage(file);
      updateCardItem(idx, 'image', url);
    } catch (e) {
      console.error('[MaterialDatabase] 上传色卡图片失败:', e);
      message.error('上传图片失败');
    }
  };

  /** D-446：拍照识别——多张色卡照片逐张调视觉识别，结果批量追加为明细行（同名同色去重） */
  const handleRecognize = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!appendRecognizedItems) { message.warning('当前模式不支持识别'); return; }
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (recognizeInputRef.current) recognizeInputRef.current.value = '';
    if (images.length === 0) { message.warning('请选择图片文件'); return; }

    setRecognizing(true);
    let recognized = 0;
    let duplicated = 0;
    const newItems: MaterialColorCardItem[] = [];
    try {
      for (let i = 0; i < images.length; i++) {
        setRecognizeProgress(`AI 识别中 ${i + 1}/${images.length}…`);
        const url = await uploadCardImage(images[i]);
        const res: any = await api.post('/material/database/recognize-color-card', { imageUrl: url });
        const r = res?.data || res;
        if (!r?.success) continue;
        recognized++;
        const name = String(r.materialName?.textValue || '').trim();
        const color = String(r.color?.textValue || '').trim();
        if (name && currentItems.some((it) => it.materialName === name && (it.color || '') === color)) {
          duplicated++;
          continue;
        }
        const priceRaw = r.unitPrice?.numberValue != null
          ? Number(r.unitPrice.numberValue)
          : (r.unitPrice?.textValue ? Number(String(r.unitPrice.textValue).replace(/[^\d.]/g, '')) : NaN);
        const typeText = String(r.materialType?.textValue || '').toLowerCase();
        newItems.push({
          id: `ai-${Date.now()}-${i}`,
          materialName: name || `识别物料 ${i + 1}`,
          materialCode: '',
          color,
          materialType: typeText.includes('里') || typeText.includes('lining') ? 'lining'
            : typeText.includes('辅') || typeText.includes('accessory') ? 'accessory'
              : (currentItems[0]?.materialType || 'fabric'),
          unitPrice: Number.isFinite(priceRaw) ? priceRaw : undefined,
          fabricWidth: String(r.fabricWidth?.textValue || ''),
          fabricWeight: String(r.fabricWeight?.textValue || ''),
          fabricComposition: String(r.fabricComposition?.textValue || ''),
          specifications: String(r.specifications?.textValue || ''),
          unit: String(r.unit?.textValue || ''),
          image: url,
          remark: `AI识别${r.overallConfidence != null ? ` 置信度${r.overallConfidence}%` : ''}${r.aiHint ? `：${r.aiHint}` : ''}`,
        });
      }
      if (newItems.length > 0) {
        appendRecognizedItems(newItems);
        message.success(`识别完成：新增 ${newItems.length} 条${duplicated ? `，跳过重复 ${duplicated} 条` : ''}。核对后点「保存全部」`);
      } else {
        message.warning(recognized > 0 ? '识别到的物料与已有明细重复' : '未识别出有效物料信息');
      }
    } catch (e: any) {
      message.error(e?.message || '识别失败，请重试');
    } finally {
      setRecognizing(false);
      setRecognizeProgress('');
    }
  };

  return (
    <SideDrawer
      title={<Space><AppstoreAddOutlined /> {currentCardName} - 物料管理</Space>}
      open={open}
      onClose={onCancel}
      width={960}
      footer={[
        <Button key="close" onClick={onCancel}>关闭</Button>,
        <Button key="save" type="primary" onClick={onSave}>保存全部</Button>,
      ]}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={addEmptyCardItem}>+ 添加物料</Button>
        {/* D-446：拍照识别——多张色卡照片 AI 批量识别为明细行 */}
        <Button icon={<CameraOutlined />} loading={recognizing} onClick={() => recognizeInputRef.current?.click()}>
          拍照识别
        </Button>
        <input
          ref={recognizeInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { void handleRecognize(e.target.files); }}
        />
        {recognizeProgress && <span className="u-fs-13" style={{ color: 'var(--color-primary)' }}>{recognizeProgress}</span>}
        {/* D-444：批量单价处理 */}
        <Space.Compact>
          <InputNumber style={{ width: 130 }} min={0} precision={2} value={unifiedPrice} onChange={(v) => setUnifiedPrice(v)} placeholder="统一单价" />
          <Button onClick={handleApplyUnifiedPrice}>单价应用到全部</Button>
        </Space.Compact>
        <span style={{ color: 'var(--color-text-tertiary)' }}>共 {currentItems.length} 条</span>
      </Space>
      <div className="u-d-flex u-fd-column u-gap-8" style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
        {currentItems.length === 0 && (
          <div className="u-ta-center" style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>暂无物料，点击"添加物料"开始添加</div>
        )}
        {currentItems.map((item, idx) => {
          const swatch = colorNameToHex(item.color);
          return (
            <Card key={idx} size="small" style={{ border: '1px solid var(--color-border)' }}>
              <Row gutter={[8, 8]} align="middle">
                <Col xs={24} sm={1}>
                  <Tag color="blue">#{idx + 1}</Tag>
                </Col>
                <Col xs={24} sm={2}>
                  {/* D-444：无图颜色 → 按色名生成色块；有图显示图片 */}
                  {item.image ? (
                    <Image src={getFullAuthedFileUrl(item.image)} width={34} height={34} style={{ objectFit: 'cover', borderRadius: 6 }} preview />
                  ) : (
                    <div
                      title={item.color ? `${item.color}（无图片，按色名生成色块）` : ''}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 6,
                        background: swatch ?? 'var(--color-bg-subtle)',
                        border: '1px solid rgba(0,0,0,0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        color: '#ffffff',
                      }}
                    >
                      {(item.color || '无').slice(0, 1)}
                    </div>
                  )}
                </Col>
                <Col xs={24} sm={3}>
                  <Input placeholder="物料编号" value={item.materialCode || ''}
                    onChange={(e) => updateCardItem(idx, 'materialCode', e.target.value)} size="small" />
                </Col>
                <Col xs={24} sm={4}>
                  <Input placeholder="物料名称*" value={item.materialName || ''}
                    onChange={(e) => updateCardItem(idx, 'materialName', e.target.value)} size="small" />
                </Col>
                <Col xs={24} sm={3}>
                  <Input placeholder="颜色" value={item.color || ''}
                    onChange={(e) => updateCardItem(idx, 'color', e.target.value)} size="small" />
                </Col>
                <Col xs={24} sm={3}>
                  <InputNumber placeholder="单价" value={item.unitPrice}
                    onChange={(v) => updateCardItem(idx, 'unitPrice', v)}
                    min={0} step={0.01} style={{ width: '100%' }} size="small" />
                </Col>
                <Col xs={24} sm={3}>
                  <Select placeholder="物料类型" value={item.materialType || undefined}
                    onChange={(v) => updateCardItem(idx, 'materialType', v)} size="small" style={{ width: '100%' }}>
                    {MATERIAL_TYPE_OPTIONS.map((o) => (
                      <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                    ))}
                  </Select>
                </Col>
                <Col xs={24} sm={3}>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => handleUploadImage(idx)}>传图</Button>
                </Col>
                <Col xs={24} sm={2}>
                  <Popconfirm title="确定删除吗？" onConfirm={() => removeCardItem(idx)} okText="确定" cancelText="取消">
                    <Button type="link" danger size="small">删除</Button>
                  </Popconfirm>
                </Col>
              </Row>
            </Card>
          );
        })}
      </div>
    </SideDrawer>
  );
};

MaterialColorCardItemsModal.displayName = 'MaterialColorCardItemsModal';

export default MaterialColorCardItemsModal;
