import 'package:dio/dio.dart';
import 'package:get/get.dart' hide Response, FormData, MultipartFile;
import 'http_service.dart';

class ApiService extends GetxService {
  final HttpService _http = Get.find<HttpService>();

  // ===== System =====
  Future<Response> login(Map<String, dynamic> data) =>
      _http.post('/api/system/user/login', data: data);

  Future<Response> getMe() => _http.get('/api/system/user/me');

  Future<Response> listPendingUsers() =>
      _http.get('/api/system/user/pending');

  Future<Response> approveUser(String userId, [Map<String, dynamic>? data]) =>
      _http.post('/api/system/user/$userId/approval-action?action=approve', data: data ?? {});

  Future<Response> rejectUser(String userId, [Map<String, dynamic>? data]) =>
      _http.post('/api/system/user/$userId/approval-action?action=reject', data: data ?? {});

  Future<Response> listRoles() => _http.get('/api/system/role/list');

  Future<Response> getOnlineCount() =>
      _http.get('/api/system/user/online-count');

  Future<Response> changePassword(Map<String, dynamic> data) =>
      _http.post('/api/system/user/me/change-password', data: data);

  Future<Response> submitFeedback(Map<String, dynamic> data) =>
      _http.post('/api/system/feedback/submit', data: data);

  Future<Response> myFeedbackList([Map<String, dynamic>? params]) =>
      _http.post('/api/system/feedback/my-list', data: params ?? {});

  Future<Response> getDictList(String type) =>
      _http.get('/api/system/dict/by-type', params: {'type': type});

  // ===== Tenant =====
  Future<Response> tenantPublicList() =>
      _http.get('/api/system/tenant/public-list');

  Future<Response> myTenant() => _http.get('/api/system/tenant/my');

  Future<Response> workerRegister(Map<String, dynamic> data) =>
      _http.post('/api/system/tenant/registration/register', data: data);

  Future<Response> listPendingRegistrations() =>
      _http.post('/api/system/tenant/registrations/pending');

  Future<Response> approveRegistration(String id, [Map<String, dynamic>? data]) =>
      _http.post('/api/system/tenant/registrations/$id/approve', data: data ?? {});

  Future<Response> rejectRegistration(String id, [Map<String, dynamic>? data]) =>
      _http.post('/api/system/tenant/registrations/$id/reject', data: data ?? {});

  // ===== Factory =====
  Future<Response> listFactories([Map<String, dynamic>? params]) =>
      _http.get('/api/system/factory/list', params: params);

  Future<Response> listFactoryWorkers(String factoryId) =>
      _http.get('/api/factory-worker/list', params: {'factoryId': factoryId});

  // ===== Production =====
  Future<Response> listOrders([Map<String, dynamic>? params]) =>
      _http.get('/api/production/order/list', params: params);

  Future<Response> createOrder(Map<String, dynamic> data) =>
      _http.post('/api/production/order', data: data);

  Future<Response> orderDetail(String idOrNo) =>
      _http.get('/api/production/order/detail/$idOrNo');

  Future<Response> updateProgress(Map<String, dynamic> data) =>
      _http.post('/api/production/order/update-progress', data: data);

  Future<Response> quickEditOrder(Map<String, dynamic> data) =>
      _http.put('/api/production/order/quick-edit', data: data);

  Future<Response> listWarehousing([Map<String, dynamic>? params]) =>
      _http.get('/api/production/warehousing/list', params: params);

  Future<Response> saveWarehousing(Map<String, dynamic> data) =>
      _http.post('/api/production/warehousing', data: data);

  Future<Response> listScans([Map<String, dynamic>? params]) =>
      _http.get('/api/production/scan/list', params: params);

  Future<Response> myScanHistory([Map<String, dynamic>? params]) =>
      _http.get('/api/production/scan/list', params: {'currentUser': 'true', ...?params});

  Future<Response> personalScanStats([Map<String, dynamic>? params]) =>
      _http.get('/api/production/scan/personal-stats', params: params);

  Future<Response> executeScan(Map<String, dynamic> data) =>
      _http.post('/api/production/scan/execute', data: data);

  Future<Response> undoScan(Map<String, dynamic> data) =>
      _http.post('/api/production/scan/undo', data: data);

  Future<Response> rescanApi(Map<String, dynamic> data) =>
      _http.post('/api/production/scan/rescan', data: data);

  Future<Response> getProcessConfig(String orderNo) =>
      _http.get('/api/production/scan/process-config/$orderNo');

  Future<Response> rollbackByBundle(Map<String, dynamic> data) =>
      _http.post('/api/production/warehousing/rollback-by-bundle', data: data);

  // ===== Purchase =====
  Future<Response> receivePurchase(Map<String, dynamic> data) =>
      _http.post('/api/production/purchase/receive', data: data);

  Future<Response> createPurchaseInstruction(Map<String, dynamic> data) =>
      _http.post('/api/production/purchase/instruction', data: data);

  Future<Response> getMaterialPurchases([Map<String, dynamic>? params]) =>
      _http.get('/api/production/purchase/list', params: params);

  Future<Response> myProcurementTasks() =>
      _http.get('/api/production/purchase/list', params: {'myTasks': 'true'});

  Future<Response> confirmReturnPurchase(Map<String, dynamic> data) =>
      _http.post('/api/production/purchase/return-confirm', data: data);

  Future<Response> confirmProcurementComplete(Map<String, dynamic> data) =>
      _http.post('/api/production/order/confirm-procurement', data: data);

