import React, { useState, useEffect } from 'react';
import { Select, Tabs, Input, InputNumber } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { safeString } from './utils';

const { Option } = Select;

export interface TransferOrderModalProps {
  transferModalVisible: boolean;
  transferRecord: any;
  transferType: 'user' | 'factory';
  setTransferType: (v: 'user' | 'factory') => void;
  transferUserId: string | undefined;
  setTransferUserId: (v: string | undefined) => void;
  transferMessage: string;
  setTransferMessage: (v: string) => void;
  transferUsers: any[];
  transferSearching: boolean;
  transferFactoryId: string | undefined;
  setTransferFactoryId: (v: string | undefined) => void;
  transferFactoryMessage: string;
  setTransferFactoryMessage: (v: string) => void;
  transferFactories: any[];
  transferFactorySearching: boolean;
  transferSubmitting: boolean;
  transferBundles: any[];
  transferBundlesLoading: boolean;
  transferSelectedBundleIds: string[];
  setTransferSelectedBundleIds: (v: string[]) => void;
  transferProcesses: any[];
  transferProcessesLoading: boolean;
  transferSelectedProcessCodes: string[];
  setTransferSelectedProcessCodes: (v: string[]) => void;
  searchTransferUsers: (v: string) => void;
  searchTransferFactories: (v: string) => void;
  submitTransfer: (processPriceOverrides?: Record<string, number>) => void;
  closeTransferModal: () => void;
}

