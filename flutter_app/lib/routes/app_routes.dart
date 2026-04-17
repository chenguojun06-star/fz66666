import 'package:get/get.dart';
import '../pages/main_shell.dart';
import '../pages/login/login_binding.dart';
import '../pages/login/login_page.dart';
import '../pages/home/home_binding.dart';
import '../pages/home/home_page.dart';
import '../pages/work/work_binding.dart';
import '../pages/work/work_page.dart';
import '../pages/scan/scan_binding.dart';
import '../pages/scan/scan_page.dart';
import '../pages/admin/admin_binding.dart';
import '../pages/admin/admin_page.dart';
import '../pages/register/register_binding.dart';
import '../pages/register/register_page.dart';
import '../pages/dashboard/dashboard_binding.dart';
import '../pages/dashboard/dashboard_page.dart';
import '../pages/cutting/cutting_binding.dart';
import '../pages/cutting/cutting_page.dart';
import '../pages/procurement/procurement_binding.dart';
import '../pages/procurement/procurement_page.dart';
import '../pages/warehouse/warehouse_binding.dart';
import '../pages/warehouse/warehouse_page.dart';
import '../pages/payroll/payroll_binding.dart';
import '../pages/payroll/payroll_page.dart';
import '../pages/scan_history/scan_history_binding.dart';
import '../pages/scan_history/scan_history_page.dart';
import '../pages/scan_pattern/scan_pattern_binding.dart';
import '../pages/scan_pattern/scan_pattern_page.dart';
import '../pages/scan_rescan/scan_rescan_binding.dart';
import '../pages/scan_rescan/scan_rescan_page.dart';
import '../pages/scan_result/scan_result_binding.dart';
import '../pages/scan_result/scan_result_page.dart';
import '../pages/scan_confirm/scan_confirm_binding.dart';
import '../pages/scan_confirm/scan_confirm_page.dart';
import '../pages/scan_quality/scan_quality_binding.dart';
import '../pages/scan_quality/scan_quality_page.dart';
import '../pages/work_inbox/work_inbox_binding.dart';
import '../pages/work_inbox/work_inbox_page.dart';
import '../pages/work_ai/work_ai_binding.dart';
import '../pages/work_ai/work_ai_page.dart';
import '../pages/bundle_split/bundle_split_binding.dart';
import '../pages/bundle_split/bundle_split_page.dart';
import '../pages/admin_approval/admin_approval_binding.dart';
import '../pages/admin_approval/admin_approval_page.dart';
import '../pages/admin_password/admin_password_binding.dart';
import '../pages/admin_password/admin_password_page.dart';
import '../pages/admin_feedback/admin_feedback_binding.dart';
import '../pages/admin_feedback/admin_feedback_page.dart';
import '../pages/admin_invite/admin_invite_binding.dart';
import '../pages/admin_invite/admin_invite_page.dart';
import '../pages/privacy/privacy_binding.dart';
import '../pages/privacy/privacy_page.dart';

class AppRoutes {
  static const login = '/login';
  static const home = '/home';
  static const work = '/work';
  static const scan = '/scan';
  static const admin = '/admin';
  static const register = '/register';
  static const dashboard = '/dashboard';
  static const cutting = '/cutting';
  static const procurement = '/procurement';
  static const warehouse = '/warehouse';
  static const payroll = '/payroll';
  static const scanHistory = '/scan/history';
  static const scanPattern = '/scan/pattern';
  static const scanRescan = '/scan/rescan';
  static const scanResult = '/scan/result';
  static const scanConfirm = '/scan/confirm';
  static const scanQuality = '/scan/quality';
  static const workInbox = '/work/inbox';
  static const workAi = '/work/ai';
  static const bundleSplit = '/work/bundle-split';
  static const adminApproval = '/admin/approval';
  static const adminPassword = '/admin/password';
  static const adminFeedback = '/admin/feedback';
  static const adminInvite = '/admin/invite';
  static const privacy = '/privacy';
}

class AppPages {
  static final pages = [
    GetPage(name: AppRoutes.login, page: () => const LoginPage(), binding: LoginBinding()),
    GetPage(name: AppRoutes.home, page: () => const MainShell(), binding: HomeBinding()),
    GetPage(name: AppRoutes.register, page: () => const RegisterPage(), binding: RegisterBinding()),
    GetPage(name: AppRoutes.dashboard, page: () => const DashboardPage(), binding: DashboardBinding()),
    GetPage(name: AppRoutes.cutting, page: () => const CuttingPage(), binding: CuttingBinding()),
    GetPage(name: AppRoutes.procurement, page: () => const ProcurementPage(), binding: ProcurementBinding()),
    GetPage(name: AppRoutes.warehouse, page: () => const WarehousePage(), binding: WarehouseBinding()),
    GetPage(name: AppRoutes.payroll, page: () => const PayrollPage(), binding: PayrollBinding()),
    GetPage(name: AppRoutes.scanHistory, page: () => const ScanHistoryPage(), binding: ScanHistoryBinding()),
    GetPage(name: AppRoutes.scanPattern, page: () => const ScanPatternPage(), binding: ScanPatternBinding()),
    GetPage(name: AppRoutes.scanRescan, page: () => const ScanRescanPage(), binding: ScanRescanBinding()),
    GetPage(name: AppRoutes.scanResult, page: () => const ScanResultPage(), binding: ScanResultBinding()),
    GetPage(name: AppRoutes.scanConfirm, page: () => const ScanConfirmPage(), binding: ScanConfirmBinding()),
    GetPage(name: AppRoutes.scanQuality, page: () => const ScanQualityPage(), binding: ScanQualityBinding()),
    GetPage(name: AppRoutes.workInbox, page: () => const WorkInboxPage(), binding: WorkInboxBinding()),
    GetPage(name: AppRoutes.workAi, page: () => const WorkAiPage(), binding: WorkAiBinding()),
    GetPage(name: AppRoutes.bundleSplit, page: () => const BundleSplitPage(), binding: BundleSplitBinding()),
    GetPage(name: AppRoutes.adminApproval, page: () => const AdminApprovalPage(), binding: AdminApprovalBinding()),
    GetPage(name: AppRoutes.adminPassword, page: () => const AdminPasswordPage(), binding: AdminPasswordBinding()),
    GetPage(name: AppRoutes.adminFeedback, page: () => const AdminFeedbackPage(), binding: AdminFeedbackBinding()),
    GetPage(name: AppRoutes.adminInvite, page: () => const AdminInvitePage(), binding: AdminInviteBinding()),
    GetPage(name: AppRoutes.privacy, page: () => const PrivacyPage(), binding: PrivacyBinding()),
  ];
}
