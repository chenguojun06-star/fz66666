import React from 'react';
import { Card, Input, Button, Space, Radio, Spin, Row, Col, Tooltip } from 'antd';
import { SearchOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useLabelPrintData } from './hooks/useLabelPrintData';
import PrintSettingsPanel from './components/PrintSettingsPanel';
import OrderDetailCard from './components/OrderDetailCard';
import SaveTemplateModal from './components/SaveTemplateModal';

const LabelPrint: React.FC = () => {
  const {
    keyword, setKeyword,
    loading,
    orders,
    selectedOrder, setSelectedOrder,
    selectedColor, setSelectedColor,
    selectedSize, setSelectedSize,
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
      <Row gutter={16}>
        <Col span={6}>
          <Card title="打印种类" size="small" style={{ marginBottom: 12 }}>
            <Radio.Group value={printType} onChange={e => setPrintType(e.target.value)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Radio value="hangtag">吊牌 <Tooltip title="产品合格证吊牌，含品牌名/款号/颜色尺码/成分/质量等级/执行标准/安全类别/检验员"><QuestionCircleOutlined style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }} /></Tooltip></Radio>
              <Radio value="barcode">条码 <Tooltip title="贴在包装上的小标签，含二维码和SKU编码"><QuestionCircleOutlined style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }} /></Tooltip></Radio>
              <Radio value="washlabel">洗水唛 <Tooltip title="缝在衣服内侧的标签，含面料成分和洗护说明"><QuestionCircleOutlined style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }} /></Tooltip></Radio>
            </Radio.Group>
          </Card>

          {selectedOrder && (
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
              wash={wash}
              setWash={setWash}
              resetSettings={resetSettings}
            />
          )}
        </Col>

        <Col span={18}>
          <Card size="small" style={{ marginBottom: 12 }}>
            <Space wrap>
              <Input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="输入订单号或款号搜索" style={{ width: 220 }} onPressEnter={() => void handleSearch()} prefix={<SearchOutlined />} />
              <Button type="primary" icon={<SearchOutlined />} onClick={() => void handleSearch()} loading={loading}>搜索</Button>
              <Button onClick={handleClear}>清空</Button>
            </Space>
          </Card>

          <Spin spinning={loading}>
            {selectedOrder ? (
              <OrderDetailCard
                selectedOrder={selectedOrder}
                selectedColor={selectedColor}
                setSelectedColor={setSelectedColor}
                selectedSize={selectedSize}
                setSelectedSize={setSelectedSize}
                coverBase64={coverBase64}
                previewHtml={previewHtml}
                ptLabel={ptLabel}
                setSelectedOrder={setSelectedOrder}
                onSaveStyleInfo={handleSaveStyleInfo}
              />
            ) : orders.length > 0 ? (
              <Card>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>搜索到 {orders.length} 个订单，请选择</div>
                <Space orientation="vertical" style={{ width: '100%' }}>
                  {orders.map(o => (
                    <Card key={o.orderId} size="small" hoverable style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedOrder(o);
                        setSelectedColor(o.colors[0] || '');
                        setSelectedSize(o.sizes[0] || '');
                      }}>
                      <div style={{ fontWeight: 600 }}>{o.styleName || o.styleNo}</div>
                      <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>订单号: {o.orderNo} | {o.colors.join('/')} | {o.sizes.join('/')}</div>
                    </Card>
                  ))}
                </Space>
              </Card>
            ) : (
              <Card style={{ textAlign: 'center', padding: 60 }}>
                <div style={{ color: 'var(--color-text-quaternary)', fontSize: 14 }}>请输入订单号或款号搜索</div>
              </Card>
            )}
          </Spin>
        </Col>
      </Row>

      <SaveTemplateModal
        open={saveTemplateOpen}
        value={saveTemplateName}
        onChange={setSaveTemplateName}
        onOk={handleSaveTemplate}
        onCancel={() => { setSaveTemplateOpen(false); setSaveTemplateName(''); }}
      />
    </div>
  );
};

export default LabelPrint;
