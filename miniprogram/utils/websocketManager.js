const { eventBus, Events } = require('./eventBus');

class NoOpWebSocketManager {
  connect() {}
  disconnect() {}
  reconnect() {}
  onAppShow() {}
  onAppHide() {}
  isConnected() { return false; }
  isPolling() { return false; }
}

var wsManager = new NoOpWebSocketManager();

module.exports = { wsManager };
