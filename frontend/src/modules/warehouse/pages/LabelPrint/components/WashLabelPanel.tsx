import React from 'react';
import { Card, InputNumber, Table, Tag, Space, Button, Dropdown, Popconfirm } from 'antd';
import { PrinterOutlined, SaveOutlined, BookOutlined, DeleteOutlined, StarOutlined, StarFilled } from '@ant-design/icons';
import { StyleCoverThumb } from '@/components/StyleAssets';
import WashLabelSectionConfigPanel from '@/components/common/WashLabelSectionConfigPanel';
import type { HangtagSkuRow } from '../hangtagCert';
import type { WashSettings } from '../constants';
import type { OrderInfo } from '../types';

interface Props {
  selectedOrder: OrderInfo | null;
  wash: WashSettings;
  setWash: React.Dispatch<React.SetStateAction<WashSettings>>;
  washSkuRows: HangtagSkuRow[];
  setWashSkuRows: (v: HangtagSkuRow[]) => void;
  printing: boolean;
  onPrint: () => void;
  /** 模板：与吊牌 / 条码共用同一套保存、加载、设默认、删除 */
  onOpenSaveTemplate: () => void;
  templates: any[];
  onSetDefaultTemplate: (id: number) => void;
  onDeleteTemplate: (id: number) => void;
  onLoadTemplate: (tpl: any) => void;
  onResetSettings: () => void;
}

/**
 * D-232：仓库「标签打印 → 洗水唛」改用订单管理同款布局。
 *
 * 改造前：左侧一堆零散输入框（距剪口偏移/字体/行距/成份-洗涤间隔/码数/款号/制造区域/日期
 * + 7 个显隐开关），右侧是订单卡片（还混着一个「吊牌信息编辑」），
 * 用户既不知道每个框对应打印出来哪一块，改了设置预览也常常不刷新。
 *
 * 改造后（与订单管理 LabelPrintModal/WashLabelTab 一致）：
 *   上：款式信息条（一眼知道在打哪个款）
 *   中：纸张宽高 + 分区配置面板（左配置 / 右实时预览，改一处立刻看到）
 *   下：颜色 × 尺码 打印明细，逐行设置张数后批量出标
 */
