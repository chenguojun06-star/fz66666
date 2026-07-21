import React, { useRef, useCallback } from 'react';
import { AutoComplete, Button, Card, Drawer, Input, Select, Segmented, Space } from 'antd';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import { UnifiedDatePicker, dayjs } from '@/components/common/UnifiedDatePicker';
import CustomerSelect from '@/components/common/CustomerSelect';
import type { CuttingCreateTaskState } from '../hooks';
import FactoryCapacityCard from './FactoryCapacityCard';
import OrderLinesCard from './OrderLinesCard';
import ProcessFlowCard from './ProcessFlowCard';

interface Props {
  createTask: CuttingCreateTaskState;
}

const CuttingCreateTaskModal: React.FC<Props> = ({ createTask }) => {
  const styleSearchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const debouncedFetchStyleInfoOptions = useCallback((v: string) => {
    if (styleSearchTimerRef.current) clearTimeout(styleSearchTimerRef.current);
    styleSearchTimerRef.current = setTimeout(() => {
      createTask.fetchStyleInfoOptions(v);
    }, 300);
  }, [createTask]);

  return (
    <Drawer
      open={createTask.createTaskOpen}
      title="无资料下单"
      size="large"
      placement="right"
      styles={{ wrapper: { width: '85vw' }, body: { padding: '16px 24px', display: 'flex', flexDirection: 'column', overflow: 'auto' } }}
      onClose={() => createTask.setCreateTaskOpen(false)}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={() => createTask.setCreateTaskOpen(false)}>关闭</Button>
          <Button type="primary" onClick={createTask.handleSubmitCreateTask} loading={createTask.createTaskSubmitting}>创建</Button>
        </div>
      }
    >
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ color: 'rgba(0,0,0,0.65)', marginBottom: 6, fontSize: 14 }}>款式图</div>
            <ImageUploadBox
              value={createTask.createStyleImageUrl}
              onChange={(url) => createTask.setCreateStyleImageUrl(url)}
              width={120}
              height={150}
              enableDrop
              maxSizeMB={10}
              label="点击/拖拽/粘贴上传"
              borderRadius={6}
            />
          </div>
          <div style={{ flex: 1 }}>
        <Space wrap>
          <span>款号</span>
          <AutoComplete
            value={createTask.createStyleNo}
            style={{ width: 260 }}
            placeholder="输入或选择已维护工价的款号"
            options={createTask.createStyleOptions.map((x) => ({
              value: x.styleNo,
              label: x.styleName ? `${x.styleNo}（${x.styleName}）` : x.styleNo,
            }))}
            onSearch={(v) => debouncedFetchStyleInfoOptions(v)}
            onChange={(v) => createTask.handleStyleNoChange(v)}
            onSelect={(v) => createTask.handleStyleNoSelect(String(v || ''))}
            onBlur={createTask.handleStyleNoBlur}
            filterOption={false}
            allowClear
            onClear={() => createTask.handleStyleNoChange('')}
          />
          <span>下单日期</span>
          <UnifiedDatePicker
            value={createTask.createOrderDate ? dayjs(createTask.createOrderDate, 'YYYY-MM-DD') : null}
            style={{ width: 160 }}
            placeholder="请选择下单日期"
            onChange={(value) => createTask.setCreateOrderDate(Array.isArray(value) ? '' : (value ? value.format('YYYY-MM-DD') : ''))}
          />
          <span>订单交期</span>
          <UnifiedDatePicker
            value={createTask.createDeliveryDate ? dayjs(createTask.createDeliveryDate, 'YYYY-MM-DD') : null}
            style={{ width: 160 }}
            placeholder="请选择订单交期"
            onChange={(value) => createTask.setCreateDeliveryDate(Array.isArray(value) ? '' : (value ? value.format('YYYY-MM-DD') : ''))}
          />
          <span>生产方</span>
          <Segmented
            value={createTask.createFactoryMode}
            options={[
              { label: '内部工厂', value: 'INTERNAL' },
              { label: '外发加工', value: 'EXTERNAL' },
            ]}
            style={{ width: 220 }}
            onChange={(value) => {
              const nextMode = value as 'INTERNAL' | 'EXTERNAL';
              createTask.setCreateFactoryMode(nextMode);
              createTask.setCreateOrgUnitId('');
              createTask.setCreateFactoryId('');
              if (nextMode === 'INTERNAL') {
                createTask.fetchInternalUnitOptions();
              } else {
                createTask.fetchFactoryOptions('', nextMode);
              }
            }}
          />
          <Select
            value={createTask.createFactoryMode === 'INTERNAL'
              ? (createTask.createOrgUnitId || undefined)
              : (createTask.createFactoryId || undefined)}
            style={{ width: 290 }}
            placeholder={createTask.createFactoryMode === 'INTERNAL' ? '请选择内部生产组/车间' : '请选择外发工厂'}
            showSearch
            allowClear
            loading={createTask.createFactoryLoading}
            filterOption={createTask.createFactoryMode === 'INTERNAL'}
            optionFilterProp="label"
            onSearch={(value) => {
              if (createTask.createFactoryMode === 'EXTERNAL') {
                createTask.fetchFactoryOptions(value, createTask.createFactoryMode);
              }
            }}
            onChange={(value) => {
              if (createTask.createFactoryMode === 'INTERNAL') {
                createTask.setCreateOrgUnitId(String(value || ''));
              } else {
                createTask.setCreateFactoryId(String(value || ''));
              }
            }}
            options={createTask.createFactoryMode === 'INTERNAL'
              ? createTask.createInternalUnitOptions.map((unit) => ({
                  value: String(unit.id || '').trim(),
                  label: String(unit.pathNames || unit.unitName || unit.nodeName || '').trim(),
                }))
              : createTask.createFactoryOptions.map((factory) => ({
                  value: String(factory.id || '').trim(),
                  label: `${factory.factoryName}${factory.factoryType === 'INTERNAL' ? '（本厂）' : '（外发）'}`,
                }))}
          />
        </Space>
        <Space wrap style={{ marginTop: 8 }}>
          <span>客户</span>
          <CustomerSelect
            value={createTask.createCustomerName}
            onChange={(value) => createTask.setCreateCustomerName(value)}
            style={{ width: 260 }}
            placeholder="选择或输入客户名称"
          />
          <span>品类</span>
          <Select
            value={createTask.createCategory || undefined}
            onChange={(v) => createTask.setCreateCategory(v || '')}
            placeholder="选择或搜索品类"
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 200 }}
            options={createTask.categoryOptions}
          />
          <span>急单</span>
          <Select
            value={createTask.createUrgencyLevel}
            onChange={(v) => createTask.setCreateUrgencyLevel(v)}
            style={{ width: 100 }}
            options={[
              { label: '普通', value: 'normal' },
              { label: '急单', value: 'urgent' },
            ]}
          />
          <span>下单员</span>
          <Select
            value={createTask.createOrderPlacer || undefined}
            onChange={(v) => createTask.setCreateOrderPlacer(v || '')}
            placeholder="默认当前用户"
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 160 }}
            options={createTask.tenantUsers.map(u => ({ value: u.name || u.username, label: u.name || u.username }))}
          />
          <span>跟单员</span>
          <Select
            value={createTask.createMerchandiser || undefined}
            onChange={(v) => createTask.setCreateMerchandiser(v || '')}
            placeholder="选择跟单员"
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 160 }}
            options={createTask.tenantUsers.map(u => ({ value: u.name || u.username, label: u.name || u.username }))}
          />
        </Space>
        <div style={{ marginTop: 8 }}>
          <span style={{ color: 'rgba(0,0,0,0.65)', fontSize: 14 }}>备注</span>
          <Input.TextArea
            value={createTask.createRemarks}
            onChange={(e) => createTask.setCreateRemarks(e.target.value)}
            placeholder="输入订单备注（下单后可在订单备注时间线查看）"
            rows={2}
            maxLength={500}
            showCount
            style={{ marginTop: 4 }}
          />
        </div>
        {createTask.selectedFactoryStat && <FactoryCapacityCard stat={createTask.selectedFactoryStat} />}
          </div>
        </div>
      </Card>

      <OrderLinesCard createTask={createTask} />

      <ProcessFlowCard
        createTask={createTask}
        debouncedFetchStyleInfoOptions={debouncedFetchStyleInfoOptions}
      />

      <Card>
        <div style={{ color: 'rgba(0,0,0,0.65)', lineHeight: 1.8 }}>
          创建完成后，领取、生成菲号、打印裁剪单，继续回到裁剪页按正常订单逻辑处理。
          工序单价直接影响工资结算，请根据实际工价填写。
        </div>
      </Card>
    </Drawer>
  );
};

export default CuttingCreateTaskModal;
