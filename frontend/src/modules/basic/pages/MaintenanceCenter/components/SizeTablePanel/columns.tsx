import React from 'react';
import { Image, Space, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { TemplateLibrary } from '@/types/style';
import { typeLabel, typeColor, formatTemplateKey } from '../../../TemplateCenter/utils/templateUtils';
import type { TemplateLibraryRecord } from '../../../TemplateCenter/utils/templateUtils';

const { Text } = Typography;

interface BuildColumnsOptions {
  isFactoryUser: boolean;
  isLocked: (row?: TemplateLibrary | null) => boolean;
  handleRollback: (row: TemplateLibrary) => void;
  handleDelete: (row: TemplateLibrary) => void;
  editModalRef: React.MutableRefObject<{ openEdit: (row: TemplateLibrary) => void } | null>;
}

export const buildColumns = ({
  isFactoryUser,
  isLocked,
  handleRollback,
  handleDelete,
  editModalRef,
}: BuildColumnsOptions): ColumnsType<TemplateLibraryRecord> => [
  {
    title: '图片', dataIndex: 'styleCoverUrl', key: 'styleCoverUrl', width: 72, align: 'center' as const,
    render: (url: string) => url
      ? <Image src={getFullAuthedFileUrl(url)} width={48} style={{ height: 'auto', display: 'block', borderRadius: 4 }} preview={false} />
      : <div style={{ width: 48, height: 48, margin: '0 auto', background: 'var(--color-bg-subtle)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 14 }}>无图</div>,
  },
  { title: '名称', dataIndex: 'templateName', key: 'templateName', width: 220, render: (v) => String(v || '-') },
  { title: '类型', dataIndex: 'templateType', key: 'templateType', width: 90,
    render: (v) => <Tag color={typeColor(String(v || ''))}>{typeLabel(String(v || ''))}</Tag> },
  {
    title: (<Space size={6}><span>标识</span><Tooltip title="系统内部用来识别模板来源/用途"><span style={{ cursor: 'help', color: 'rgba(0,0,0,0.45)' }}>?</span></Tooltip></Space>),
    dataIndex: 'templateKey', key: 'templateKey', width: 180,
    render: (v) => { const f = formatTemplateKey(v); return f.full ? <Text ellipsis={{ tooltip: f.full }} style={{ maxWidth: 160, display: 'inline-block' }}>{f.text}</Text> : '-'; },
  },
  { title: '来源款号', dataIndex: 'sourceStyleNo', key: 'sourceStyleNo', width: 140, render: (v) => String(v || '-') },
  { title: '更新时间', dataIndex: 'updateTime', key: 'updateTime', width: 170, render: (v) => String(v || '-') },
  { title: '操作人', dataIndex: 'operatorName', key: 'operatorName', width: 120, render: (v) => String(v || '-') },
  { title: '状态', dataIndex: 'locked', key: 'locked', width: 110,
    render: (_: unknown, row) => isLocked(row) ? <Tag color="default">已锁定</Tag> : <Tag color="warning">处理中</Tag> },
  {
    title: '操作', key: 'action', width: isFactoryUser ? 100 : 170,
    render: (_, row) => {
      const locked = isLocked(row);
      if (isFactoryUser) {
        const fa: RowAction = locked
          ? { key: 'unlock', label: '解锁', onClick: () => handleRollback(row as TemplateLibrary) }
          : { key: 'edit', label: '继续处理', onClick: () => editModalRef.current?.openEdit(row as TemplateLibrary) };
        return <RowActions actions={[{ ...fa, primary: true }]} />;
      }
      const primary: RowAction = locked
        ? { key: 'rollback', label: '退回', title: '退回', onClick: () => handleRollback(row as TemplateLibrary) }
        : { key: 'edit', label: '继续处理', title: '继续处理', onClick: () => editModalRef.current?.openEdit(row as TemplateLibrary) };
      return (
        <RowActions actions={[
          { ...primary, primary: true },
          { key: 'delete', label: '删除', title: '删除', danger: true, onClick: () => handleDelete(row as TemplateLibrary) },
        ]} />
      );
    },
  },
];