const WashLabelPanel: React.FC<Props> = ({
  selectedOrder,
  wash,
  setWash,
  washSkuRows,
  setWashSkuRows,
  printing,
  onPrint,
  onOpenSaveTemplate,
  templates,
  onSetDefaultTemplate,
  onDeleteTemplate,
  onLoadTemplate,
  onResetSettings,
}) => {
  const updatePrintCount = (key: string, val: number | null) => {
    setWashSkuRows(
      washSkuRows.map((r) => (r.key === key ? { ...r, printCount: Math.max(0, val ?? 0) } : r))
    );
  };

  const totalSheets = washSkuRows.reduce((s, r) => s + r.printCount, 0);
  /** 预览取第一个有张数的行的码数；都未设置时回落到面板里手填的码数 */
  const sampleRow = washSkuRows.find((r) => r.printCount > 0);
  const previewSizeText = sampleRow?.size || wash.sizeText || '';

  return (
    <>
      {/* 款式信息条：让用户知道当前在打印哪个款 */}
      {selectedOrder && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <StyleCoverThumb
              src={selectedOrder.cover || null}
              styleNo={selectedOrder.styleNo}
              color={selectedOrder.colors?.[0]}
              size={72}
              borderRadius={6}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
                {selectedOrder.styleName || selectedOrder.styleNo}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                款号：{selectedOrder.styleNo || '-'} · 订单号：{selectedOrder.orderNo || '-'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                {(selectedOrder.colors?.length ? `颜色：${selectedOrder.colors.join(' / ')}` : '') || '- '}
                {selectedOrder.colors?.length && selectedOrder.sizes?.length ? ' · ' : ''}
                {selectedOrder.sizes?.length ? `尺码：${selectedOrder.sizes.join(' / ')}` : ''}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 分区配置：左配置 / 右实时预览（订单管理同款组件） */}
      <Card
        size="small"
        title="洗水唛设置"
        style={{ marginBottom: 12 }}
        extra={
          <Space size={4}>
            <Button size="small" icon={<SaveOutlined />} onClick={onOpenSaveTemplate}>保存模板</Button>
            {templates.length > 0 && (
              <Dropdown menu={{ items: templates.map((tpl: any) => ({
                key: tpl.id,
                label: (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span>{tpl.templateName}{tpl.isDefault ? <StarFilled style={{ marginLeft: 4 }} /> : null}</span>
                    <Space size={2}>
                      <Button type="link" size="small" icon={<StarOutlined />} onClick={(e) => { e.stopPropagation(); onSetDefaultTemplate(tpl.id); }} />
                      <Popconfirm title="确定删除此模板吗？" onConfirm={() => onDeleteTemplate(tpl.id)} okText="确定" cancelText="取消">
                        <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                      </Popconfirm>
                    </Space>
                  </div>
                ),
                onClick: () => onLoadTemplate(tpl),
              })) }} trigger={['click']}>
                <Button size="small" icon={<BookOutlined />}>加载模板</Button>
              </Dropdown>
            )}
            <Popconfirm title="确定恢复默认设置吗？" onConfirm={onResetSettings} okText="确定" cancelText="取消">
              <Button size="small" type="link" danger>恢复默认</Button>
            </Popconfirm>
          </Space>
        }
      >
        <div style={{ marginBottom: 12 }}>
          <Space wrap align="center">
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>纸张宽</span>
            <InputNumber
              min={20} max={200} value={wash.w}
              onChange={(v) => setWash((w) => ({ ...w, w: v ?? 30 }))}
              suffix="mm" style={{ width: 110 }}
            />
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>高</span>
            <InputNumber
              min={30} max={400} value={wash.h}
              onChange={(v) => setWash((w) => ({ ...w, h: v ?? 80 }))}
              suffix="mm" style={{ width: 110 }}
            />
          </Space>
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            分区内容可自由开关与编辑；只打印你输入的内容，标准字体无加粗
          </div>
        </div>

        <WashLabelSectionConfigPanel
          value={wash}
          onChange={(v) => setWash((prev) => ({ ...prev, ...v }))}
          width={wash.w}
          height={wash.h}
          previewSizeText={previewSizeText}
        />
      </Card>

      {/* 打印明细：按颜色 × 尺码逐行设置张数 */}
      <Card
        size="small"
        title="打印明细（颜色 × 尺码）"
        extra={
          <Space size="small">
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>合计 {totalSheets} 张</span>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              loading={printing}
              disabled={totalSheets === 0}
              onClick={onPrint}
            >
              打印洗水唛
            </Button>
          </Space>
        }
      >
        {washSkuRows.length === 0 ? (
          <span style={{ color: 'var(--color-text-tertiary)' }}>该订单暂无颜色尺码数据</span>
        ) : (
          <Table
            dataSource={washSkuRows}
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ y: 320 }}
            columns={[
              {
                title: '颜色',
                dataIndex: 'color',
                width: 120,
                render: (v: string) => <Tag color="blue">{v || '-'}</Tag>,
              },
              {
                title: '尺码',
                dataIndex: 'size',
                width: 110,
                render: (v: string) => <Tag>{v || '-'}</Tag>,
              },
              {
                title: '商品编码',
                dataIndex: 'sku',
                render: (v: string) => (
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-family-mono, monospace)' }}>{v}</span>
                ),
              },
              {
                title: '打印张数',
                dataIndex: 'printCount',
                width: 130,
                align: 'right' as const,
                render: (_: unknown, r: HangtagSkuRow) => (
                  <InputNumber
                    min={0}
                    max={99999}
                    value={r.printCount}
                    style={{ width: 100 }}
                    onChange={(v) => updatePrintCount(r.key, v)}
                  />
                ),
              },
            ]}
          />
        )}
        {selectedOrder && washSkuRows.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            款号 {selectedOrder.styleNo} · 共 {washSkuRows.length} 个颜色尺码组合，设置张数后点击右上角「打印洗水唛」
          </div>
        )}
      </Card>
    </>
  );
};

export default WashLabelPanel;
