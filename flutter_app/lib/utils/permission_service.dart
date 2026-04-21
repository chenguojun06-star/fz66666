import '../utils/storage_service.dart';

enum UserRole {
  admin,
  supervisor,
  purchaser,
  cutter,
  sewing,
  packager,
  quality,
  warehouse,
  unknown,
}

enum DataScope { all, team, own }

enum ScanType {
  cutting,
  production,
  quality,
  warehouse,
  sample,
}

class PermissionService {
  final StorageService _storage = StorageService();

  UserRole get currentUserRole {
    final code = _storage.getUserRole().toLowerCase();
    switch (code) {
      case 'admin':
      case '管理员':
        return UserRole.admin;
      case 'supervisor':
      case '主管':
        return UserRole.supervisor;
      case 'purchaser':
      case '采购':
        return UserRole.purchaser;
      case 'cutter':
      case '裁剪':
        return UserRole.cutter;
      case 'sewing':
      case '车缝':
        return UserRole.sewing;
      case 'packager':
      case '包装':
        return UserRole.packager;
      case 'quality':
      case '质检':
        return UserRole.quality;
      case 'warehouse':
      case '仓库':
        return UserRole.warehouse;
      default:
        return UserRole.unknown;
    }
  }

  DataScope get dataScope {
    switch (currentUserRole) {
      case UserRole.admin:
      case UserRole.supervisor:
        return DataScope.all;
      case UserRole.purchaser:
      case UserRole.cutter:
      case UserRole.quality:
      case UserRole.warehouse:
        return DataScope.team;
      default:
        return DataScope.own;
    }
  }

  bool get isAdmin => currentUserRole == UserRole.admin;
  bool get isSupervisor => currentUserRole == UserRole.supervisor;
  bool get isManagement => isAdmin || isSupervisor || _storage.isTenantOwner();

  bool canAccessNode(String node) {
    final role = currentUserRole;
    switch (node) {
      case 'procurement':
        return role == UserRole.admin || role == UserRole.supervisor || role == UserRole.purchaser;
      case 'cutting':
        return role == UserRole.admin || role == UserRole.supervisor || role == UserRole.cutter;
      case 'sewing':
        return role == UserRole.admin || role == UserRole.supervisor || role == UserRole.sewing;
      case 'quality':
        return role == UserRole.admin || role == UserRole.supervisor || role == UserRole.quality;
      case 'warehousing':
        return role == UserRole.admin || role == UserRole.supervisor || role == UserRole.warehouse || role == UserRole.packager;
      default:
        return true;
    }
  }

  List<ScanType> getAllowedScanTypes() {
    final role = currentUserRole;
    final types = <ScanType>[];

    if (role == UserRole.admin || role == UserRole.supervisor) {
      return ScanType.values;
    }

    if (role == UserRole.purchaser) {
      types.addAll([ScanType.production]);
    }
    if (role == UserRole.cutter) {
      types.addAll([ScanType.cutting]);
    }
    if (role == UserRole.sewing) {
      types.addAll([ScanType.production]);
    }
    if (role == UserRole.quality) {
      types.addAll([ScanType.quality]);
    }
    if (role == UserRole.warehouse || role == UserRole.packager) {
      types.addAll([ScanType.warehouse, ScanType.sample]);
    }

    return types;
  }

  List<Map<String, dynamic>> filterOrders(List<Map<String, dynamic>> orders) {
    final scope = dataScope;
    if (scope == DataScope.all) return orders;

    final userId = _storage.getUserInfo()?['id']?.toString();
    final factoryId = _storage.getUserInfo()?['factoryId']?.toString();

    return orders.where((order) {
      if (scope == DataScope.team) {
        return order['factoryId']?.toString() == factoryId;
      }
      if (scope == DataScope.own) {
        return order['createdBy']?.toString() == userId || order['assigneeId']?.toString() == userId;
      }
      return true;
    }).toList();
  }

  bool hasFeaturePermission(String feature) {
    final role = currentUserRole;
    switch (feature) {
      case 'user_approval':
        return isManagement;
      case 'order_create':
        return isManagement || role == UserRole.supervisor;
      case 'order_edit':
        return isManagement;
      case 'price_adjust':
        return isAdmin || _storage.isTenantOwner();
      case 'bundle_split':
        return isManagement || role == UserRole.cutter;
      case 'dashboard':
        return isManagement;
      case 'payroll':
        return true;
      case 'feedback':
        return true;
      case 'invite':
        return isManagement;
      default:
        return true;
    }
  }

  static String roleDisplayName(UserRole role) {
    switch (role) {
      case UserRole.admin:
        return '管理员';
      case UserRole.supervisor:
        return '主管';
      case UserRole.purchaser:
        return '采购';
      case UserRole.cutter:
        return '裁剪';
      case UserRole.sewing:
        return '车缝';
      case UserRole.packager:
        return '包装';
      case UserRole.quality:
        return '质检';
      case UserRole.warehouse:
        return '仓库';
      case UserRole.unknown:
        return '未知';
    }
  }

  static String scanTypeLabel(ScanType type) {
    switch (type) {
      case ScanType.cutting:
        return '裁剪';
      case ScanType.production:
        return '生产';
      case ScanType.quality:
        return '质检';
      case ScanType.warehouse:
        return '入库';
      case ScanType.sample:
        return '样衣扫码';
    }
  }
}
