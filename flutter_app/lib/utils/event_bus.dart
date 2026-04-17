typedef EventCallback = void Function(dynamic data);

class EventBus {
  static final EventBus instance = EventBus._();
  EventBus._();

  static const String orderProgressChanged = 'order_progress_changed';
  static const String scanSuccess = 'scan_success';
  static const String warehousingNotify = 'warehousing_notify';
  static const String taskReminder = 'task_reminder';
  static const String userOnlineChanged = 'user_online_changed';
  static const String noticeReceived = 'notice_received';
  static const String dataChanged = 'data_changed';
  static const String refreshAll = 'refresh_all';

  final Map<String, List<_Subscriber>> _subscribers = {};

  void on(String event, EventCallback callback, {String? tag}) {
    _subscribers.putIfAbsent(event, () => []);
    _subscribers[event]!.add(_Subscriber(callback, tag));
  }

  void off(String event, {String? tag}) {
    if (tag == null) {
      _subscribers.remove(event);
    } else {
      _subscribers[event]?.removeWhere((s) => s.tag == tag);
    }
  }

  void once(String event, EventCallback callback) {
    void wrapper(dynamic data) {
      off(event, tag: '_once_${event}_${callback.hashCode}');
      callback(data);
    }
    on(event, wrapper, tag: '_once_${event}_${callback.hashCode}');
  }

  void emit(String event, dynamic data) {
    final subscribers = _subscribers[event];
    if (subscribers == null) return;
    for (final sub in subscribers.toList()) {
      try {
        sub.callback(data);
      } catch (_) {}
    }
  }

  void clear() {
    _subscribers.clear();
  }
}

class _Subscriber {
  final EventCallback callback;
  final String? tag;

  _Subscriber(this.callback, this.tag);
}
