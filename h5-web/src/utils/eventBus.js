class EventBus {
  constructor() {
    this._events = {};
  }

  on(event, handler) {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    if (!this._events[event]) return;
    this._events[event] = this._events[event].filter((h) => h !== handler);
  }

  emit(event, ...args) {
    if (!this._events[event]) return;
    this._events[event].forEach((h) => {
      try { h(...args); } catch (e) { console.error('[EventBus]', e); }
    });
  }

  once(event, handler) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      handler(...args);
    };
    this.on(event, wrapper);
  }
}

export const eventBus = new EventBus();
export default EventBus;