  // ===== Cutting =====
  Future<Response> myCuttingTasks() =>
      _http.get('/api/production/cutting-task/list', params: {'myTasks': 'true'});

  Future<Response> getCuttingBundle(String orderNo, [String? bundleNo]) =>
      _http.get('/api/production/cutting/list', params: {'orderNo': orderNo, if (bundleNo != null) 'bundleNo': bundleNo});

  Future<Response> generateCuttingBundles(String orderId, List<dynamic> bundles) =>
      _http.post('/api/production/cutting/generate', data: {'orderId': orderId, 'bundles': bundles});

  Future<Response> listBundles(String orderNo, [int page = 1, int pageSize = 100]) =>
      _http.get('/api/production/cutting/list', params: {'orderNo': orderNo, 'page': page, 'pageSize': pageSize});

  Future<Response> getBundleByCode(String qrCode) =>
      _http.get('/api/production/cutting/by-code/$qrCode');

  Future<Response> splitTransfer(Map<String, dynamic> data) =>
      _http.post('/api/production/cutting/split-transfer', data: data);

  Future<Response> splitRollback(Map<String, dynamic> data) =>
      _http.post('/api/production/cutting/split-rollback', data: data);

  Future<Response> getBundleFamily(String bundleId) =>
      _http.get('/api/production/cutting/family/$bundleId');

  // ===== Pattern =====
  Future<Response> getPatternDetail(String patternId) =>
      _http.get('/api/production/pattern/$patternId');

  Future<Response> getPatternProcessConfig(String patternId) =>
      _http.get('/api/production/pattern/$patternId/process-config');

  Future<Response> getPatternScanRecords(String patternId) =>
      _http.get('/api/production/pattern/$patternId/scan-records');

  Future<Response> submitPatternScan(Map<String, dynamic> data) =>
      _http.post('/api/production/pattern/scan', data: data);

  Future<Response> myPatternScanHistory([Map<String, dynamic>? params]) =>
      _http.get('/api/production/pattern/scan-records/my-history', params: params);

  // ===== Quality =====
  Future<Response> myQualityTasks() =>
      _http.get('/api/production/scan/my-quality-tasks');

  Future<Response> myRepairTasks() =>
      _http.get('/api/production/warehousing/pending-repair-tasks');

  Future<Response> getQualityAiSuggestion(String orderId) =>
      _http.get('/api/quality/ai-suggestion', params: {'orderId': orderId});

  // ===== Style & Warehouse =====
  Future<Response> listStyles([Map<String, dynamic>? params]) =>
      _http.get('/api/style/info/list', params: params);

  Future<Response> getBomList(String styleId) =>
      _http.get('/api/style/bom/list', params: {'styleId': styleId});

  Future<Response> listFinishedInventory([Map<String, dynamic>? params]) =>
      _http.get('/api/warehouse/finished-inventory/list', params: params);

  Future<Response> outboundFinishedInventory(Map<String, dynamic> data) =>
      _http.post('/api/warehouse/finished-inventory/outbound', data: data);

  // ===== Material =====
  Future<Response> listStockAlerts([Map<String, dynamic>? params]) =>
      _http.get('/api/production/material/stock/alerts', params: params);

  Future<Response> materialRollScan(Map<String, dynamic> data) =>
      _http.post('/api/production/material/roll/scan', data: data);

  // ===== Sample Stock =====
  Future<Response> sampleScanQuery(Map<String, dynamic> data) =>
      _http.post('/api/stock/sample/scan-query', data: data);

  Future<Response> sampleInbound(Map<String, dynamic> data) =>
      _http.post('/api/stock/sample/inbound', data: data);

  Future<Response> sampleLoan(Map<String, dynamic> data) =>
      _http.post('/api/stock/sample/loan', data: data);

  Future<Response> sampleReturn(Map<String, dynamic> data) =>
      _http.post('/api/stock/sample/return', data: data);

  // ===== Dashboard =====
  Future<Response> getDashboard([Map<String, dynamic>? params]) =>
      _http.get('/api/dashboard', params: params);

  Future<Response> getTopStats([Map<String, dynamic>? params]) =>
      _http.get('/api/dashboard/top-stats', params: params);

  // ===== Intelligence =====
  Future<Response> aiAdvisorChat(Map<String, dynamic> data) =>
      _http.post('/api/intelligence/ai-advisor/chat', data: data);

  Future<Response> getMyPendingTaskSummary() =>
      _http.get('/api/intelligence/pending-tasks/summary');

  Future<Response> getAgentActivityList() =>
      _http.get('/api/intelligence/agent-activity/agents');

  Future<Response> getAgentAlerts() =>
      _http.get('/api/intelligence/agent-activity/alerts');

  // ===== Notice =====
  Future<Response> myNoticeList([Map<String, dynamic>? params]) =>
      _http.get('/api/production/notice/my', params: params);

  Future<Response> unreadNoticeCount() =>
      _http.get('/api/production/notice/unread-count');

  Future<Response> markNoticeRead(String id) =>
      _http.post('/api/production/notice/$id/read');

  // ===== Process Price =====
  Future<Response> queryOrderProcesses(String orderNo) =>
      _http.get('/api/production/process-price/processes', params: {'orderNo': orderNo});

  Future<Response> adjustProcessPrice(Map<String, dynamic> data) =>
      _http.post('/api/production/process-price/adjust', data: data);

  Future<Response> priceAdjustHistory(String orderNo) =>
      _http.get('/api/production/process-price/history', params: {'orderNo': orderNo});
}