const TransferOrderModal: React.FC<TransferOrderModalProps> = (props) => {
  const {
    transferModalVisible, transferRecord, transferType, setTransferType,
    transferUserId, setTransferUserId, transferMessage, setTransferMessage,
    transferUsers, transferSearching,
    transferFactoryId, setTransferFactoryId, transferFactoryMessage, setTransferFactoryMessage,
    transferFactories, transferFactorySearching,
    transferSubmitting, transferBundles, transferBundlesLoading,
    transferSelectedBundleIds, setTransferSelectedBundleIds,
    transferProcesses, transferProcessesLoading,
    transferSelectedProcessCodes, setTransferSelectedProcessCodes,
    searchTransferUsers, searchTransferFactories,
    submitTransfer, closeTransferModal,
  } = props;

  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});

  useEffect(() => {
    setPriceOverrides({});
  }, [transferSelectedProcessCodes]);

  const handleSubmit = () => {
    if (transferType === 'factory' && transferSelectedProcessCodes.length > 0) {
      submitTransfer(priceOverrides);
    } else {
      submitTransfer();
    }
  };

  const handlePriceChange = (code: string, value: number | null) => {
    setPriceOverrides(prev => {
      const next = { ...prev };
      if (value != null && value >= 0) {
        next[code] = value;
      } else {
        delete next[code];
      }
      return next;
    });
  };

  const selectedProcessDetails = transferSelectedProcessCodes
    .map(code => transferProcesses.find((p: any) => (p.processCode || p.id) === code))
    .filter(Boolean);

  return (
    <ResizableModal
      title={`转单 - ${safeString((transferRecord as any)?.orderNo)}`}
      open={transferModalVisible}
      onCancel={closeTransferModal}
      onOk={handleSubmit}
      confirmLoading={transferSubmitting}
      okText={transferType === 'factory' ? '确认转工厂' : '确认转人员'}
      cancelText="取消"
      width="60vw"
      initialHeight={Math.round(window.innerHeight * 0.82)}
      destroyOnHidden
    >
      <div style={{ padding: '8px 0' }}>
        <Tabs
          activeKey={transferType}
          onChange={(key) => setTransferType(key as 'user' | 'factory')}
          style={{ marginBottom: 16 }}
          items={[
            { key: 'user', label: '转人员（系统内部）' },
            { key: 'factory', label: '转工厂（系统内部）' },
          ]}
        />

        {transferType === 'user' && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>转给谁：</div>
            <Select
              showSearch placeholder="输入姓名搜索系统用户（仅限本系统内部）" value={transferUserId}
              onChange={(val) => setTransferUserId(val)} onSearch={searchTransferUsers}
              filterOption={false} loading={transferSearching}
              notFoundContent={transferSearching ? '搜索中...' : '输入姓名搜索'}
              style={{ width: '100%' }} allowClear
            >
              {transferUsers.map(u => (
                <Option key={u.id} value={u.id}>
                  {u.name}{u.username ? ` (${u.username})` : ''}
                </Option>
              ))}
            </Select>
          </div>
        )}

        {transferType === 'factory' && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>转给哪个工厂：</div>
            <Select
              showSearch placeholder="输入工厂名称搜索（仅限本系统内部工厂）" value={transferFactoryId}
              onChange={(val) => setTransferFactoryId(val)} onSearch={searchTransferFactories}
              filterOption={false} loading={transferFactorySearching}
              notFoundContent={transferFactorySearching ? '搜索中...' : '输入工厂名称搜索'}
              style={{ width: '100%' }} allowClear
            >
              {transferFactories.map(f => (
                <Option key={f.id} value={f.id}>
                  {f.factoryName}{f.factoryCode ? ` (${f.factoryCode})` : ''}
                  {f.contactPerson ? ` · ${f.contactPerson}` : ''}
                </Option>
              ))}
            </Select>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 6, fontWeight: 500 }}>
            选择菲号（可选）：
            {transferSelectedBundleIds.length > 0 && (
              <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                已选 {transferSelectedBundleIds.length} 个
              </span>
            )}
          </div>
          <ResizableTable
            storageKey="production-list-transfer"
            loading={transferBundlesLoading} dataSource={transferBundles}
            rowKey="id" pagination={false}
            rowClassName={(record: any) => {
              const s = record?.status;
              if (s === 'qualified' || s === 'unqualified' || s === 'repaired' || s === 'repaired_waiting_qc' || s === 'completed') return 'transfer-bundle-row-disabled';
              return '';
            }}
            rowSelection={{
              selectedRowKeys: transferSelectedBundleIds,
              onChange: (keys) => setTransferSelectedBundleIds(keys as string[]),
              getCheckboxProps: (record: any) => ({
                disabled: record?.status === 'qualified' || record?.status === 'unqualified' || record?.status === 'repaired' || record?.status === 'repaired_waiting_qc' || record?.status === 'completed',
              }),
            }}
            columns={[
              { title: '菲号', dataIndex: 'bundleNo', width: 80, render: (val: any) => val || '-' },
              { title: '颜色', dataIndex: 'color', width: 100 },
              { title: '尺码', dataIndex: 'size', width: 80 },
              { title: '数量', dataIndex: 'quantity', width: 70 },
              {
                title: '状态', dataIndex: 'status', width: 90,
                render: (v: string) => {
                  const statusMap: Record<string, string> = {
                    'created': '已创建', 'qualified': '已质检', 'unqualified': '不合格',
                    'repaired': '已返修', 'repaired_waiting_qc': '返修待质检',
                    'completed': '已完成', 'in_progress': '生产中',
                  };
                  return statusMap[v] || '未知';
                }
              },
            ]}
            locale={{ emptyText: transferBundlesLoading ? '加载中...' : '暂无菲号数据' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 6, fontWeight: 500 }}>
            选择工序（可选）：
            {transferSelectedProcessCodes.length > 0 && (
              <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                已选 {transferSelectedProcessCodes.length} 个工序
              </span>
            )}
          </div>
          <Select
            mode="multiple" placeholder="选择要转移的工序" value={transferSelectedProcessCodes}
            onChange={(vals) => setTransferSelectedProcessCodes(vals)}
            loading={transferProcessesLoading} style={{ width: '100%' }}
            allowClear optionFilterProp="label" maxTagCount="responsive"
          >
            {transferProcesses.map((p: any) => {
              const price = Number(p.unitPrice || 0);
              const priceText = price > 0 ? ` - ¥${price.toFixed(2)}/件` : '';
              const label = `${p.processName}${priceText}${p.progressStage ? ` (${p.progressStage})` : ''}`;
              return (
                <Option key={p.processCode || p.id} value={p.processCode || p.id} label={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{p.processName}</span>
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: '12px' }}>
                      {p.progressStage && `${p.progressStage} | `}
                      {price > 0 ? `¥${price.toFixed(2)}` : '未配置单价'}
                    </span>
                  </div>
                </Option>
              );
            })}
          </Select>
          {transferProcesses.length === 0 && !transferProcessesLoading && (
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: '12px', marginTop: 4 }}>
              该订单暂无工序配置
            </div>
          )}
        </div>

        {transferType === 'factory' && selectedProcessDetails.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>
              工序单价设置：
              <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', fontSize: '12px', marginLeft: 6 }}>
                转厂后外部工厂将按新单价结算工资
              </span>
            </div>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg-layout)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>工序名称</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500, width: 120 }}>原单价</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500, width: 160 }}>新单价（元/件）</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedProcessDetails.map((p: any) => {
                    const code = p.processCode || p.id;
                    const originalPrice = Number(p.unitPrice || 0);
                    const newPrice = priceOverrides[code];
                    return (
                      <tr key={code} style={{ borderTop: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '6px 12px' }}>{p.processName}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--color-text-tertiary)' }}>
                          {originalPrice > 0 ? `¥${originalPrice.toFixed(2)}` : '-'}
                        </td>
                        <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                          <InputNumber
                           
                            min={0}
                            precision={2}
                            placeholder={originalPrice > 0 ? `默认 ¥${originalPrice.toFixed(2)}` : '输入单价'}
                            value={newPrice != null ? newPrice : undefined}
                            onChange={(val) => handlePriceChange(code, val)}
                            style={{ width: 130 }}
                            suffix="元"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <div style={{ marginBottom: 6, fontWeight: 500 }}>
            备注（可选）：
            <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', fontSize: '12px', marginLeft: 6 }}>
              系统将自动记录备注时间
            </span>
          </div>
          <Input.TextArea
            id="transferRemark"
            placeholder="请输入转单备注"
            value={transferType === 'factory' ? transferFactoryMessage : transferMessage}
            onChange={(e) => transferType === 'factory'
              ? setTransferFactoryMessage(e.target.value)
              : setTransferMessage(e.target.value)
            }
            autoSize={{ minRows: 2, maxRows: 4 }} maxLength={200} showCount
          />
        </div>
      </div>
    </ResizableModal>
  );
};

export default TransferOrderModal;
