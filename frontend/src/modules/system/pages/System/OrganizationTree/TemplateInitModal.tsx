import React from 'react';
import { Input, Select, Tag } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';

interface TplModalState {
  open: boolean;
  type: 'FACTORY' | 'INTERNAL' | null;
  rootName: string;
  factoryId?: string;
}

interface TemplateInitModalProps {
  tplModal: TplModalState;
  setTplModal: React.Dispatch<React.SetStateAction<TplModalState>>;
  handleInitTemplate: () => void;
  tplLoading: boolean;
  factories: Array<{ id: string; factoryName: string; contactPerson?: string }>;
}

const TEMPLATES = [
  {
    type: 'FACTORY' as const,
    icon: '',
    label: '工厂 / 车间',
    desc: '适合外发工厂、合作供应商',
    children: ['车间一', '车间二', '车间三'],
  },
  {
    type: 'INTERNAL' as const,
    icon: '',
    label: '公司内部',
    desc: '适合公司内部管理部门',
    children: ['生产部门', '财务部门', '行政部门'],
  },
];

const TemplateInitModal: React.FC<TemplateInitModalProps> = ({
  tplModal, setTplModal, handleInitTemplate, tplLoading, factories,
}) => (
  <ResizableModal
    open={tplModal.open}
    title="从模板创建组织架构"
    onCancel={() => setTplModal({ open: false, type: null, rootName: '' })}
    onOk={handleInitTemplate}
    confirmLoading={tplLoading}
    okText="立即创建"
    cancelText="取消"
    width="40vw"
    initialHeight={500}
  >
    <div style={{ padding: '16px 0' }}>
      <div style={{ marginBottom: 12, fontWeight: 500 }}>第一步：选择模板类型</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {TEMPLATES.map((tpl) => (
          <div
            key={tpl.type}
            onClick={() => setTplModal((prev) => ({ ...prev, type: tpl.type }))}
            style={{
              flex: 1,
              border: `2px solid ${tplModal.type === tpl.type ? 'var(--primary-color, #1677ff)' : '#d9d9d9'}`,
              borderRadius: 8,
              padding: '14px 16px',
              cursor: 'pointer',
              background: tplModal.type === tpl.type ? '#f0f5ff' : '#fafafa',
              transition: 'border-color .2s, background .2s',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>{tpl.icon}</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{tpl.label}</div>
            <div style={{ fontSize: 12, color: 'var(--neutral-text-secondary)', marginBottom: 10 }}>
              {tpl.desc}
            </div>
            <div style={{ fontSize: 12 }}>
              {tpl.children.map((c) => (
                <Tag key={c} style={{ marginBottom: 4 }}>{c}</Tag>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 8, fontWeight: 500 }}>第二步：输入根节点名称</div>
      <Input
        placeholder={
          tplModal.type === 'FACTORY'
            ? '例如：嘉兴市合作工厂'
            : '例如：公司生产中心'
        }
        value={tplModal.rootName}
        maxLength={40}
        allowClear
        onChange={(e) => setTplModal((prev) => ({ ...prev, rootName: e.target.value }))}
        style={{ marginBottom: 16 }}
      />

      {tplModal.type === 'FACTORY' && (
        <>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>第三步：关联现有工厂（可选）</div>
          <Select
            allowClear
            placeholder="选择已有工厂，可跳过"
            value={tplModal.factoryId}
            onChange={(v) => setTplModal((prev) => ({ ...prev, factoryId: v }))}
            options={factories.map((f) => ({
              value: f.id,
              label: f.factoryName + (f.contactPerson ? ' · ' + f.contactPerson : ''),
            }))}
            style={{ width: '100%', marginBottom: 16 }}
          />
        </>
      )}

      {tplModal.type && (
        <div style={{ background: '#f8f9fa', borderRadius: 6, padding: '12px 16px', fontSize: 13 }}>
          <div style={{ fontWeight: 500, marginBottom: 8, color: 'var(--neutral-text-secondary)' }}>
            创建预览
          </div>
          <div style={{ marginBottom: 4 }}>
             <strong>{tplModal.rootName || '(待填写)'}</strong>
          </div>
          {(tplModal.type === 'FACTORY'
            ? ['车间一', '车间二', '车间三']
            : ['生产部门', '财务部门', '行政部门']
          ).map((c) => (
            <div key={c} style={{ paddingLeft: 20, color: 'var(--neutral-text-secondary)', lineHeight: 1.8 }}>
              └ {c}
            </div>
          ))}
        </div>
      )}
    </div>
  </ResizableModal>
);

export default TemplateInitModal;
