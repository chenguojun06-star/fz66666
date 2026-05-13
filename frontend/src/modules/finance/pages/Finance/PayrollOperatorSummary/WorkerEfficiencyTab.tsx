import React from 'react';
import { Button, Progress, Tag } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import type { WorkerEfficiencyItem } from '@/services/intelligence/intelligenceApi';
import { readPageSize } from '@/utils/pageSizeStore';

const TREND_ICON: Record<string, { icon: string; color: string }> = {
    up:   { icon: '↑', color: '#52c41a' },
    down: { icon: '↓', color: '#ff4d4f' },
    flat: { icon: '→', color: '#8c8c8c' },
};

function ScoreCell({ value }: { value: number }) {
    const color = value >= 80 ? '#52c41a' : value >= 60 ? '#faad14' : '#ff4d4f';
    return (
        <span style={{ fontVariantNumeric: 'tabular-nums', color, fontWeight: 600 }}>
            {value}
        </span>
    );
}

interface WorkerEfficiencyTabProps {
    list: WorkerEfficiencyItem[];
    loading: boolean;
    onRefresh: () => void;
}

const WorkerEfficiencyTab: React.FC<WorkerEfficiencyTabProps> = ({ list, loading, onRefresh }) => {
    const columns = [
        {
            title: '排名', key: 'rank', width: 60, align: 'center' as const,
            render: (_: unknown, __: unknown, idx: number) => {
                if (idx === 0) return <Tag color="gold"> 1</Tag>;
                if (idx === 1) return <Tag color="silver"> 2</Tag>;
                if (idx === 2) return <Tag color="orange"> 3</Tag>;
                return <span style={{ color: '#8c8c8c' }}>{idx + 1}</span>;
            },
        },
        {
            title: '姓名', dataIndex: 'workerName', key: 'name', width: 100, ellipsis: true,
        },
        {
            title: '综合得分', dataIndex: 'overallScore', key: 'overall', width: 160,
            render: (v: number) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Progress
                        percent={v ?? 0}
                       
                        strokeColor={v >= 80 ? '#52c41a' : v >= 60 ? '#faad14' : '#ff4d4f'}
                        format={() => <span style={{ fontSize: 11 }}>{v}</span>}
                        style={{ flex: 1, minWidth: 80 }}
                    />
                </div>
            ),
        },
        { title: '速度', dataIndex: 'speedScore',       key: 'speed',       width: 64, align: 'center' as const, render: (v: number) => <ScoreCell value={v ?? 0} /> },
        { title: '质量', dataIndex: 'qualityScore',     key: 'quality',     width: 64, align: 'center' as const, render: (v: number) => <ScoreCell value={v ?? 0} /> },
        { title: '稳定', dataIndex: 'stabilityScore',   key: 'stability',   width: 64, align: 'center' as const, render: (v: number) => <ScoreCell value={v ?? 0} /> },
        { title: '出勤', dataIndex: 'attendanceScore',  key: 'attendance',  width: 64, align: 'center' as const, render: (v: number) => <ScoreCell value={v ?? 0} /> },
        { title: '多面', dataIndex: 'versatilityScore', key: 'versatility', width: 64, align: 'center' as const, render: (v: number) => <ScoreCell value={v ?? 0} /> },
        {
            title: '最擅长工序', dataIndex: 'bestProcess', key: 'bestProcess', width: 120, ellipsis: true,
            render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '-',
        },
        {
            title: '日均产量', dataIndex: 'dailyAvgOutput', key: 'output', width: 90, align: 'right' as const,
            render: (v: number) => v != null ? `${v.toFixed(1)} 件` : '-',
        },
        {
            title: '近7天', dataIndex: 'trend', key: 'trend', width: 70, align: 'center' as const,
            render: (v: string) => {
                const t = TREND_ICON[v] ?? TREND_ICON.flat;
                return <span style={{ color: t.color, fontWeight: 700, fontSize: 16 }}>{t.icon}</span>;
            },
        },
    ];

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <Button onClick={onRefresh} loading={loading}>刷新</Button>
            </div>
            <ResizableTable
                storageKey="finance-worker-efficiency"
                rowKey={(r: Record<string, unknown>) => String(r?.workerId ?? r?.workerName ?? '')}
                columns={columns}
                dataSource={list as any}
                loading={loading}
                pagination={{ showTotal: (t) => `共 ${t} 人`, defaultPageSize: readPageSize(50), showSizeChanger: true }}
                scroll={{ x: 900 }}
               
            />
        </>
    );
};

export default WorkerEfficiencyTab;
