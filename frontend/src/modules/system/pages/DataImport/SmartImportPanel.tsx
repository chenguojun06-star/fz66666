import React, { useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Select, Space, Tag, Typography } from 'antd';
import {
  ThunderboltOutlined,
  UploadOutlined,
  FileExcelOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { message } from '@/utils/antdStatic';
import { dataImportService } from '@/services/system/dataImport';
import type { ImportResult, SmartMapResult } from '@/services/system/dataImport';
import { validateExcelFile, toUploadFile } from './helpers';
import type { TabConfig } from './types';

const { Text, Paragraph } = Typography;

/**
 * 智能导入面板（D-751 二期）：不要求按模板整理，任意格式 Excel 上传后
 * 展示「源列 → 系统字段」映射建议（规则+AI），用户可逐列纠正后确认导入。
 * 必填目标列未映射时前端先拦一道，后端还有同款校验兜底。
 */
const SmartImportPanel: React.FC<{ config: TabConfig }> = ({ config }) => {
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [smart, setSmart] = useState<SmartMapResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);

  const requiredFields = useMemo(
    () => smart?.canonicalFields.filter((f) => f.endsWith('*')) ?? [],
    [smart]
  );
  const missingRequired = useMemo(() => {
    const covered = new Set(Object.values(mapping).filter(Boolean));
    return requiredFields.filter((f) => !covered.has(f));
  }, [requiredFields, mapping]);

  const resetAll = () => {
    setFile(null);
    setSmart(null);
    setMapping({});
    setResult(null);
  };

  const handleDetect = async () => {
    if (!file) {
      message.warning('请先选择 Excel 文件');
      return;
    }
    setDetecting(true);
    setResult(null);
    try {
      const res = await dataImportService.smartMap(config.key, file);
      setSmart(res);
      const initial: Record<string, string> = {};
      Object.entries(res.mapping).forEach(([header, target]) => {
        if (target) initial[header] = target;
      });
      setMapping(initial);
      message.success(`已识别 ${res.headers.length} 列，请确认映射后导入（共 ${res.totalRows} 行）`);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '表头识别失败，请检查文件');
    } finally {
      setDetecting(false);
    }
  };

  const handleImport = async () => {
    if (!file || !smart) return;
    if (missingRequired.length > 0) {
      message.error(`必填字段未映射：${missingRequired.join('、')}`);
      return;
    }
    setImporting(true);
    try {
      const res = await dataImportService.uploadMapped(config.key, file, mapping);
      setResult(res);
      if (res.failedCount === 0) {
        message.success(res.message);
      } else {
        message.warning(res.message);
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '导入失败，请检查文件');
    } finally {
      setImporting(false);
    }
  };

  const failedColumns = [
    { title: '行号', dataIndex: 'row', key: 'row', width: 80 },
    ...(config.failedColumns ?? []),
    {
      title: '错误原因',
      dataIndex: 'error',
      key: 'error',
      render: (text: string) => <Text type="danger">{text}</Text>,
    },
  ];

  const sampleColumns = (smart?.headers ?? []).map((h) => ({
    title: h,
    dataIndex: h,
    key: h,
    width: 140,
    ellipsis: true,
  }));
  const sampleData = (smart?.samples ?? []).map((cells, i) => {
    const row: Record<string, unknown> = { key: i };
    smart?.headers.forEach((h, idx) => {
      row[h] = cells[idx];
    });
    return row;
  });

  return (
    <div>
      <Card style={{ marginBottom: 16, background: 'var(--color-slate-50)' }}>
        <Paragraph style={{ marginBottom: 8 }}>
          <ThunderboltOutlined style={{ color: 'var(--color-brand-500, #1677ff)', marginRight: 6 }} />
          <Text strong>智能识别：不用按模板整理，把老系统导出的表格直接上传</Text>
        </Paragraph>
        <Paragraph style={{ marginBottom: 2, paddingLeft: 12 }}>
          <Text type="secondary">• 系统自动识别每列对应的字段（AI 辅助），识别结果可逐列修改</Text>
        </Paragraph>
        <Paragraph style={{ marginBottom: 2, paddingLeft: 12 }}>
          <Text type="secondary">• 必填字段：{config.requiredFields}——没识别到的列可在下拉里手动指定</Text>
        </Paragraph>
        <Paragraph style={{ marginBottom: 0, paddingLeft: 12 }}>
          <Text type="secondary">• 确认映射后才真正导入，识别错了不会直接进库</Text>
        </Paragraph>
      </Card>

      <Card title="第一步：上传任意格式的 Excel" style={{ marginBottom: 16 }}>
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const err = validateExcelFile(f);
              if (err) {
                message.error(err);
                if (excelInputRef.current) excelInputRef.current.value = '';
                return;
              }
              resetKeepFile(f);
              if (excelInputRef.current) excelInputRef.current.value = '';
            }}
          />
          <Space>
            <Button icon={<UploadOutlined />} onClick={() => excelInputRef.current?.click()}>
              {file ? `已选择: ${file.name}` : '选择 Excel 文件'}
            </Button>
            {file && (
              <Button
                type="primary"
                icon={<RobotOutlined />}
                loading={detecting}
                onClick={handleDetect}
              >
                {detecting ? '识别中...' : '智能识别表头'}
              </Button>
            )}
            {file && (
              <Button size="small" onClick={() => resetAll()}>
                移除
              </Button>
            )}
          </Space>
        </Space>
      </Card>

      {smart && (
        <>
          <Card title="第二步：确认列映射（识别结果可修改）" style={{ marginBottom: 16 }}>
            {missingRequired.length > 0 && (
              <Alert
                type="warning"
                showIcon
                title={`必填字段未映射：${missingRequired.join('、')}`}
                description="请在下方下拉里为这些必填字段指定来源列，或补充到 Excel 里"
                style={{ marginBottom: 12 }}
              />
            )}
            <ResizableTable
              dataSource={smart.headers.map((h) => ({ key: h, source: h }))}
              columns={[
                { title: '源列名', dataIndex: 'source', key: 'source', width: 200 },
                {
                  title: '识别依据',
                  key: 'matchedBy',
                  width: 110,
                  render: (_: unknown, record: { source: string }) => {
                    if (mapping[record.source]) {
                      return smart.matchedBy?.[record.source] === 'ai'
                        ? <Tag color="purple">AI 识别</Tag>
                        : <Tag color="blue">自动匹配</Tag>;
                    }
                    return <Tag>未映射</Tag>;
                  },
                },
                {
                  title: '导入到系统字段',
                  key: 'target',
                  render: (_: unknown, record: { source: string }) => (
                    <Select
                      style={{ width: '100%', maxWidth: 260 }}
                      allowClear
                      placeholder="不导入此列"
                      value={mapping[record.source]}
                      onChange={(v) => setMapping((prev) => {
                        const next = { ...prev };
                        if (v) next[record.source] = v;
                        else delete next[record.source];
                        return next;
                      })}
                      options={smart.canonicalFields.map((f) => ({
                        value: f,
                        label: f.endsWith('*') ? `${f.slice(0, -1)}（必填）` : f,
                      }))}
                    />
                  ),
                },
              ]}
              pagination={false}
              emptyDescription="暂无数据"
            />

            {smart.samples.length > 0 && (
              <>
                <Paragraph style={{ marginTop: 16, marginBottom: 8 }}>
                  <Text type="secondary">数据预览（前 {smart.samples.length} 行 / 共 {smart.totalRows} 行）</Text>
                </Paragraph>
                <ResizableTable
                  dataSource={sampleData}
                  columns={sampleColumns}
                  pagination={false}
                  emptyDescription="暂无数据"
                  scroll={{ x: 'max-content', y: 200 }}
                />
              </>
            )}
          </Card>

          <Card title="第三步：导入">
            <Space>
              <Button
                type="primary"
                icon={<FileExcelOutlined />}
                loading={importing}
                disabled={Object.keys(mapping).length === 0}
                onClick={handleImport}
              >
                {importing ? '导入中...' : `确认并导入（${smart.totalRows} 行）`}
              </Button>
              <Button onClick={resetAll}>重新开始</Button>
            </Space>
          </Card>
        </>
      )}

      {result && (
        <Card title="导入结果" style={{ marginTop: 16 }}>
          {result.failedCount === 0 ? (
            <Alert
              type="success"
              showIcon
              title={result.message}
              description={`共 ${result.total} 条数据，全部导入成功`}
            />
          ) : (
            <>
              <Alert
                type={result.successCount > 0 ? 'warning' : 'error'}
                showIcon
                title={result.message}
                description={
                  <Space>
                    <Tag icon={<CheckCircleOutlined />} color="success">
                      成功 {result.successCount} 条
                    </Tag>
                    <Tag icon={<CloseCircleOutlined />} color="error">
                      失败 {result.failedCount} 条
                    </Tag>
                    <Text type="secondary">（共 {result.total} 条）</Text>
                  </Space>
                }
                style={{ marginBottom: 12 }}
              />
              <ResizableTable
                dataSource={result.failedRecords as Record<string, unknown>[]}
                columns={failedColumns}
                rowKey="row"
                pagination={false}
                emptyDescription="暂无数据"
                scroll={{ y: 300 }}
              />
            </>
          )}
        </Card>
      )}
    </div>
  );

  function resetKeepFile(f: File) {
    setSmart(null);
    setMapping({});
    setResult(null);
    setFile(f);
  }
};

export default SmartImportPanel;
