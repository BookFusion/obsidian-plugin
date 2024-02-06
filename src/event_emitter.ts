type EventHandler = (payload: any) => void

export default class EventEmitter {
  private readonly listeners: Map<string, EventHandler[]>

  constructor () {
    this.listeners = new Map()
  }

  on (eventName: string, handler: EventHandler): void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, [])
    }
    this.listeners.get(eventName)?.push(handler)
  }

  off (eventName: string, handler: EventHandler): void {
    const listeners = this.listeners.get(eventName)
    if (listeners != null) {
      this.listeners.set(eventName, listeners.filter((h) => h !== handler))
    }
  }

  emit (eventName: string, payload?: any): void {
    const listeners = this.listeners.get(eventName)
    if (listeners != null) {
      listeners.forEach((handler) => handler(payload))
    }
  }
}
