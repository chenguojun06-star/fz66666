import React from 'react';
import { Button, Card, Input, Select, Space, Spin, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import type { StyleBom } from '@/types/style';
import type { PatternMaterialRow } from './helpers';

const { Text } = Typography;

export interface PatternUsageCardProps {
  childReadOnly: boolean;
  activeSizes: string[];
  allSizes: string[];
  bomList: StyleBom[];
  bomLoading: boolean;
  patternRows: PatternMaterialRow[];
  usageColumns: TableColumnsType<PatternMaterialRow>;
  savingUsage: boolean;
  sizeOptions: Array<{ value: string; label: string }>;
  sizeSearchTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | undefined>;
  onAddSizes: (values: string[]) => void;
  onSaveUsage: () => Promise<void>;
  setSizeOptions: React.Dispatch<React.SetStateAction<Array<{ value: string; label: string }>>>;
}

// 各码实际用量配比卡片
const PatternUsageCard: React.FC<PatternUsageCardProps> = ({
  childReadOnly,
  activeSizes,
  bomList,
  bomLoading,
  patternRows,
  usageColumns,
  savingUsage,
  sizeOptions,
  sizeSearchTimerRef,
  onAddSizes,
  setSizeOptions,
  onSaveUsage,
}) => {
  return (
    <Card
      style={{ marginTop: 16 }}
      title={
        <Space>
          <span>各码实际用量</span>
          <Text type="secondary" style={{ fontSize: 14, fontWeight: 400 }}>
            纸样师傅按各码纸样测量填入，下单管理和裁剪管理将依此计算实际面辅料用量，拉链辅料也会自动带入
          </Text>
        </Space>
      }
      extra={
        !childReadOnly && activeSizes.length > 0 && (
          <Space>
            <Select
              mode="multiple"
              allowClear
              showSearch
              placeholder="新增尺码(多选)"
              style={{ minWidth: 160 }}
              options={sizeOptions.filter(o => !activeSizes.includes(o.value))}
              value={[]}
              onChange={(values: string[]) => onAddSizes(values)}
              filterOption={(input, option) =>
                String(option?.value || '').toLowerCase().includes(String(input || '').toLowerCase())
              }
              onSearch={(value) => {
                const trimmed = value && value.trim();
                if (sizeSearchTimerRef.current) clearTimeout(sizeSearchTimerRef.current);
                sizeSearchTimerRef.current = setTimeout(() => {
                  if (trimmed && !sizeOptions.some(opt => opt.value === trimmed) && !activeSizes.includes(trimmed)) {
                    setSizeOptions(prev => [...prev, { value: trimmed, label: trimmed }]);
                  }
                }, 300);
              }}
              popupRender={(menu) => (
                <>
                  {menu}
                  <div style={{ padding: '8px', borderTop: '1px solid var(--color-border-light)' }}>
                    <Input
                      placeholder="输入新码数后回车添加"
                      onPressEnter={(e) => {
                        const input = e.target as HTMLInputElement;
                        const val = input.value.trim();
                        if (val && !activeSizes.includes(val)) {
                          onAddSizes([val]);
                          input.value = '';
                        }
                      }}
                    />
                  </div>
                </>
              )}
            />
            <Button
              type="primary"
              loading={savingUsage}
              onClick={onSaveUsage}
            >
              保存各码用量
            </Button>
          </Space>
        )
      }
    >
      {activeSizes.length === 0 ? (
        <Text type="secondary">款式未配置码数，请先在基本信息中填写码数配置</Text>
      ) : (
        <Spin spinning={bomLoading}>
          {bomList.length === 0 && !bomLoading ? (
            <Text type="secondary">BOM清单中暂无面料/里料，请先在BOM清单中添加面辅料</Text>
          ) : (
            <ResizableTable<PatternMaterialRow>
              storageKey="style-pattern-usage-table"
              rowKey={(r) => r.id}
              dataSource={patternRows}
              columns={usageColumns}
              pagination={false}
              emptyDescription="暂无数据"
              scroll={{ x: 'max-content' }}
            />
          )}
        </Spin>
      )}
    </Card>
  );
};

export default PatternUsageCard;
