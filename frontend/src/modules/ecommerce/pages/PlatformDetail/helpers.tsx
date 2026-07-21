import React from 'react';
import { ApiOutlined, CloudOutlined, ShopOutlined } from '@ant-design/icons';
import type { CredentialGuide } from './types';

export const IconMap: Record<string, React.ReactNode> = {
  cloud: <CloudOutlined />, shop: <ShopOutlined />,
  tb: <ApiOutlined />, dy: <ApiOutlined />, jd: <ApiOutlined />,
  tm: <ApiOutlined />, pdd: <ApiOutlined />, xhs: <ApiOutlined />,
  wx: <ApiOutlined />, sf: <ApiOutlined />,
};

export const renderIcon = (iconName: string): React.ReactNode => IconMap[iconName] || <ApiOutlined />;

export const STATUS_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '待付款', color: 'default' }, 1: { label: '待发货', color: 'orange' },
  2: { label: '已发货', color: 'blue' }, 3: { label: '已完成', color: 'green' },
  4: { label: '已取消', color: 'red' }, 5: { label: '退款中', color: 'magenta' },
};

export const WH_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '待拣货', color: 'default' }, 1: { label: '备货中', color: 'orange' },
  2: { label: '已出库', color: 'green' },
};

export const CREDENTIAL_GUIDES: Record<string, CredentialGuide> = {
  JST: {
    title: '如何获取聚水潭应用凭证？',
    steps: [
      { title: '登录聚水潭开放平台', description: '打开 open.jushuitan.com，使用企业账号登录' },
      { title: '创建应用', description: '进入「开发者中心」→「应用管理」→「创建应用」，选择"自研ERP对接"' },
      { title: '获取凭证', description: '应用审核通过后，复制应用标识和密钥' },
      { title: '填写到本系统', description: '将应用标识和密钥填入下方表单' },
      { title: '授权店铺数据', description: '在聚水潭中授权需要同步的店铺' },
    ],
    docUrl: 'https://open.jushuitan.com',
  },
  SHEIN: {
    title: '如何获取希音接口密钥？',
    steps: [
      { title: '登录希音开放平台', description: '打开 developer.shein.com，注册企业账号' },
      { title: '创建应用', description: '进入「应用管理」→「创建应用」' },
      { title: '获取凭证', description: '应用审核通过后，复制 API Key 和 API Secret' },
      { title: '填写到本系统', description: '将凭证填入下方表单' },
    ],
    docUrl: 'https://developer.shein.com',
  },
  DEFAULT: {
    title: '如何获取平台接口凭证？',
    steps: [
      { title: '打开平台开放平台', description: '登录该平台的开放平台/开发者中心' },
      { title: '创建应用/获取密钥', description: '创建对接应用，获取应用标识和密钥' },
      { title: '填写到本系统', description: '将凭证填入下方表单' },
      { title: '配置回调地址', description: '将本系统回调地址配置到平台中' },
    ],
    docUrl: '',
  },
};
