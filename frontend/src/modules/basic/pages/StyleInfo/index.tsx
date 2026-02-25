import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { App, Card, Checkbox, Form, Input, Modal, Select, Tabs } from 'antd';
import Layout from '@/components/Layout';
import api from '@/utils/api';
import { useStyleDetail } from './hooks/useStyleDetail';
import { useStyleFormActions } from './hooks/useStyleFormActions';
import StyleBasicInfoForm from './components/StyleBasicInfoForm';
import StyleActionButtons from './components/StyleActionButtons';

// Tab组件导入
import StyleBomTab from './components/StyleBomTab';
import StyleQuotationTab from './components/StyleQuotationTab';
import StyleAttachmentTab from './components/StyleAttachmentTab';
import StylePatternTab from './components/StylePatternTab';
import StyleSizeTab from './components/StyleSizeTab';
import StyleProcessTab from './components/StyleProcessTab';
import StyleProductionTab from './components/StyleProductionTab';
import StyleSecondaryProcessTab from './components/StyleSecondaryProcessTab';
import StyleSizePriceTab from './components/StyleSizePriceTab';

import './styles.css';

const StyleInfoDetailPage: React.FC = () => {
  const params = useParams();
  const location = window.location;
  const isNewPath = location.pathname.endsWith('/new');
  const styleIdParam = isNewPath ? 'new' : (params.id as string | undefined);
  const { message } = App.useApp();

  // ===== 1. 核心Hooks（数据+操作） =====
  const {
    loading: _loading,
    currentStyle,
    setCurrentStyle,
    form,
    activeTabKey,
    setActiveTabKey,
    editLocked,
    setEditLocked,
    categoryOptions,
    seasonOptions,
    isNewPage,
    isDetailPage,
    fetchDetail,
    resetForm: _resetForm,
  } = useStyleDetail(styleIdParam);

  const [commonColors, setCommonColors] = useState<string[]>(['黑色', '白色', '灰色', '蓝色', '红色']);
  const [commonSizes, setCommonSizes] = useState<string[]>(['XS', 'S', 'M', 'L', 'XL', 'XXL']);

  const [size1, setSize1] = useState('');
  const [size2, setSize2] = useState('');
  const [size3, setSize3] = useState('');
  const [size4, setSize4] = useState('');
  const [size5, setSize5] = useState('');

  const [color1, setColor1] = useState('');
  const [color2, setColor2] = useState('');
  const [color3, setColor3] = useState('');
  const [color4, setColor4] = useState('');
  const [color5, setColor5] = useState('');

  const [qty1, setQty1] = useState(0);
  const [qty2, setQty2] = useState(0);
  const [qty3, setQty3] = useState(0);
  const [qty4, setQty4] = useState(0);
  const [qty5, setQty5] = useState(0);

  // 待上传图片
  const [pendingImages, setPendingImages] = useState<File[]>([]);

  // ===== 3. 从currentStyle恢复颜色码数数据 =====
  useEffect(() => {
    if (!currentStyle) return;

    // 优先从sizeColorConfig JSON解析（新版格式）
    if ((currentStyle as any).sizeColorConfig) {
      try {
        const config = JSON.parse((currentStyle as any).sizeColorConfig);
        if (config.sizes) {
          setSize1(config.sizes[0] || '');
          setSize2(config.sizes[1] || '');
          setSize3(config.sizes[2] || '');
          setSize4(config.sizes[3] || '');
          setSize5(config.sizes[4] || '');
        }
        if (config.colors) {
          setColor1(config.colors[0] || '');
          setColor2(config.colors[1] || '');
          setColor3(config.colors[2] || '');
          setColor4(config.colors[3] || '');
          setColor5(config.colors[4] || '');
        }
        if (config.quantities) {
          setQty1(config.quantities[0] || 0);
          setQty2(config.quantities[1] || 0);
          setQty3(config.quantities[2] || 0);
          setQty4(config.quantities[3] || 0);
          setQty5(config.quantities[4] || 0);
        }
        if (config.commonSizes) {
          setCommonSizes(config.commonSizes);
        }
        if (config.commonColors) {
          setCommonColors(config.commonColors);
        }
        return;
      } catch (e) {
        console.error('解析sizeColorConfig失败:', e);
      }
    }

    const legacy = currentStyle as any;
    setSize1(legacy.size1 || '');
    setSize2(legacy.size2 || '');
    setSize3(legacy.size3 || '');
    setSize4(legacy.size4 || '');
    setSize5(legacy.size5 || '');

    setColor1(legacy.color1 || '');
    setColor2(legacy.color2 || '');
    setColor3(legacy.color3 || '');
    setColor4(legacy.color4 || '');
    setColor5(legacy.color5 || '');

    setQty1(legacy.qty1 || 0);
    setQty2(legacy.qty2 || 0);
    setQty3(legacy.qty3 || 0);
    setQty4(legacy.qty4 || 0);
    setQty5(legacy.qty5 || 0);
  }, [currentStyle]);

  // sizeColorConfig对象
  const sizeColorConfig = {
    sizes: [size1, size2, size3, size4, size5] as [string, string, string, string, string],
    colors: [color1, color2, color3, color4, color5] as [string, string, string, string, string],
    quantities: [qty1, qty2, qty3, qty4, qty5] as [number, number, number, number, number],
    commonSizes,
    commonColors,
  };

  // ===== 3. 表单操作Hook =====
  const {
    saving,
    completingSample,
    pushingToOrder,
    handleSave,
    handleCompleteSample,
    handlePushToOrder: handlePushToOrderDirect,
    handleUnlock,
    handleBackToList: _handleBackToList,
  } = useStyleFormActions({
    form,
    currentStyle,
    setCurrentStyle,
    fetchDetail,
    setEditLocked,
    isNewPage,
    sizeColorConfig,
    pendingImages,
  });

  // ===== 4. Tab相关状态（工序、生产制单） =====
  const [_processModalVisible, _setProcessModalVisible] = useState(false);
  const [pushToOrderModalVisible, setPushToOrderModalVisible] = useState(false);
  const [processData, _setProcessData] = useState<any[]>([]);
  const [pushToOrderForm] = Form.useForm();
  const [pushToOrderSaving, setPushToOrderSaving] = useState(false);
  const [pushToOrderTargets, setPushToOrderTargets] = useState<string[]>([
    'pattern',
    'size',
    'process',
    'production',
    'secondary',
    'sizePrice',
  ]);

  // 生产制单相关状态
  const productionReqRowCount = 15;
  const [productionReqRows, setProductionReqRows] = useState<string[]>(() =>
    Array.from({ length: productionReqRowCount }).map(() => '')
  );
  const [productionSaving, setProductionSaving] = useState(false);
  const [productionRollbackSaving, setProductionRollbackSaving] = useState(false);
  const _productionReqLocked = false;
  const productionReqEditable = true;

  // ===== 5. 辅助函数 =====
  const isFieldLocked = (_fieldValue: any) => {
    return editLocked && Boolean(currentStyle?.id);
  };

  // 生产制单辅助函数
  const updateProductionReqRow = (index: number, value: string) => {
    setProductionReqRows((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const parseProductionReqRows = (value: unknown) => {
    const raw = String(value ?? '');
    const lines = raw
      .split(/\r?\n/)
      .map((l) => String(l || '').replace(/^\s*\d+\s*[.、)）-]?\s*/, '').trim());
    const out = Array.from({ length: productionReqRowCount }).map(() => '');
    for (let i = 0; i < Math.min(productionReqRowCount, lines.length); i += 1) {
      out[i] = lines[i] || '';
    }
    return out;
  };

  const _serializeProductionReqRows = (rows: string[]) => {
    const list = (Array.isArray(rows) ? rows : [])
      .slice(0, productionReqRowCount)
      .map((x) => String(x ?? '').replace(/\r/g, '').trim());
    while (list.length && !String(list[list.length - 1] || '').trim()) list.pop();
    return list.join('\n');
  };

  const handleSaveProduction = async () => {
    if (!currentStyle?.id) {
      message.warning('请先保存款式基本信息');
      return;
    }
    setProductionSaving(true);
    try {
      const content = _serializeProductionReqRows(productionReqRows);
      await api.put(`/style/info/${currentStyle.id}/production-requirements`, {
        description: content,
        productionRequirements: content,
      });
      message.success('生产制单保存成功');
      // 刷新详情
      fetchDetail(String(currentStyle.id));
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '保存失败');
    } finally {
      setProductionSaving(false);
    }
  };

  const resetProductionReqFromCurrent = () => {
    const src = (currentStyle as any)?.productionRequirements || (currentStyle as any)?.description;
    if (src) {
      setProductionReqRows(parseProductionReqRows(src));
    }
  };

  useEffect(() => {
    if (!currentStyle) return;
    const src = (currentStyle as any)?.productionRequirements || (currentStyle as any)?.description;
    if (src) {
      setProductionReqRows(parseProductionReqRows(src));
    } else {
      setProductionReqRows(Array.from({ length: productionReqRowCount }).map(() => ''));
    }
  }, [currentStyle, productionReqRowCount]);

  const handleRollbackProductionReq = async () => {
    if (!currentStyle?.id) {
      message.warning('请先保存款式基本信息');
      return;
    }
    setProductionRollbackSaving(true);
    try {
      await api.post(`/style/info/${currentStyle.id}/production-requirements/rollback`);
      message.success('已回退到上一版本');
      // 刷新详情
      fetchDetail(String(currentStyle.id));
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '回退失败');
    } finally {
      setProductionRollbackSaving(false);
    }
  };

  // 推送到订单弹窗确认
  const handlePushToOrder = () => {
    setPushToOrderModalVisible(true);
  };

  // 提交推送到订单
  const submitPushToOrder = async () => {
    try {
      const values = await pushToOrderForm.validateFields();
      setPushToOrderSaving(true);

      await handlePushToOrderDirect(values.priceType, values.remark, pushToOrderTargets);

      setPushToOrderModalVisible(false);
      pushToOrderForm.resetFields();
    } catch (error) {
      console.error('推送失败:', error);
    } finally {
      setPushToOrderSaving(false);
    }
  };

  // ===== 6. 渲染 =====
  if (!isDetailPage && !isNewPage) {
    return null; // 列表页已移至 StyleInfoList
  }

  return (
    <Layout>
      <Card className="page-card">
        {/* ===== 基础信息卡片 ===== */}
        <Card
          title="样衣详情"
          style={{ marginBottom: 24 }}
          extra={
            <StyleActionButtons
              saving={saving}
              completingSample={completingSample}
              pushingToOrder={pushingToOrder}
              editLocked={editLocked}
              isNewPage={isNewPage}
              sampleCompleted={currentStyle?.sampleStatus === 'COMPLETED'}
              hasProcessData={processData?.length > 0 || Boolean((currentStyle as any)?.processCompletedTime)}
              pushedToOrder={Boolean((currentStyle as any)?.orderType)}
              onSave={handleSave}
              onCompleteSample={handleCompleteSample}
              onPushToOrder={handlePushToOrder}
              onUnlock={handleUnlock}
            />
          }
        >
          <Form layout="horizontal" form={form} labelCol={{ span: 8 }} wrapperCol={{ span: 16 }}>
            {/* 基础信息表单（包含颜色码数配置） */}
            <StyleBasicInfoForm
              _form={form}
              currentStyle={currentStyle}
              editLocked={editLocked}
              isNewPage={isNewPage}
              categoryOptions={categoryOptions}
              seasonOptions={seasonOptions}
              isFieldLocked={isFieldLocked}
              pendingImages={pendingImages}
              onPendingImagesChange={setPendingImages}
              size1={size1}
              setSize1={setSize1}
              size2={size2}
              setSize2={setSize2}
              size3={size3}
              setSize3={setSize3}
              size4={size4}
              setSize4={setSize4}
              size5={size5}
              setSize5={setSize5}
              color1={color1}
              setColor1={setColor1}
              color2={color2}
              setColor2={setColor2}
              color3={color3}
              setColor3={setColor3}
              color4={color4}
              setColor4={setColor4}
              color5={color5}
              setColor5={setColor5}
              qty1={qty1}
              setQty1={setQty1}
              qty2={qty2}
              setQty2={setQty2}
              qty3={qty3}
              setQty3={setQty3}
              qty4={qty4}
              setQty4={setQty4}
              qty5={qty5}
              setQty5={setQty5}
              commonSizes={commonSizes}
              setCommonSizes={setCommonSizes}
              commonColors={commonColors}
              setCommonColors={setCommonColors}
            />
          </Form>
        </Card>

        {/* ===== Tabs区域（12个Tab组件保持不变） ===== */}
        <Card style={{ marginTop: 24 }}>
          <Tabs
            activeKey={activeTabKey}
            onChange={setActiveTabKey}
            items={[
              {
                key: '2',
                label: 'BOM清单',
                disabled: !currentStyle?.id, // 需要先保存款式
                children: (
                  <StyleBomTab
                    styleId={currentStyle?.id}
                    readOnly={Boolean((currentStyle as any)?.bomCompletedTime)}
                    bomAssignee={(currentStyle as any)?.bomAssignee}
                    bomStartTime={(currentStyle as any)?.bomStartTime}
                    bomCompletedTime={(currentStyle as any)?.bomCompletedTime}
                    onRefresh={() => { void fetchDetail(styleIdParam!); }}
                  />
                )
              },
              {
                key: '5',
                label: '纸样开发',
                disabled: !currentStyle?.id,
                children: (
                  <StylePatternTab
                    styleId={currentStyle?.id}
                    readOnly={Boolean((currentStyle as any)?.patternCompletedTime)}
                    patternAssignee={(currentStyle as any)?.patternAssignee}
                    patternStartTime={(currentStyle as any)?.patternStartTime}
                    patternCompletedTime={(currentStyle as any)?.patternCompletedTime}
                    patternStatus={currentStyle?.patternStatus}
                    onRefresh={() => { void fetchDetail(styleIdParam!); }}
                  />
                )
              },
              {
                key: '6',
                label: '尺寸表',
                disabled: !currentStyle?.id,
                children: (
                  <StyleSizeTab
                    styleId={currentStyle?.id}
                    readOnly={Boolean((currentStyle as any)?.sizeCompletedTime)}
                    sizeAssignee={(currentStyle as any)?.sizeAssignee}
                    sizeStartTime={(currentStyle as any)?.sizeStartTime}
                    sizeCompletedTime={(currentStyle as any)?.sizeCompletedTime}
                    onRefresh={() => { void fetchDetail(styleIdParam!); }}
                  />
                )
              },
              {
                key: '7',
                label: '工序单价',
                disabled: !currentStyle?.id,
                children: (
                  <StyleProcessTab
                    styleId={currentStyle?.id}
                    readOnly={Boolean((currentStyle as any)?.processCompletedTime)}
                    processAssignee={(currentStyle as any)?.processAssignee}
                    processStartTime={(currentStyle as any)?.processStartTime}
                    processCompletedTime={(currentStyle as any)?.processCompletedTime}
                    onRefresh={() => { void fetchDetail(styleIdParam!); }}
                  />
                )
              },
              {
                key: '8',
                label: '生产制单',
                disabled: !currentStyle?.id,
                children: (
                  <StyleProductionTab
                    styleId={currentStyle?.id}
                    styleNo={currentStyle?.styleNo}
                    productionReqRows={productionReqRows}
                    productionReqRowCount={productionReqRowCount}
                    productionReqLocked={Boolean((currentStyle as any)?.productionCompletedTime)}
                    productionReqEditable={productionReqEditable}
                    productionReqSaving={productionSaving}
                    productionReqRollbackSaving={productionRollbackSaving}
                    onProductionReqChange={updateProductionReqRow}
                    onProductionReqSave={handleSaveProduction}
                    onProductionReqReset={resetProductionReqFromCurrent}
                    onProductionReqRollback={handleRollbackProductionReq}
                    productionReqCanRollback
                    productionAssignee={(currentStyle as any)?.productionAssignee}
                    productionStartTime={(currentStyle as any)?.productionStartTime}
                    productionCompletedTime={(currentStyle as any)?.productionCompletedTime}
                    onRefresh={() => { void fetchDetail(styleIdParam!); }}
                  />
                )
              },
              {
                key: '9',
                label: '二次工艺',
                disabled: !currentStyle?.id,
                children: (
                  <StyleSecondaryProcessTab
                    styleId={currentStyle?.id}
                    styleNo={currentStyle?.styleNo}
                    readOnly={Boolean((currentStyle as any)?.secondaryCompletedTime)}
                    secondaryAssignee={(currentStyle as any)?.secondaryAssignee}
                    secondaryStartTime={(currentStyle as any)?.secondaryStartTime}
                    secondaryCompletedTime={(currentStyle as any)?.secondaryCompletedTime}
                    sampleQuantity={(currentStyle as any)?.sampleQuantity}
                    onRefresh={() => { void fetchDetail(styleIdParam!); }}
                  />
                )
              },
              {
                key: '10',
                label: '码数单价',
                disabled: !currentStyle?.id,
                children: <StyleSizePriceTab
                  styleId={currentStyle?.id}
                  readOnly={Boolean((currentStyle as any)?.sizePriceCompletedTime)}
                  sizePriceAssignee={(currentStyle as any)?.sizePriceAssignee}
                  sizePriceStartTime={(currentStyle as any)?.sizePriceStartTime}
                  sizePriceCompletedTime={(currentStyle as any)?.sizePriceCompletedTime}
                  onRefresh={() => { void fetchDetail(styleIdParam!); }}
                />
              },
              {
                key: '3',
                label: '报价单',
                disabled: !currentStyle?.id,
                children: <StyleQuotationTab styleId={currentStyle?.id} totalQty={qty1 + qty2 + qty3 + qty4 + qty5} />
              },
              {
                key: '4',
                label: '附件文件',
                disabled: !currentStyle?.id,
                children: <StyleAttachmentTab styleId={currentStyle?.id} />
              }
            ]}
          />
        </Card>
      </Card>

      {/* ===== 推送到订单弹窗 ===== */}
      <Modal
        title="推送到下单管理"
        open={pushToOrderModalVisible}
        onOk={submitPushToOrder}
        onCancel={() => {
          setPushToOrderModalVisible(false);
          pushToOrderForm.resetFields();
        }}
        confirmLoading={pushToOrderSaving}
        width={500}
        forceRender
      >
        <Form form={pushToOrderForm} layout="vertical">
          <Form.Item label="同步目标（勾选才会过去）">
            <Checkbox.Group
              value={pushToOrderTargets}
              onChange={(values) => setPushToOrderTargets(values.map((v) => String(v)))}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                <Checkbox value="pattern">纸样开发</Checkbox>
                <Checkbox value="size">尺寸表</Checkbox>
                <Checkbox value="process">工序单价</Checkbox>
                <Checkbox value="production">生产制单</Checkbox>
                <Checkbox value="secondary">二次工艺</Checkbox>
                <Checkbox value="sizePrice">码数单价</Checkbox>
              </div>
            </Checkbox.Group>
          </Form.Item>
          <Form.Item
            label="单价类型"
            name="priceType"
            rules={[{ required: true, message: '请选择单价类型' }]}
            initialValue="process"
          >
            <Select>
              <Select.Option value="process">工序单价</Select.Option>
              <Select.Option value="sizePrice">码数单价</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={3} placeholder="选填：推送备注" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
};

export default StyleInfoDetailPage;
