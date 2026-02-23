import React from 'react';
import { AutoComplete, Button, Card, Input, InputNumber, Space, Spin, Typography } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import type { ProcessUnitPrice } from '../hooks/useCuttingCreateTask';
import type { CuttingCreateTaskState } from '../hooks';

interface Props {
  modalWidth: string | number;
  createTask: CuttingCreateTaskState;
}

const CuttingCreateTaskModal: React.FC<Props> = ({ modalWidth, createTask }) => {
  return (
    <ResizableModal
      open={createTask.createTaskOpen}
      title="新建裁剪任务"
      width={modalWidth}
      centered
      onCancel={() => createTask.setCreateTaskOpen(false)}
      okText="创建"
      confirmLoading={createTask.createTaskSubmitting}
      onOk={createTask.handleSubmitCreateTask}
      initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
    >
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <span>款号</span>
          <AutoComplete
            value={createTask.createStyleNo}
            style={{ width: 260 }}
            placeholder="输入或搜索款号"
            options={createTask.createStyleOptions.map((x) => ({
              value: x.styleNo,
              label: x.styleName ? `${x.styleNo}（${x.styleName}）` : x.styleNo,
            }))}
            onSearch={(v) => createTask.fetchStyleInfoOptions(v)}
            onChange={(v) => createTask.handleStyleNoChange(v)}
            filterOption={false}
            allowClear
            onClear={() => createTask.handleStyleNoChange('')}
          />
          <span>裁剪单号</span>
          <Input
            value={createTask.createOrderNo}
            style={{ width: 220 }}
            placeholder="不填自动生成"
            onChange={(e) => createTask.setCreateOrderNo(e.target.value)}
          />
        </Space>
        {createTask.createStyleName ? (
          <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>款名：{createTask.createStyleName}</div>
        ) : null}
      </Card>

      {(createTask.createProcessPrices.length > 0 || createTask.processPricesLoading) && (
        <Card
          size="small"
          style={{ marginBottom: 12 }}
          title={(
            <Space>
              <span>工序进度单价</span>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                （配置后将自动初始化工序跟踪，支持扫码计件）
              </Typography.Text>
            </Space>
          )}
          extra={
            <Button
              type="dashed"
              size="small"
              onClick={() => {
                createTask.setCreateProcessPrices((prev) => [
                  ...prev,
                  { processName: '', unitPrice: 0 },
                ]);
              }}
            >
              + 新增工序
            </Button>
          }
        >
          {createTask.processPricesLoading ? (
            <Spin size="small" />
          ) : (
            <ResizableTable<ProcessUnitPrice>
              storageKey="cutting-create-process-prices"
              size="small"
              dataSource={createTask.createProcessPrices}
              rowKey={(_, i) => String(i)}
              pagination={false}
              columns={[
                {
                  title: '#',
                  width: 36,
                  render: (_: unknown, __: ProcessUnitPrice, i: number) => (
                    <span style={{ color: 'var(--neutral-text-disabled)', fontSize: 11 }}>{i + 1}</span>
                  ),
                },
                {
                  title: '工序名称',
                  dataIndex: 'processName',
                  render: (v: string, _: ProcessUnitPrice, i: number) => (
                    <Input
                      size="small"
                      value={v}
                      style={{ border: 'none' }}
                      onChange={(e) => {
                        const next = createTask.createProcessPrices.slice();
                        next[i] = { ...next[i], processName: e.target.value };
                        createTask.setCreateProcessPrices(next);
                      }}
                    />
                  ),
                },
                {
                  title: '工价(元)',
                  dataIndex: 'unitPrice',
                  width: 110,
                  render: (v: number | null, _: ProcessUnitPrice, i: number) => (
                    <InputNumber
                      size="small"
                      value={v ?? 0}
                      min={0}
                      precision={2}
                      style={{ width: '100%' }}
                      onChange={(val) => {
                        const next = createTask.createProcessPrices.slice();
                        next[i] = { ...next[i], unitPrice: val ?? 0 };
                        createTask.setCreateProcessPrices(next);
                      }}
                    />
                  ),
                },
                {
                  title: '操作',
                  width: 52,
                  render: (_: unknown, __: ProcessUnitPrice, i: number) => (
                    <Button
                      type="link"
                      danger
                      size="small"
                      disabled={createTask.createProcessPrices.length <= 1}
                      onClick={() => {
                        createTask.setCreateProcessPrices(
                          createTask.createProcessPrices.filter((_, idx) => idx !== i)
                        );
                      }}
                    >
                      删除
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </Card>
      )}

      <Card
        size="small"
        title="自定义裁剪单"
        extra={
          <Button type="dashed" onClick={createTask.handleCreateBundleAdd}>
            新增一行
          </Button>
        }
      >
        {createTask.createBundles.map((row, index) => (
          <Space key={index} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
            <Input
              placeholder="颜色"
              style={{ width: 160 }}
              value={row.color}
              onChange={(e) => createTask.handleCreateBundleChange(index, 'color', e.target.value)}
            />
            <Input
              placeholder="尺码"
              style={{ width: 140 }}
              value={row.size}
              onChange={(e) => createTask.handleCreateBundleChange(index, 'size', e.target.value)}
            />
            <InputNumber
              placeholder="数量"
              style={{ width: 140 }}
              min={0}
              value={row.quantity}
              onChange={(value) => createTask.handleCreateBundleChange(index, 'quantity', value || 0)}
            />
            <Button onClick={() => createTask.handleCreateBundleRemove(index)} disabled={createTask.createBundles.length === 1}>
              删除
            </Button>
          </Space>
        ))}
      </Card>
    </ResizableModal>
  );
};

export default CuttingCreateTaskModal;
