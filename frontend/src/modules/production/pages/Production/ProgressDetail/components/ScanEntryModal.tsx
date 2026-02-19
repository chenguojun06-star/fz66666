import React from 'react';
import { Alert, Collapse, Form, Input, InputNumber, Select, Space, Tag, Tooltip, Typography } from 'antd';
import type { InputRef } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import type { CuttingBundle } from '@/types/production';
import type { StyleProcess } from '@/types/style';
import type { ProgressNode } from '../types';

const { Text } = Typography;

type BundleSummary = {
  totalQty: number;
  sizeRows: { size: string; qty: number }[];
};

type BundleMeta = {
  operatorId: string;
  operatorIds: string[];
  receiveTime?: string;
  completeTime?: string;
};

type ScanEntryModalProps = {
  open: boolean;
  onCancel: () => void;
  onOk: () => void;
  confirmLoading: boolean;
  modalWidth: number | string;
  modalInitialHeight: number;
  scanForm: any;
  userName: string;
  scanInputRef: React.RefObject<InputRef>;
  scanBundlesExpanded: boolean;
  onBundlesExpandedChange: (expanded: boolean) => void;
  cuttingBundles: CuttingBundle[];
  cuttingBundlesLoading: boolean;
  bundleSummary: BundleSummary;
  matchedBundle: CuttingBundle | null;
  screens: Partial<Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl', boolean>>;
  setBundleSelectedQr: (qr: string) => void;
  isBundleCompletedForSelectedNode: (b: CuttingBundle | null | undefined) => boolean;
  bundleDoneByQrForSelectedNode: Record<string, number>;
  bundleMetaByQrForSelectedNode: Record<string, BundleMeta>;
  formatTimeCompact: (v: unknown) => string;
  nodes: ProgressNode[];
  currentNodeIdx: number;
  pricingProcessLoading: boolean;
  pricingProcesses: StyleProcess[];
};

