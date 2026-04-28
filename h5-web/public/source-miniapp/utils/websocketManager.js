class NoOpWebSocketManager {
  connect() {}
  disconnect() {}
  reconnect() {}
  onAppShow() {}
  onAppHide() {}
  isConnected() { return false; }
  isPolling() { return false; }
}

const wsManager = new NoOpWebSocketManager();

module.exports = { wsManager };
