import React from 'react';
import { Tag, Popover } from 'antd';

import type { MenuProps } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import AttachmentThumb from '../components/AttachmentThumb';
import SmartStyleHoverCard from './SmartStyleHoverCard';
import { StyleInfo } from '@/types/style';
import { formatDateTime } from '@/utils/datetime';
import { useNavigate } from 'react-router-dom';
import { withQuery } from '@/utils/api';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';

interface StyleTableViewProps {
  data: StyleInfo[];
  loading: boolean;
  total: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number, pageSize: number) => void;
  onDelete: (id: string) => void;
  onPrint: (record: StyleInfo) => void;
  onMaintenance: (record: StyleInfo) => void;
  categoryOptions: { label: string; value: string }[];
}

/**
 * 款式信息表格视图
 */
const StyleTableView: React.FC<StyleTableViewProps> = ({
  data,
  loading,
  total,
  pageSize,
  currentPage,
  onPageChange,
  onDelete,
  onPrint,
  onMaintenance,
  categoryOptions
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSupervisorOrAbove = isSupervisorOrAboveUser(user);

  const toCategoryCn = (value: unknown) => {
    const code = String(value || '').trim().toUpperCase();
    if (!code) return '-';
    // 优先使用传入的选项
    if (categoryOptions && categoryOptions.length > 0) {
      const found = categoryOptions.find(opt => opt.value === code);
      if (found) return found.label;
    }
    // 默认映射
    const map: Record<string, string> = {
      WOMAN: '女装',
      WOMEN: '女装',
      MAN: '男装',
      MEN: '男装',
      KID: '童装',
      KIDS: '童装',
      WCMAN: '女童装',
      UNISEX: '男女同款',
    };
    return map[code] || code;
  };

  const toSeasonCn = (value: unknown) => {
    const code = String(value || '').trim().toUpperCase();
    if (!code) return '-';
    const map: Record<string, string> = {
      SPRING: '春季',
      SUMMER: '夏季',
      AUTUMN: '秋季',
      WINTER: '冬季',
      SPRING_SUMMER: '春夏',
      AUTUMN_WINTER: '秋冬',
    };
    return map[code] || code;
  };

  const isStageDoneRow = (record: StyleInfo) => {
    const node = String((record as any).progressNode || '').trim();
    return node === '样衣完成';
  };

  const columns = [
    {
      title: '图片',
      dataIndex: 'cover',
      key: 'cover',
      width: 80,
      render: (_: any, record: StyleInfo) => <AttachmentThumb styleId={record.id!} />
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 120,
      render: (text: string, record: StyleInfo) => (
        <Popover
          content={<SmartStyleHoverCard record={record} />}
          trigger="hover"
          placement="rightTop"
          mouseEnterDelay={0.3}
          overlayStyle={{ maxWidth: 280 }}
        >
          <a
            onClick={() => navigate(`/style-info/${record.id}`)}
            style={{ cursor: 'pointer' }}
          >
            {text}
          </a>
        </Popover>
      ),
    },
    {
      title: 'SKC',
      dataIndex: 'skc',
      key: 'skc',
      width: 160,
      render: (text: string) => text || '-',
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 150,
      render: (text: string) => String(text || '-'),
    },
    {
      title: '品类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (value: unknown) => toCategoryCn(value),
    },
    {
      title: '季节',
      dataIndex: 'season',
      key: 'season',
      width: 80,
      render: (value: unknown) => toSeasonCn(value),
    },
    {
      title: '单价',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (val: number) => val ? `¥${val.toFixed(2)}` : '-'
    },
    {
      title: '样衣数量',
      dataIndex: 'sampleQuantity',
      key: 'sampleQuantity',
      width: 90,
      render: (val: number) => val || '-'
    },
    {
      title: '生产周期(天)',
      dataIndex: 'cycle',
      key: 'cycle',
      width: 110,
    },
    {
      title: '交板日期',
      dataIndex: 'deliveryDate',
      key: 'deliveryDate',
      width: 170,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '设计师',
      dataIndex: 'sampleNo',
      key: 'sampleNo',
      width: 100,
      render: (value: unknown) => String(value || '-'),
    },
    {
      title: '纸样师',
      dataIndex: 'sampleSupplier',
      key: 'sampleSupplier',
      width: 100,
      render: (value: unknown) => String(value || '-'),
    },
    {
      title: '车板师',
      dataIndex: 'plateWorker',
      key: 'plateWorker',
      width: 100,
      render: (value: unknown) => String(value || '-'),
    },
    {
      title: '跟单员',
      dataIndex: 'orderType',
      key: 'orderType',
      width: 100,
      render: (value: unknown) => String(value || '-'),
    },
    {
      title: '客户',
      dataIndex: 'customer',
      key: 'customer',
      width: 120,
      render: (value: unknown) => String(value || '-'),
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 140,
      render: (value: unknown) => String(value || '-'),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 170,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '进度节点',
      dataIndex: 'progressNode',
      key: 'progressNode',
      width: 120,
      render: (_: any, record: StyleInfo) => {
        const node = String((record as any).progressNode || '未开始');
        const progress = Number((record as any).sampleProgress);
        const showProgress = Number.isFinite(progress) && progress > 0 && progress < 100 && (node === '样衣制作中');
        const text = showProgress ? `${node} ${progress}%` : node;
        const tone = node.trim();
        const color =
          /紧急/.test(tone)
            ? 'warning'
            : /(错误|失败|异常|次品)/.test(tone)
              ? 'error'
              : /完成/.test(tone)
                ? 'default'
                : /(制作中|开发中|进行中)/.test(tone)
                  ? 'success'
                  : 'default';
        return <Tag color={color}>{text}</Tag>;
      }
    },
    {
      title: '完成时间',
      dataIndex: 'completedTime',
      key: 'completedTime',
      width: 170,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '维护人',
      dataIndex: 'maintenanceMan',
      key: 'maintenanceMan',
      width: 100,
      render: (val: string) => val || '-',
    },
    {
      title: '维护时间',
      dataIndex: 'maintenanceTime',
      key: 'maintenanceTime',
      width: 170,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '备注原因',
      dataIndex: 'maintenanceRemark',
      key: 'maintenanceRemark',
      width: 220,
      ellipsis: true,
      render: (value: unknown) => {
        const v = String(value || '').trim();
        return v || '-';
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      render: (_: any, record: StyleInfo) => {
        const moreItems: MenuProps['items'] = (() => {
          const items: MenuProps['items'] = [];

          if (isStageDoneRow(record)) {
            items.push({
              key: 'order',
              label: '下单',
              onClick: () => navigate(withQuery('/order-management', { styleNo: (record as any).styleNo })),
            });

            if (isSupervisorOrAbove) {
              items.push({
                key: 'maintenance',
                label: '维护',
                onClick: () => onMaintenance(record),
              });
            }

            return items;
          }

          items.push({
            key: 'pattern',
            label: '纸样开发',
            onClick: () => navigate(`/style-info/${record.id}?tab=7&section=files`),
          });
          items.push({
            key: 'sample',
            label: '样衣生产',
            onClick: () => navigate(`/style-info/${record.id}?tab=8`),
          });
          items.push({
            key: 'print',
            label: '打印',
            onClick: () => onPrint(record),
          });
          items.push({ type: 'divider' });
          items.push({
            key: 'delete',
            danger: true,
            label: '删除',
            onClick: () => onDelete(String(record.id!)),
          });
          return items;
        })();

        return (
          <RowActions
            maxInline={1}
            actions={[
              {
                key: 'detail',
                label: '详情',
                title: '详情',
                onClick: () => navigate(`/style-info/${record.id}`),
                primary: true,
              },
              ...(moreItems.length
                ? [
                  {
                    key: 'more',
                    label: '更多',
                    children: moreItems,
                  },
                ]
                : []),
            ]}
          />
        );
      },
    },
  ];

  return (
    <ResizableTable
      columns={columns}
      dataSource={data}
      rowKey="id"
      loading={loading}
      pagination={{
        total,
        pageSize,
        current: currentPage,
        onChange: onPageChange,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total) => `共 ${total} 条`,
        pageSizeOptions: ['10', '20', '50', '100'],
      }}
      scroll={{ x: 'max-content' }}
    />
  );
};

export default StyleTableView;