const ScanEntryModal: React.FC<ScanEntryModalProps> = ({
  open,
  onCancel,
  onOk,
  confirmLoading,
  modalWidth,
  modalInitialHeight,
  scanForm,
  userName,
  scanInputRef,
  scanBundlesExpanded,
  onBundlesExpandedChange,
  cuttingBundles,
  cuttingBundlesLoading,
  bundleSummary,
  matchedBundle,
  screens,
  setBundleSelectedQr,
  isBundleCompletedForSelectedNode,
  bundleDoneByQrForSelectedNode,
  bundleMetaByQrForSelectedNode,
  formatTimeCompact,
  nodes,
  currentNodeIdx,
  pricingProcessLoading,
  pricingProcesses,
}) => (
  <ResizableModal
    title="登记"
    open={open}
    onCancel={onCancel}
    onOk={onOk}
    confirmLoading={confirmLoading}
    okText="提交"
    cancelText="关闭"
    className="progress-detail-scan-modal"
    width={modalWidth}
    initialHeight={modalInitialHeight}
    tableDensity="dense"
    tablePaddingX={4}
    tablePaddingY={2}
    minFontSize={11}
    maxFontSize={13}
    scaleWithViewport
  >
    <Form form={scanForm} layout="vertical">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 10 }}
        title={(
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div>同一菲号在同一进度环节只能登记一次；重复提交会提示“已扫码更新/忽略”。</div>
            <div>计价工序用于单价/金额结算；同一菲号同一进度环节仅保留一个计价工序（后续修改会覆盖）。</div>
            <div>每次登记都会记录当前登录人员与时间（当前：{userName || '-'}）。</div>
          </div>
        )}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <Text type="secondary">扫码登记（可从扎号列表选择）</Text>
      </div>

      <Collapse
        size="small"
        activeKey={scanBundlesExpanded ? ['bundles'] : []}
        onChange={(keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          onBundlesExpandedChange(list.map((k) => String(k)).includes('bundles'));
        }}
        style={{ marginBottom: 8 }}
        items={[
          {
            key: 'bundles',
            label: (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>裁剪扎号明细（菲号）</div>
                <Space size={8}>
                  <Text type="secondary">共 {cuttingBundles.length} 扎</Text>
                  <Text type="secondary">合计 {bundleSummary.totalQty}</Text>
                  {matchedBundle ? <Tag color="success">已匹配：{matchedBundle.bundleNo}</Tag> : null}
                </Space>
              </div>
            ),
            children: scanBundlesExpanded ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: screens.md ? '1fr 1fr' : '1fr', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {bundleSummary.sizeRows.length ? (
                        bundleSummary.sizeRows.map((r) => (
                          <Tag key={r.size} color="default">
                            {r.size}：{r.qty}
                          </Tag>
                        ))
                      ) : (
                        <Text type="secondary">暂无扎号数据</Text>
                      )}
                    </div>
                  </div>
                  <div>
                    <Select
                      showSearch
                      allowClear
                      optionFilterProp="label"
                      placeholder={cuttingBundlesLoading ? '加载中...' : '选择扎号可自动带出码数/数量'}
                      loading={cuttingBundlesLoading}
                      value={matchedBundle ? String(matchedBundle.qrCode || '') : undefined}
                      onChange={(v) => {
                        const code = String(v || '').trim();
                        const b = cuttingBundles.find((x) => String(x.qrCode || '').trim() === code);
                        setBundleSelectedQr(code);
                        const pickedQty = Number(b?.quantity);
                        scanForm.setFieldsValue({
                          scanCode: code || '',
                          color: b?.color || '',
                          size: b?.size || '',
                          quantity: Number.isFinite(pickedQty) && pickedQty > 0 ? pickedQty : undefined,
                        });
                        setTimeout(() => scanInputRef.current?.focus?.(), 0);
                      }}
                      options={cuttingBundles.map((b) => ({
                        value: String(b.qrCode || ''),
                        label: `扎号 ${b.bundleNo}｜码数 ${String(b.size || '-')}｜颜色 ${String(b.color || '-')}｜数量 ${Number(b.quantity) || 0}`,
                        disabled: isBundleCompletedForSelectedNode(b),
                      }))}
                    />
                  </div>
                </div>

                <div style={{ maxHeight: screens.lg ? 440 : 320, overflowY: 'auto' }}>
                  <ResizableTable
                    rowKey={(r: Record<string, unknown>) => String(r.qrCode || r.id || r.bundleNo)}
                    size="small"
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    minColumnWidth={50}
                    defaultColumnWidth={80}
                    rowSelection={{
                      type: 'radio',
                      selectedRowKeys: matchedBundle ? [String(matchedBundle.qrCode || '')] : [],
                      getCheckboxProps: (r: Record<string, unknown>) => ({ disabled: Boolean(r?.completed) }),
                      onChange: (_keys: React.Key[], rows: any[]) => {
                        const r = rows?.[0] as any | undefined;
                        const code = String(r?.qrCode || '').trim();
                        if (!code) return;
                        setBundleSelectedQr(code);
                        const pickedQty = Number(r?.quantity);
                        scanForm.setFieldsValue({
                          scanCode: code,
                          color: r?.color || '',
                          size: r?.size || '',
                          quantity: Number.isFinite(pickedQty) && pickedQty > 0 ? pickedQty : undefined,
                        });
                        setTimeout(() => scanInputRef.current?.focus?.(), 0);
                      },
                    }}
                    onRow={(r: Record<string, unknown>) => ({
                      onClick: () => {
                        if (r?.completed) return;
                        const code = String(r?.qrCode || '').trim();
                        if (!code) return;
                        setBundleSelectedQr(code);
                        const pickedQty = Number(r?.quantity);
                        scanForm.setFieldsValue({
                          scanCode: code,
                          color: r?.color || '',
                          size: r?.size || '',
                          quantity: Number.isFinite(pickedQty) && pickedQty > 0 ? pickedQty : undefined,
                        });
                        setTimeout(() => scanInputRef.current?.focus?.(), 0);
                      },
                    })}
                    dataSource={cuttingBundles.map((b) => {
                      const qr = String(b.qrCode || '').trim();
                      const total = Number(b.quantity) || 0;
                      const done = Number(bundleDoneByQrForSelectedNode[qr]) || 0;
                      const remaining = Math.max(0, total - done);
                      const completed = total > 0 && done >= total;
                      const meta = (bundleMetaByQrForSelectedNode as any)?.[qr] || {};
                      return {
                        ...b,
                        done,
                        remaining,
                        completed,
                        operatorId: (meta as any)?.operatorId || '-',
                        operatorName: (meta as any)?.operatorName || '-',
                        operatorIds: Array.isArray((meta as any)?.operatorIds) ? (meta as any).operatorIds : [],
                        operatorNames: Array.isArray((meta as any)?.operatorNames) ? (meta as any).operatorNames : [],
                        receiveTime: (meta as any)?.receiveTime || '',
                        completeTime: (meta as any)?.completeTime || '',
                      } as any;
                    })}
                    columns={[
                      { title: '菲号', dataIndex: 'bundleNo', key: 'bundleNo', width: 70 },
                      { title: '码数', dataIndex: 'size', key: 'size', width: 70, render: (v) => v || '-' },
                      { title: '颜色', dataIndex: 'color', key: 'color', width: 90, render: (v) => v || '-' },
                      { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 70, render: (v) => Number(v) || 0 },
                      {
                        title: '完成度',
                        key: 'doneRate',
                        width: 110,
                        render: (_: any, r: any) => {
                          const total = Number(r?.quantity) || 0;
                          const done = Number(r?.done) || 0;
                          return (
                            <span>
                              {done} / {total}
                            </span>
                          );
                        },
                      },
                      {
                        title: '状态',
                        dataIndex: 'completed',
                        key: 'completed',
                        width: 64,
                        render: (v: any) => (v
                          ? <Tag color="success" style={{ marginInlineEnd: 0, paddingInline: 2, lineHeight: '16px', fontSize: 'var(--font-size-xs)' }}>已完成</Tag>
                          : <Tag style={{ marginInlineEnd: 0, paddingInline: 2, lineHeight: '16px', fontSize: 'var(--font-size-xs)' }}>未完成</Tag>),
                      },
                      {
                        title: '生产人员',
                        dataIndex: 'operatorName',
                        key: 'operatorName',
                        width: 120,
                        render: (_: any, r: any) => {
                          const names = Array.isArray(r?.operatorNames) ? (r.operatorNames as string[]).filter(Boolean) : [];
                          const title = names.length ? names.join(', ') : String(r?.operatorName || '-');
                          const text = String(r?.operatorName || '-');
                          return (
                            <Tooltip title={title} placement="topLeft">
                              <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {text}
                              </span>
                            </Tooltip>
                          );
                        },
                      },
                      {
                        title: '领取时间',
                        dataIndex: 'receiveTime',
                        key: 'receiveTime',
                        width: 100,
                        render: (v: any) => formatTimeCompact(v),
                      },
                      {
                        title: '完成时间',
                        dataIndex: 'completeTime',
                        key: 'completeTime',
                        width: 100,
                        render: (v: any) => formatTimeCompact(v),
                      },
                    ]}
                  />
                </div>
              </div>
            ) : null,
          },
        ]}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: screens.lg ? '1.1fr 0.9fr 2fr' : screens.md ? '1fr 1fr' : '1fr',
          gap: 12,
          alignItems: 'end',
        }}
      >
        <Form.Item label="订单号" name="orderNo" style={{ marginBottom: 8 }}>
          <Input disabled />
        </Form.Item>
        <div style={{ marginBottom: 8 }}>
          <div style={{ marginBottom: 8, fontSize: '14px', color: 'rgba(0, 0, 0, 0.88)' }}>类型</div>
          <Input value="生产" disabled />
        </div>
        <Form.Item name="scanType" hidden>
          <Input />
        </Form.Item>
        <Form.Item
          label="扫码内容（二维码）"
          name="scanCode"
          rules={[{ required: true, message: '请扫码输入' }]}
          style={{ marginBottom: 8 }}
        >
          <Input
            ref={scanInputRef}
            placeholder="请扫码输入（或从扎号列表选择）"
          />
        </Form.Item>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: screens.lg ? '1fr 1fr' : '1fr',
          gap: 12,
          alignItems: 'end',
        }}
      >
        <Form.Item label="进度节点" name="progressStage" rules={[{ required: true, message: '请选择节点' }]} style={{ marginBottom: 0 }}>
          <Select
            showSearch
            options={nodes.map((n, idx) => ({ value: n.name, label: n.name, disabled: idx < currentNodeIdx }))}
            placeholder="请选择节点"
            disabled
          />
        </Form.Item>
        <Form.Item
          label="计价工序"
          name="processName"
          style={{ marginBottom: 0 }}
        >
          <Select
            showSearch
            allowClear
            loading={pricingProcessLoading}
            placeholder={pricingProcessLoading ? '加载中...' : pricingProcesses.length ? '选择计价小工序（可不选）' : '无工序单价（可不选）'}
            disabled={!pricingProcessLoading && pricingProcesses.length === 0}
            options={[...pricingProcesses]
              .sort((a: any, b: any) => (Number(a?.sortOrder) || 0) - (Number(b?.sortOrder) || 0))
              .map((p: any) => ({
                value: String(p?.processName || '').trim(),
                label: String(p?.processName || '').trim(),
              }))
              .filter((x) => x.value)}
            onChange={(v) => {
              const name = String(v || '').trim();
              if (!name) {
                scanForm.setFieldsValue({ unitPrice: scanForm.getFieldValue('baseUnitPrice') });
                return;
              }
              const picked = pricingProcesses.find((p) => String((p as any)?.processName || '').trim() === name);
              const price = Number((picked as any)?.price);
              if (Number.isFinite(price) && price >= 0) {
                scanForm.setFieldsValue({ unitPrice: price });
                return;
              }
              scanForm.setFieldsValue({ unitPrice: scanForm.getFieldValue('baseUnitPrice') });
            }}
          />
        </Form.Item>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: screens.lg ? 'repeat(4, 1fr)' : screens.md ? '1fr 1fr' : '1fr',
          gap: 12,
          alignItems: 'end',
          marginTop: 8,
        }}
      >
        <Form.Item label="颜色" name="color" style={{ marginBottom: 0 }}>
          <Input placeholder="可选" />
        </Form.Item>
        <Form.Item label="码数" name="size" style={{ marginBottom: 0 }}>
          <Input placeholder="可选" />
        </Form.Item>
        <Form.Item label="数量" name="quantity" style={{ marginBottom: 0 }}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="单价" name="unitPrice" style={{ marginBottom: 0 }}>
          <InputNumber min={0} precision={2} style={{ width: '100%' }} />
        </Form.Item>
      </div>
      <Form.Item name="processCode" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="baseUnitPrice" hidden>
        <Input />
      </Form.Item>
    </Form>
  </ResizableModal>
);

export default ScanEntryModal;
