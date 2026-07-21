import { User as UserType } from '@/types/system';

/**
 * 人员统计结果
 */
export interface UserStats {
  internal: number;
  externalFactory: number;
  supplier: number;
  activeCount: number;
}

/**
 * 根据用户列表计算人员统计（内部 / 外发工厂 / 供应商 / 启用数）
 * 优先用 permissionRange 和 factoryId 判断用户类型，更准确
 */
export function computeUserStats(userList: UserType[]): UserStats {
  let internal = 0;
  let externalFactory = 0;
  let supplier = 0;
  let activeCount = 0;

  userList.forEach((u) => {
    const permRange = String(u.permissionRange || '').toLowerCase();
    const roleName = String(u.roleName || '').toLowerCase();
    const roleCode = String((u as any).roleCode || '').toLowerCase();
    const factoryId = u.factoryId;
    const isFactoryOwner = u.isFactoryOwner;

    // 判断是否为外发工厂用户：有factoryId 或 permissionRange包含external/factory
    const isExternalFactory = (factoryId && String(factoryId).length > 0) ||
                               isFactoryOwner ||
                               permRange.includes('external') ||
                               permRange.includes('factory') ||
                               roleName.includes('factory') ||
                               roleName.includes('外发') ||
                               roleName.includes('外包') ||
                               roleCode.includes('factory_owner') ||
                               roleCode.includes('external');

    // 判断是否为供应商用户
    const isSupplier = permRange.includes('supplier') ||
                       roleName.includes('supplier') ||
                       roleName.includes('vendor') ||
                       roleName.includes('供应商') ||
                       roleName.includes('面辅料') ||
                       roleName.includes('物料');

    if (isExternalFactory && !isSupplier) {
      externalFactory++;
    } else if (isSupplier) {
      supplier++;
    } else {
      // 其他默认为内部员工
      internal++;
    }

    if (String(u.status || 'active') === 'active') {
      activeCount++;
    }
  });

  return { internal, externalFactory, supplier, activeCount };
}
