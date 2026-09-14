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
  factories: Array<{ id?: string; factoryName: string; contactPerson?: string }>;
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
      <div className="u-mb-12 u-fw-500">第一步：选择模板类型</div>
      <div className="u-d-flex u-gap-12" style={{ marginBottom: 20 }}>
        {TEMPLATES.map((tpl) => (
          <div
            key={tpl.type}
            onClick={() => setTplModal((prev) => ({ ...prev, type: tpl.type }))}
            style={{
              flex: 1,
              border: `2px solid ${tplModal.type === tpl.type ? 'var(--primary-color, var(--color-primary))' : 'var(--color-border-antd)'}`,
              borderRadius: 8,
              padding: '14px 16px',
              cursor: 'pointer',
              background: tplModal.type === tpl.type ? 'var(--color-bg-highlight)' : 'var(--color-bg-container)',
              transition: 'border-color .2s, background .2s',
            }}
          >
            <div className="u-fs-28 u-mb-6">{tpl.icon}</div>
            <div className="u-fw-600 u-mb-4">{tpl.label}</div>
            <div className="u-fs-14 u-mb-10" style={{ color: 'var(--neutral-text-secondary)' }}>
              {tpl.desc}
            </div>
            <div className="u-fs-14">
              {tpl.children.map((c) => (
                <Tag key={c} className="u-mb-4">{c}</Tag>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="u-mb-8 u-fw-500">第二步：输入根节点名称</div>
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
        onPressEnter={handleInitTemplate}
        className="u-mb-16"
      />

      {tplModal.type === 'FACTORY' && (
        <>
          <div className="u-mb-8 u-fw-500">第三步：关联现有工厂（可选）</div>
          <Select
            allowClear
            placeholder="选择已有工厂，可跳过"
            value={tplModal.factoryId}
            onChange={(v) => setTplModal((prev) => ({ ...prev, factoryId: v }))}
            options={factories.map((f) => ({
              value: f.id,
              label: f.factoryName + (f.contactPerson ? ' · ' + f.contactPerson : ''),
            }))}
            className="u-w-full u-mb-16"
          />
        </>
      )}

      {tplModal.type && (
        <div className="u-br-6 u-fs-14" style={{ background: 'var(--color-slate-50)', padding: '12px 16px' }}>
          <div className="u-fw-500 u-mb-8" style={{ color: 'var(--neutral-text-secondary)' }}>
            创建预览
          </div>
          <div className="u-mb-4">
             <strong>{tplModal.rootName || '(待填写)'}</strong>
          </div>
          {(tplModal.type === 'FACTORY'
            ? ['车间一', '车间二', '车间三']
            : ['生产部门', '财务部门', '行政部门']
          ).map((c) => (
            <div key={c} className="u-lh-18" style={{ paddingLeft: 20, color: 'var(--neutral-text-secondary)' }}>
              └ {c}
            </div>
          ))}
        </div>
      )}
    </div>
  </ResizableModal>
);

export default TemplateInitModal;
