import { formatDateTime } from '@/utils/datetime';

/**
 * 备注弹窗状态类型
 */
export type RemarkModalState = {
  open: boolean;
  title: string;
  okText: string;
  okDanger: boolean;
  onConfirm: (remark: string) => Promise<void>;
};

/**
 * 构建表单验证规则
 * @param isEditMode 是否编辑模式（编辑时密码非必填）
 */
export function buildFormRules(isEditMode: boolean) {
  return {
    username: [
      { required: true, message: '请输入用户名', trigger: ['change', 'blur'] },
      { min: 3, max: 20, message: '用户名长度在 3 到 20 个字符', trigger: ['change', 'blur'] }
    ],
    name: [
      { required: true, message: '请输入姓名', trigger: ['change', 'blur'] },
      { max: 20, message: '姓名长度不超过 20 个字符', trigger: ['change', 'blur'] }
    ],
    password: [
      { required: !isEditMode, message: '请输入密码', trigger: ['change', 'blur'] },
      { min: 6, max: 20, message: '密码长度在 6 到 20 个字符', trigger: ['change', 'blur'] }
    ],
    roleId: [
      { required: true, message: '请选择角色', trigger: ['change', 'blur'] }
    ],
    permissionRange: [
      { required: true, message: '请选择权限范围', trigger: ['change', 'blur'] }
    ],
    status: [
      { required: true, message: '请选择状态', trigger: ['change', 'blur'] }
    ],
    phone: [
      { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号', trigger: ['change', 'blur'] }
    ],
    email: [
      { type: 'email' as const, message: '请输入正确的邮箱地址', trigger: ['change', 'blur'] }
    ]
  };
}

/**
 * 操作日志表格列定义
 */
export const LOG_COLUMNS = [
  {
    title: '动作',
    dataIndex: 'action',
    key: 'action',
    width: 120,
    render: (v: string) => v || '-',
  },
  {
    title: '操作人',
    dataIndex: 'operator',
    key: 'operator',
    width: 120,
    render: (v: string) => v || '-',
  },
  {
    title: '原因',
    dataIndex: 'remark',
    key: 'remark',
    render: (v: string) => v || '-',
  },
  {
    title: '时间',
    dataIndex: 'createTime',
    key: 'createTime',
    width: 180,
    render: (v: string) => formatDateTime(v),
  },
];

/**
 * 将权限树转换为按模块分组的结构
 * @param permTree 权限树原始数据
 */
export function buildPermissionsByModule(permTree: any[]) {
  return (permTree || []).map((topNode: any) => {
    const groups: Array<{ groupId: number; groupName: string; buttons: any[] }> = [];
    const directButtons: any[] = [];
    for (const child of (topNode.children || [])) {
      const cType = String(child.permissionType || '').toLowerCase();
      if (cType === 'menu') {
        groups.push({
          groupId: Number(child.id),
          groupName: String(child.permissionName || ''),
          buttons: (child.children || []).map((btn: any) => ({
            id: Number(btn.id),
            name: String(btn.permissionName || ''),
          })),
        });
      } else {
        directButtons.push({ id: Number(child.id), name: String(child.permissionName || '') });
      }
    }
    return {
      moduleId: Number(topNode.id),
      moduleName: String(topNode.permissionName || ''),
      groups,
      directButtons,
    };
  });
}
