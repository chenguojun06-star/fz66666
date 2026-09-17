import React, { useRef, useState } from 'react';
import { App, Button, Card, Checkbox, Col, Input, InputNumber, Popconfirm, Row, Select, Space, Tag, Tooltip } from 'antd';
import { AppstoreAddOutlined, DeleteOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import SideDrawer from '@/components/common/SideDrawer';
import MultiImageUploadBox from '@/components/common/MultiImageUploadBox';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import type { MaterialColorCardItem } from './types';
import { MATERIAL_TYPE_OPTIONS } from './types';

// ===== 物料色卡子物料管理：85% 大抽屉 + 统一上传组件 + 一键识别生成 + 勾选批量传图/删除 =====
interface MaterialColorCardItemsModalProps {
  open: boolean;
  currentCardName: string;
  currentItems: MaterialColorCardItem[];
  onCancel: () => void;
  onSave: () => void;
  addEmptyCardItem: () => void;
  updateCardItem: (idx: number, field: keyof MaterialColorCardItem, value: any) => void;
  removeCardItem: (idx: number) => void;
  uploadCardImage: (file: File) => Promise<string>;
  /** 整卡照片一键识别：多色号条目自动按命名规则生成并立即落库 */
  recognizeEntriesAndSave: (imageUrls: string[]) => Promise<{ added: number; duplicated: number; failed: number; visionError?: string }>;
  /** 批量动作后全量覆盖并立即自动保存，返回是否成功 */
  replaceItemsAndAutosave: (nextItems: MaterialColorCardItem[], successText?: string) => Promise<boolean>;
}

const MaterialColorCardItemsModal: React.FC<MaterialColorCardItemsModalProps> = ({
  open, currentCardName, currentItems,
  onCancel, onSave, addEmptyCardItem, updateCardItem, removeCardItem, uploadCardImage,
  recognizeEntriesAndSave, replaceItemsAndAutosave,
}) => {
  const { message } = App.useApp();
  const [unifiedPrice, setUnifiedPrice] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [cardPhotoUrls, setCardPhotoUrls] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const batchInputRef = useRef<HTMLInputElement | null>(null);

  // 行的稳定前端 key：服务端重拉后对象替换，选择集合自然失效（批量动作后会清空勾选）
  const cidMap = useRef<WeakMap<object, string>>(new WeakMap());
  const cidCounter = useRef(0);
  const cidOf = (it: MaterialColorCardItem): string => {
    let c = cidMap.current.get(it);
    if (!c) {
      c = `row-${++cidCounter.current}`;
      cidMap.current.set(it, c);
    }
    return c;
  };

  const selectedIdx = () =>
    currentItems
      .map((it, i) => (selected.has(cidOf(it)) ? i : -1))
      .filter((i) => i >= 0);

  // 统一单价：一个价应用到全部明细
  const handleApplyUnifiedPrice = () => {
    if (unifiedPrice == null || unifiedPrice <= 0) { message.warning('请先输入统一单价'); return; }
    if (currentItems.length === 0) { message.warning('暂无物料明细'); return; }
    currentItems.forEach((_, idx) => updateCardItem(idx, 'unitPrice', unifiedPrice));
    message.success(`已将单价 ${unifiedPrice} 元应用到全部 ${currentItems.length} 条明细`);
  };

  // 自动保存前拦截：未命名行会被批量覆盖丢弃，先让用户处理
  const guardBlankNames = (): boolean => {
    if (currentItems.some((it) => !it.materialName)) {
      message.warning('存在未填写物料名称的行，请先补全名称或逐行删除后再执行该操作');
      return false;
    }
    return true;
  };

  /** 一键识别生成：统一组件先上传色卡照片 → 后端 AI 识别多色号 → 自动命名（供应商-面料名-色号-颜色 / M-色号）→ 自动保存 */
  const handleOneClickGenerate = async () => {
    if (cardPhotoUrls.length === 0) { message.warning('请先添加色卡照片'); return; }
    if (!guardBlankNames()) return;
    setGenerating(true);
    try {
      const { added, duplicated, failed, visionError } = await recognizeEntriesAndSave(cardPhotoUrls);
      if (added > 0) {
        message.success(`一键生成完成：新增 ${added} 条${duplicated ? `，重复跳过 ${duplicated} 条` : ''}${failed ? `，${failed} 张照片识别失败` : ''}`);
        setCardPhotoUrls([]);
        setSelected(new Set());
      } else if (duplicated > 0) {
        message.warning('识别到的颜色均已存在，无需重复生成');
      } else if (failed > 0) {
        // D-454：失败多为模型没读出条目，不一定是图片模糊；给出可操作建议而非笼统说"不清晰"
        message.warning({
          content: visionError
            ? `识别未成功：${visionError}，请重试或分页拍摄`
            : '这张照片没识别出颜色条目，请正对色卡、避免反光与边缘裁切后重试；色块过多建议分页拍摄',
          duration: 6,
        } as any);
      } else {
        message.warning('未识别到颜色条目，请正对色卡、避免反光与边缘裁切后重试');
      }
    } catch (e: any) {
      message.error(e?.message || '一键生成失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  /** 批量传图：1 张 → 应用到全部勾选行；多张（数量=勾选行数）→ 按行顺序对应 */
  const handleBatchFiles = async (files: FileList | null) => {
    const fileArr = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
    if (batchInputRef.current) batchInputRef.current.value = '';
    if (fileArr.length === 0) return;
    const idxs = selectedIdx();
    if (idxs.length === 0) { message.warning('请先勾选要传图的明细行'); return; }
    if (!guardBlankNames()) return;
    if (fileArr.length !== 1 && fileArr.length !== idxs.length) {
      message.warning(`已勾选 ${idxs.length} 行：请上传 1 张（应用到全部）或恰好 ${idxs.length} 张（按顺序逐行对应）`);
      return;
    }
    setBatchBusy(true);
    try {
      const urls: string[] = [];
      for (const f of fileArr) urls.push(await uploadCardImage(f));
      const next = currentItems.map((it, i) => {
        const pos = idxs.indexOf(i);
        if (pos < 0) return it;
        return { ...it, image: urls.length === 1 ? urls[0] : urls[pos] };
      });
      const ok = await replaceItemsAndAutosave(next, `已为 ${idxs.length} 条明细应用图片并自动保存`);
      if (ok) setSelected(new Set());
    } catch (e: any) {
      message.error(e?.message || '批量传图失败');
    } finally {
      setBatchBusy(false);
    }
  };

  /** 批量删除勾选行并立即自动保存 */
  const handleBatchDelete = async () => {
    const idxSet = new Set(selectedIdx());
    if (idxSet.size === 0) { message.warning('请先勾选要删除的明细行'); return; }
    if (currentItems.some((it, i) => !it.materialName && !idxSet.has(i))) {
      message.warning('还存在未填写名称的行，请先逐行补全或删除后再批量删除');
      return;
    }
    const n = idxSet.size;
    try {
      const next = currentItems.filter((_, i) => !idxSet.has(i));
      const ok = await replaceItemsAndAutosave(next, `已删除 ${n} 条明细并自动保存`);
      if (ok) setSelected(new Set());
    } catch (e: any) {
      message.error(e?.message || '批量删除失败');
    }
  };

  const checkedCount = selectedIdx().length;
  const allChecked = currentItems.length > 0 && checkedCount === currentItems.length;
  const indeterminate = checkedCount > 0 && !allChecked;
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(currentItems.map((it) => cidOf(it))));
  };
  const toggleOne = (it: MaterialColorCardItem) => {
    const c = cidOf(it);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  return (
    <SideDrawer
      title={<Space><AppstoreAddOutlined /> {currentCardName} - 物料管理</Space>}
      open={open}
      onClose={onCancel}
      width="85%"
      footer={[
        <Button key="close" onClick={onCancel}>关闭</Button>,
        <Button key="save" type="primary" onClick={onSave}>保存全部</Button>,
      ]}
    >
      {/* ===== 顶部操作区：添加 / 统一上传色卡照片 + 一键生成 / 统一单价 ===== */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={addEmptyCardItem}>添加物料</Button>
          </Col>
          <Col flex="auto">
            <Space wrap align="center">
              <MultiImageUploadBox
                value={cardPhotoUrls}
                onChange={setCardPhotoUrls}
                maxCount={6}
                size={56}
                label="加照片"
                uploadFn={uploadCardImage}
              />
              <div>
                <Button
                  type="primary"
                  ghost
                  icon={<ThunderboltOutlined />}
                  loading={generating}
                  disabled={cardPhotoUrls.length === 0}
                  onClick={handleOneClickGenerate}
                >
                  一键识别生成{cardPhotoUrls.length > 0 ? `（${cardPhotoUrls.length} 张）` : ''}
                </Button>
                <div className="u-fs-12" style={{ color: 'var(--color-text-tertiary)', marginTop: 4, maxWidth: 360 }}>
                  自动按「供应商-面料名-色号-颜色」生成名称、按「M/L/F-色号」生成编号，生成后自动保存
                </div>
              </div>
            </Space>
          </Col>
          <Col>
            <Space.Compact>
              <InputNumber style={{ width: 120 }} min={0} precision={2} value={unifiedPrice} onChange={(v) => setUnifiedPrice(v)} placeholder="统一单价" />
              <Button onClick={handleApplyUnifiedPrice}>单价应用到全部</Button>
            </Space.Compact>
          </Col>
        </Row>
      </Card>

      {/* ===== 批量操作条（勾选行后出现） ===== */}
      {checkedCount > 0 && (
        <Card size="small" style={{ marginBottom: 12, background: 'var(--color-primary-bg, #e6f4ff)' }}>
          <Space wrap>
            <span>已选 <b>{checkedCount}</b> 条</span>
            <Button size="small" icon={<PlusOutlined />} loading={batchBusy} onClick={() => batchInputRef.current?.click()}>
              批量传图
            </Button>
            <Tooltip title="1 张图应用到全部勾选行；或上传与勾选行数相同的多张图，按顺序逐行对应">
              <span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>1 张全部 / 多张按序</span>
            </Tooltip>
            <Popconfirm title={`确定删除选中的 ${checkedCount} 条明细吗？删除后立即保存。`} onConfirm={handleBatchDelete} okText="确定" cancelText="取消">
              <Button size="small" danger icon={<DeleteOutlined />}>删除选中</Button>
            </Popconfirm>
            <Button size="small" type="text" onClick={() => setSelected(new Set())}>取消选择</Button>
            <input
              ref={batchInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { void handleBatchFiles(e.target.files); }}
            />
          </Space>
        </Card>
      )}

      <div style={{ marginBottom: 8, color: 'var(--color-text-tertiary)' }}>共 {currentItems.length} 条</div>

      {/* ===== 明细行 ===== */}
      <div className="u-d-flex u-fd-column u-gap-8" style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
        {currentItems.length === 0 && (
          <div className="u-ta-center" style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>
            暂无物料，先添加色卡照片点「一键识别生成」，或点「添加物料」手动录入
          </div>
        )}
        {currentItems.map((item, idx) => {
          const cid = cidOf(item);
          return (
            <Card key={cid} size="small" style={{ border: '1px solid var(--color-border)' }}>
              <Row gutter={[8, 8]} align="middle">
                <Col xs={12} sm={1} style={{ textAlign: 'center' }}>
                  <Checkbox checked={selected.has(cid)} onChange={() => toggleOne(item)} />
                </Col>
                <Col xs={12} sm={2}>
                  <ImageUploadBox
                    value={item.image}
                    onChange={(url) => updateCardItem(idx, 'image', url || '')}
                    size={42}
                    label=""
                    showClear={false}
                    uploadFn={uploadCardImage}
                  />
                </Col>
                <Col xs={12} sm={3}>
                  <Input placeholder="物料编号" value={item.materialCode || ''}
                    onChange={(e) => updateCardItem(idx, 'materialCode', e.target.value)} size="small" />
                </Col>
                <Col xs={12} sm={6}>
                  <Input placeholder="物料名称*（供应商-面料名-色号-颜色）" value={item.materialName || ''}
                    onChange={(e) => updateCardItem(idx, 'materialName', e.target.value)} size="small" />
                </Col>
                <Col xs={12} sm={3}>
                  <Input placeholder="颜色" value={item.color || ''}
                    onChange={(e) => updateCardItem(idx, 'color', e.target.value)} size="small" />
                </Col>
                <Col xs={12} sm={3}>
                  <InputNumber placeholder="单价" value={item.unitPrice}
                    onChange={(v) => updateCardItem(idx, 'unitPrice', v)}
                    min={0} step={0.01} style={{ width: '100%' }} size="small" />
                </Col>
                <Col xs={12} sm={3}>
                  <Select placeholder="物料类型" value={item.materialType || undefined}
                    onChange={(v) => updateCardItem(idx, 'materialType', v)} size="small" style={{ width: '100%' }}>
                    {MATERIAL_TYPE_OPTIONS.map((o) => (
                      <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                    ))}
                  </Select>
                </Col>
                <Col xs={12} sm={3} style={{ textAlign: 'center' }}>
                  <Tag color="blue" style={{ marginRight: 4 }}>#{idx + 1}</Tag>
                  <Popconfirm title="确定删除该行吗？（保存全部后生效）" onConfirm={() => removeCardItem(idx)} okText="确定" cancelText="取消">
                    <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                </Col>
              </Row>
            </Card>
          );
        })}
      </div>

      {/* 全选放在列表底部，批量场景操作更顺手 */}
      {currentItems.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <Checkbox indeterminate={indeterminate} checked={allChecked} onChange={toggleAll}>
            全选（{currentItems.length} 条）
          </Checkbox>
        </div>
      )}
    </SideDrawer>
  );
};

MaterialColorCardItemsModal.displayName = 'MaterialColorCardItemsModal';

export default MaterialColorCardItemsModal;
