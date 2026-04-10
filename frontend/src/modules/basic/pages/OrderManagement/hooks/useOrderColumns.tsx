import { Tag } from 'antd';
import type { StyleInfo } from '@/types/style';
import { formatDate } from '@/utils/datetime';
import { toCategoryCn } from '@/utils/styleCategory';
import { getStyleSourceMeta } from '@/utils/styleSource';
import RowActions from '@/components/common/RowActions';
import { StyleAttachmentsButton, StyleCoverThumb } from '@/components/StyleAssets';

interface UseOrderColumnsParams {
  openCreate: (style: StyleInfo) => void;
  setPrintModalVisible: (v: boolean) => void;
  setPrintingRecord: (r: StyleInfo) => void;
  setRemarkStyleNo: (v: string) => void;
  setRemarkModalOpen: (v: boolean) => void;
}

export function useOrderColumns({ openCreate, setPrintModalVisible, setPrintingRecord, setRemarkStyleNo, setRemarkModalOpen }: UseOrderColumnsParams) {
  const columns = [
    {
      title: '图片',
      dataIndex: 'cover',
      key: 'cover',
      width: 72,
      render: (_: any, record: StyleInfo) => (
        <StyleCoverThumb styleId={(record as any).id} styleNo={record.styleNo} src={(record as any).cover || null} />
      )
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 140,
      render: (_: any, record: StyleInfo) => record.styleNo,
    },
    { title: 'SKC', dataIndex: 'skc', key: 'skc', width: 140, render: (v: any) => v || '-' },
    { title: '款名', dataIndex: 'styleName', key: 'styleName', ellipsis: true },
    {
      title: '品类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (v: unknown) => toCategoryCn(v),
    },
    {
      title: '来源',
      key: 'developmentSourceType',
      width: 150,
      render: (_: unknown, record: StyleInfo) => {
        const source = getStyleSourceMeta(record);
        return <Tag color={source.color}>{source.label}</Tag>;
      },
    },
    {
      title: '下单次数',
      dataIndex: 'orderCount',
      key: 'orderCount',
      width: 110,
      render: (v: unknown) => Number(v) || 0,
    },
    {
      title: '最近下单',
      dataIndex: 'latestOrderTime',
      key: 'latestOrderTime',
      width: 160,
      render: (v: string) => v ? formatDate(v) : '-',
    },
    {
      title: '下单人',
      dataIndex: 'latestOrderCreator',
      key: 'latestOrderCreator',
      width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: '是否下单',
      key: 'hasOrder',
      width: 100,
      render: (_: any, record: StyleInfo) => {
        const c = Number((record as Record<string, unknown>)?.orderCount || 0) || 0;
        return c > 0 ? <Tag color="green">有</Tag> : <Tag>无</Tag>;
      },
    },
    {
      title: '附件',
      key: 'attachments',
      width: 100,
      render: (_: any, record: StyleInfo) => (
        <StyleAttachmentsButton
          styleId={(record as any).id}
          styleNo={record.styleNo}
          modalTitle={`纸样附件（${record.styleNo}）`}
          buttonText="附件"
        />
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: StyleInfo) => (
        <RowActions
          actions={[
            {
              key: 'print',
              label: '打印',
              title: '打印',
              onClick: () => {
                setPrintingRecord(record);
                setPrintModalVisible(true);
              },
            },
            {
              key: 'remark',
              label: '备注',
              title: '备注',
              onClick: () => {
                setRemarkStyleNo(String(record.styleNo || ''));
                setRemarkModalOpen(true);
              },
            },
            {
              key: 'create',
              label: '下单',
              title: '下单',
              onClick: () => openCreate(record),
              primary: true,
            },
          ]}
        />
      )
    }
  ];

  return columns;
}
