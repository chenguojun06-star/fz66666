/**
 * 我的应用订阅卡片
 * 展示已开通应用列表 + 刷新按钮
 */
import React from 'react';
import { Card, Space, Button, Empty } from 'antd';
import { AppstoreOutlined, SyncOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { DEFAULT_PAGE_SIZE } from '@/utils/pageSizeStore';
import type { MyAppInfo } from '@/services/system/appStore';
import { buildAppColumns } from './columns';

interface Props {
  myApps: MyAppInfo[];
  loading: boolean;
  onRefresh: () => void;
}

const MyAppsSubscriptionCard: React.FC<Props> = ({ myApps, loading, onRefresh }) => {
  if (myApps.length === 0) return null;
  return (
    <Card
      title={<Space><AppstoreOutlined />我的应用订阅</Space>}

      style={{ marginBottom: 24 }}
      extra={
        <Button
          type="link"

          icon={<SyncOutlined />}
          onClick={onRefresh}
          loading={loading}
        >
          刷新
        </Button>
      }
    >
      <ResizableTable
        storageKey="profile-my-apps"
        rowKey="subscriptionId"
        dataSource={myApps}
        columns={buildAppColumns()}
        loading={loading}
        pagination={myApps.length > DEFAULT_PAGE_SIZE ? { size: 'small' } : false}

        locale={{ emptyText: <Empty description="暂无已开通应用" /> }}
      />
    </Card>
  );
};

export default MyAppsSubscriptionCard;
