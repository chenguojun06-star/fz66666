import React from 'react';
import { Card, Input, Button, Space, Radio, Spin, Row, Col } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useLabelPrintData } from './hooks/useLabelPrintData';
import PrintSettingsPanel from './components/PrintSettingsPanel';
import OrderDetailCard from './components/OrderDetailCard';
import HangtagCertPanel from './components/HangtagCertPanel';
import WashLabelPanel from './components/WashLabelPanel';
import SaveTemplateModal from './components/SaveTemplateModal';

/** D-230：打印种类说明——放在选择区下方，让用户一眼知道每种是什么 */
const PRINT_TYPE_HINT: Record<string, string> = {
  hangtag: '产品合格证吊牌：品名/款号/颜色尺码/成分/执行标准/安全类别/检验证明，底部带可扫码条码。按「颜色 × 尺码」逐行设置打印张数。',
  barcode: '贴在包装上的小标签：条码/二维码 + 商品编码，支持一次勾选多个尺码批量出标。',
  washlabel: '缝在衣服内侧的标签：面料成分 + 洗护说明图标。',
};

const LabelPrint: React.FC = () => {
  const {
    keyword, setKeyword,
    loading,
    orders,
    selectedOrder, setSelectedOrder,
    selectedColor, setSelectedColor,
    selectedSize, setSelectedSize,
    selectedSizes, setSelectedSizes,
    printType, setPrintType,
    printCount, setPrintCount,
    printing,
    previewHtml,
    templates,
    saveTemplateOpen, setSaveTemplateOpen,
    saveTemplateName, setSaveTemplateName,
    coverBase64,
    hang, setHang,
    bar, setBar,
    wash, setWash,
    hangCert, setHangCert,
    certW, setCertW,
    certH, setCertH,
    hangSkuRows, setHangSkuRows,
    washSkuRows, setWashSkuRows,
    resetSettings,
    handleSaveTemplate,
    handleLoadTemplate,
    handleDeleteTemplate,
    handleSetDefaultTemplate,
    handleSearch,
    handlePrint,
    handleSaveStyleInfo,
    handleClear,
    ptLabel,
  } = useLabelPrintData();

  return (
    <div style={{ padding: 16 }}>
      {/* 1) 搜索区（全宽置顶——原实现把搜索塞在右侧栏下方，用户不容易找到） */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="输入订单号或款号搜索"
            style={{ width: 240 }}
            onPressEnter={() => void handleSearch()}
            prefix={<SearchOutlined />}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => void handleSearch()} loading={loading}>
            搜索
          </Button>
          <Button onClick={handleClear}>清空</Button>
        </Space>
      </Card>

      {/* 2) 打印种类：横向按钮组置顶（原来是左侧 1/4 栏里三个小单选，很不显眼） */}
      <Card size="small" title="打印种类" style={{ marginBottom: 12 }}>
        <Radio.Group
          value={printType}
          onChange={(e) => setPrintType(e.target.value)}
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="hangtag">吊牌（合格证）</Radio.Button>
          <Radio.Button value="barcode">条码</Radio.Button>
          <Radio.Button value="washlabel">洗水唛</Radio.Button>
        </Radio.Group>
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          {PRINT_TYPE_HINT[printType]}
        </div>
      </Card>

      <Spin spinning={loading}>
        {!selectedOrder ? (
          orders.length > 0 ? (
            <Card>
              <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
                搜索到 {orders.length} 个订单，请选择
              </div>
              <Space orientation="vertical" style={{ width: '100%' }}>
                {orders.map((o) => (
                  <Card
                    key={o.orderId}
                    size="small"
                    hoverable
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedOrder(o);
                      setSelectedColor(o.colors[0] || '');
                      setSelectedSize(o.sizes[0] || '');
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{o.styleName || o.styleNo}</div>
                    <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
                      订单号: {o.orderNo} | {o.colors.join('/')} | {o.sizes.join('/')}
                    </div>
                  </Card>
                ))}
              </Space>
            </Card>
          ) : (
            <Card style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ color: 'var(--color-text-quaternary)', fontSize: 14 }}>
                请输入订单号或款号搜索
              </div>
            </Card>
          )
        ) : printType === 'hangtag' ? (
          /* 3a) 吊牌：合格证版式（配置 + 预览 + 颜色尺码打印明细） */
          <HangtagCertPanel
            selectedOrder={selectedOrder}
            hangCert={hangCert}
            setHangCert={setHangCert}
            certW={certW}
            setCertW={setCertW}
            certH={certH}
            setCertH={setCertH}
            hangSkuRows={hangSkuRows}
            setHangSkuRows={setHangSkuRows}
            previewHtml={previewHtml}
            printing={printing}
            onPrint={() => void handlePrint()}
          />
        ) : printType === 'washlabel' ? (
          /* 3b) D-232：洗水唛改用订单管理同款布局（分区配置 + 实时预览 + 按颜色尺码出标） */
          <WashLabelPanel
            selectedOrder={selectedOrder}
            wash={wash}
            setWash={setWash}
            washSkuRows={washSkuRows}
            setWashSkuRows={setWashSkuRows}
            printing={printing}
            onPrint={() => void handlePrint()}
            onOpenSaveTemplate={() => setSaveTemplateOpen(true)}
            templates={templates}
            onSetDefaultTemplate={handleSetDefaultTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onLoadTemplate={handleLoadTemplate}
            onResetSettings={resetSettings}
          />
        ) : (
          /* 3c) 条码：左侧设置 + 右侧预览 */
          <Row gutter={16}>
            <Col span={7}>
              <PrintSettingsPanel
                selectedOrder={selectedOrder}
                printType={printType}
                printCount={printCount}
                setPrintCount={setPrintCount}
                printing={printing}
                ptLabel={ptLabel}
                onPrint={handlePrint}
                onOpenSaveTemplate={() => setSaveTemplateOpen(true)}
                templates={templates}
                onSetDefaultTemplate={handleSetDefaultTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                onLoadTemplate={handleLoadTemplate}
                hang={hang}
                setHang={setHang}
                bar={bar}
                setBar={setBar}
                resetSettings={resetSettings}
              />
            </Col>
            <Col span={17}>
              <OrderDetailCard
                selectedOrder={selectedOrder}
                selectedColor={selectedColor}
                setSelectedColor={setSelectedColor}
                selectedSize={selectedSize}
                setSelectedSize={setSelectedSize}
                printType={printType}
                selectedSizes={selectedSizes}
                setSelectedSizes={setSelectedSizes}
                coverBase64={coverBase64}
                previewHtml={previewHtml}
                ptLabel={ptLabel}
                setSelectedOrder={setSelectedOrder}
                onSaveStyleInfo={handleSaveStyleInfo}
                washManufacturingText={wash.manufacturingText}
                washDateText={wash.dateText}
              />
            </Col>
          </Row>
        )}
      </Spin>

      <SaveTemplateModal
        open={saveTemplateOpen}
        value={saveTemplateName}
        onChange={setSaveTemplateName}
        onOk={handleSaveTemplate}
        onCancel={() => {
          setSaveTemplateOpen(false);
          setSaveTemplateName('');
        }}
      />
    </div>
  );
};

export default LabelPrint;
