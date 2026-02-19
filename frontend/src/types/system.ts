// 系统功能模块类型定义

export interface User extends Record<string, unknown> {
  id?: string;
  username: string;
  password?: string;
  name: string;
  roleId: string;
  roleName: string;
  permissionRange: string;
  status: 'active' | 'inactive';
  operationRemark?: string;
  phone?: string;
  email?: string;
  createTime?: string;
  updateTime?: string;
  lastLoginTime?: string;
  lastLoginIp?: string;
}

export interface Role {
  id?: string;
  roleName: string;
  roleCode: string;
  description?: string;
  status: 'active' | 'inactive';
  operationRemark?: string;
  createTime?: string;
  updateTime?: string;
  permissions?: Permission[];
  dataScope?: 'all' | 'brand' | 'department' | 'custom';
  dataScopeBrands?: string[];
  dataScopeDepartments?: string[];
}

export interface Permission {
  id?: string;
  permissionName: string;
  permissionCode: string;
  module?: string;
  description?: string;
  permissionType: 'menu' | 'button';
  path?: string;
  component?: string;
  icon?: string;
  sort: number;
  status: 'active' | 'inactive';
  createTime?: string;
  updateTime?: string;
  parentName?: string;
}

export interface LoginLog {
  id?: string;
  username: string;
  name: string;
  ip: string;
  loginTime: string;
  loginStatus: 'success' | 'failure';
  message?: string;
  userAgent?: string;
}

export interface Factory extends Record<string, unknown> {
  id?: string;
  factoryCode: string;
  factoryName: string;
  contactPerson?: string;
  contactPhone?: string;
  address?: string;
  status: 'active' | 'inactive';
  operationRemark?: string;
  createTime?: string;
  updateTime?: string;
}

export interface UserQueryParams {
  username?: string;
  name?: string;
  roleName?: string;
  status?: string;
  page: number;
  pageSize: number;
}

export interface RoleQueryParams {
  roleName?: string;
  roleCode?: string;
  status?: string;
  page: number;
  pageSize: number;
}

export interface LoginLogQueryParams extends Record<string, unknown> {
  username?: string;
  loginStatus?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

export interface FactoryQueryParams extends Record<string, unknown> {
  factoryCode?: string;
  factoryName?: string;
  status?: string;
  page: number;
  pageSize: number;
}

export interface PermissionQueryParams {
  module?: string;
  permissionCode?: string;
  permissionName?: string;
  page: number;
  pageSize: number;
}

export interface UserListResponse {
  list: User[];
  total: number;
  page: number;
  pageSize: number;
}
