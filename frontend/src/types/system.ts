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
  /** 外发工厂ID，属于外发工厂的账号时有值 */
  factoryId?: string;
  /** 是否为外发工厂主账号（老板/联系人） */
  isFactoryOwner?: boolean;
  /** 所属组织节点ID */
  orgUnitId?: string;
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
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  supplierType?: 'MATERIAL' | 'OUTSOURCE';
  orgUnitId?: string;
  parentOrgUnitId?: string;
  parentOrgUnitName?: string;
  managerId?: string;
  dailyCapacity?: number;
  orgPath?: string;
  operationRemark?: string;
  supplierCategory?: string;
  supplierRegion?: string;
  supplierTier?: 'S' | 'A' | 'B' | 'C';
  supplierTierUpdatedAt?: string;
  admissionStatus?: 'pending' | 'approved' | 'probation' | 'rejected' | 'suspended';
  admissionDate?: string;
  qualificationCert?: string;
  contractNo?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  contractAmount?: number;
  contractTerms?: string;
  bankName?: string;
  bankAccount?: string;
  bankBranch?: string;
  onTimeDeliveryRate?: number;
  qualityScore?: number;
  completionRate?: number;
  overallScore?: number;
  totalOrders?: number;
  completedOrders?: number;
  overdueOrders?: number;
  createTime?: string;
  updateTime?: string;
}

export interface OrganizationUnit extends Record<string, unknown> {
  id?: string;
  parentId?: string;
  /** @deprecated Use unitName instead to avoid DOM node collision */
  nodeName?: string;
  unitName: string;
  category?: string;
  nodeType: 'DEPARTMENT' | 'FACTORY';
  ownerType?: 'INTERNAL' | 'EXTERNAL' | 'NONE';
  factoryId?: string;
  sortOrder?: number;
  status?: 'active' | 'inactive';
  pathIds?: string;
  pathNames?: string;
  managerUserId?: string;
  managerUserName?: string;
  children?: OrganizationUnit[];
  operationRemark?: string;
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
  supplierType?: string;
  factoryType?: string;
  parentOrgUnitId?: string;
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
