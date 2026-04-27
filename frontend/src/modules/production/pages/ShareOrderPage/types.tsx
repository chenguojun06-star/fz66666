import React from 'react';
import { InboxOutlined, ScissorOutlined, SkinOutlined, AuditOutlined, DeploymentUnitOutlined } from '@ant-design/icons';

export type StageStatus = 'DONE' | 'ACTIVE' | 'PENDING';

export const PLATFORM_URL = import.meta.env.VITE_PLATFORM_URL || window.location.origin;

export interface ShareOrderData {
  orderNo: string;
  styleNo: string;
  styleName?: string;
  styleCover?: string;
  color?: string;
  size?: string;
  orderQuantity: number;
  completedQuantity?: number;
  productionProgress?: number;
  statusText: string;
  plannedEndDate?: string;
  actualEndDate?: string;
  createTime?: string;
  latestScanTime?: string;
  latestScanStage?: string;
  factoryName?: string;
  companyName?: string;
  expiresAt?: number;
  remarks?: string;
  currentStage?: string;
  sizeQuantities?: Array<{ size: string; quantity?: number }>;
  colorSizeQuantities?: Array<{ color?: string; size?: string; quantity?: number }>;
  stages?: Array<{ stageName: string; rate: number; status: StageStatus }>;
  recentScans?: Array<{ processName?: string; quantity?: number; scanTime?: string }>;
  aiPrediction?: {
    predictedFinishDate?: string;
    estimatedRemainingDays?: number;
    confidence?: number;
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    riskReason?: string;
  };
}

export const statusColorMap: Record<string, string> = {
  '待开始': 'default',
  '生产中': 'processing',
  '已完成': 'success',
  '延期中': 'error',
  '已关单': 'default',
};

export const stageIconMap: Record<string, React.ReactNode> = {
  '采购备料': <InboxOutlined />,
  '裁剪': <ScissorOutlined />,
  '车缝': <SkinOutlined />,
  '质检': <AuditOutlined />,
  '入库': <DeploymentUnitOutlined />,
  '包装': <InboxOutlined />,
};
