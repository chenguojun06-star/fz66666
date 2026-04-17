class NoOpWebSocketService {
  connect() {}
  disconnect() {}
  onVisibilityChange() {}
}

const wsService = new NoOpWebSocketService();

export { wsService };
export default wsService;
