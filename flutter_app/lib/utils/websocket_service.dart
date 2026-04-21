import 'dart:async';
import 'dart:convert';
import 'package:get/get.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'storage_service.dart';
import 'event_bus.dart';

class WebSocketService extends GetxService {
  WebSocketChannel? _channel;
  final StorageService _storage = Get.find<StorageService>();

  final _reconnectAttempts = 0.obs;
  final maxReconnectAttempts = 10;
  final baseReconnectDelay = 1000;
  final heartbeatInterval = 18;

  Timer? _heartbeatTimer;
  Timer? _reconnectTimer;
  Timer? _pollingTimer;
  StreamSubscription? _connectivitySub;

  final connected = false.obs;
  final _usePolling = false.obs;

  Future<WebSocketService> init() async {
    _connectivitySub = Connectivity().onConnectivityChanged.listen((result) {
      if (!result.contains(ConnectivityResult.none)) {
        connect();
      }
    });
    connect();
    return this;
  }

  void connect() {
    if (connected.value) return;
    final token = _storage.getToken();
    if (token.isEmpty) return;

    try {
      final baseUrl = _storage.getBaseUrl().isNotEmpty
          ? _storage.getBaseUrl()
          : 'https://api.webyszl.cn';
      final wsUrl = baseUrl.replaceFirst('https://', 'wss://').replaceFirst('http://', 'ws://');
      final uri = Uri.parse('$wsUrl/ws/realtime?token=$token&clientType=flutter');

      _channel = WebSocketChannel.connect(uri);
      _channel!.stream.listen(
        _onMessage,
        onError: _onError,
        onDone: _onDone,
      );
      connected.value = true;
      _reconnectAttempts.value = 0;
      _startHeartbeat();
      _usePolling.value = false;
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _onMessage(dynamic message) {
    try {
      final data = json.decode(message as String) as Map<String, dynamic>;
      final type = data['type']?.toString() ?? '';
      final payload = data['data'];

      switch (type) {
        case 'ORDER_PROGRESS':
          EventBus.instance.emit(EventBus.orderProgressChanged, payload);
          break;
        case 'SCAN_SUCCESS':
          EventBus.instance.emit(EventBus.scanSuccess, payload);
          break;
        case 'WAREHOUSING_NOTIFY':
          EventBus.instance.emit(EventBus.warehousingNotify, payload);
          break;
        case 'TASK_REMINDER':
          EventBus.instance.emit(EventBus.taskReminder, payload);
          break;
        case 'USER_ONLINE':
          EventBus.instance.emit(EventBus.userOnlineChanged, payload);
          break;
        case 'NOTICE':
          EventBus.instance.emit(EventBus.noticeReceived, payload);
          break;
        case 'PONG':
          break;
        default:
          EventBus.instance.emit(EventBus.dataChanged, payload);
      }
    } catch (_) {}
  }

  void _onError(dynamic error) {
    connected.value = false;
    _stopHeartbeat();
    _scheduleReconnect();
  }

  void _onDone() {
    connected.value = false;
    _stopHeartbeat();
    _scheduleReconnect();
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(Duration(seconds: heartbeatInterval), (_) {
      if (connected.value && _channel != null) {
        try {
          _channel!.sink.add(json.encode({'type': 'ping'}));
        } catch (_) {
          connected.value = false;
          _scheduleReconnect();
        }
      }
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }

  void _scheduleReconnect() {
    if (_reconnectAttempts.value >= maxReconnectAttempts) {
      _fallbackToPolling();
      return;
    }

    _reconnectTimer?.cancel();
    final delay = baseReconnectDelay * (1 << _reconnectAttempts.value);
    _reconnectAttempts.value++;

    _reconnectTimer = Timer(Duration(milliseconds: delay), () {
      connect();
    });
  }

  void _fallbackToPolling() {
    _usePolling.value = true;
    _pollingTimer?.cancel();
    _pollingTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      EventBus.instance.emit(EventBus.dataChanged, null);
    });
  }

  void send(String type, dynamic data) {
    if (connected.value && _channel != null) {
      try {
        _channel!.sink.add(json.encode({'type': type, 'data': data}));
      } catch (_) {}
    }
  }

  @override
  void onClose() {
    _stopHeartbeat();
    _reconnectTimer?.cancel();
    _pollingTimer?.cancel();
    _connectivitySub?.cancel();
    _channel?.sink.close();
    super.onClose();
  }
}
