import { useCallback, useEffect, useRef } from 'react'
import { useWebSocket } from './useWebSocket'
import { clearApiCache } from '../utils/api/core'

export interface DataSyncEvent<T = unknown> {
  eventType: string
  entityType: string
  entityId: string
  tenantId?: string
  data?: T
  source: string
  timestamp: number
}

interface UseDataSyncOptions {
  userId: string | undefined
  tenantId?: string | number
  token?: string
  enabled?: boolean
}

interface DataSyncHandlers {
  onOrderUpdate?: (event: DataSyncEvent) => void
  onScanCreate?: (event: DataSyncEvent) => void
  onProgressUpdate?: (event: DataSyncEvent) => void
  onStockChange?: (event: DataSyncEvent) => void
  onCacheEvict?: (cacheName: string, entityId?: string) => void
  onAnyEvent?: (event: DataSyncEvent) => void
}

export function useDataSync(options: UseDataSyncOptions, handlers: DataSyncHandlers = {}) {
  const { userId, tenantId, token, enabled = true } = options
  const { connected, subscribe } = useWebSocket({
    userId,
    clientType: 'pc',
    tenantId,
    token,
    enabled
  })

  const handlersRef = useRef<DataSyncHandlers>(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  const handleDataChanged = useCallback((msg: any) => {
    try {
      const payload = msg.payload as DataSyncEvent
      const eventType = payload?.eventType

      if (!eventType) return

      const { onAnyEvent, onOrderUpdate, onScanCreate, onProgressUpdate, onStockChange, onCacheEvict } = handlersRef.current

      if (onAnyEvent) {
        onAnyEvent(payload)
      }

      switch (eventType) {
        case 'order:update':
        case 'order:create':
        case 'order:change':
          if (onOrderUpdate) {
            onOrderUpdate(payload)
          }
          if (onCacheEvict) {
            onCacheEvict('order', payload.entityId)
          }
          clearApiCache('order')
          break
        case 'scan:create':
        case 'scan:undo':
          if (onScanCreate) {
            onScanCreate(payload)
          }
          if (onCacheEvict) {
            onCacheEvict('scan', payload.entityId)
          }
          clearApiCache('scan')
          break
        case 'progress:update':
        case 'progress:change':
          if (onProgressUpdate) {
            onProgressUpdate(payload)
          }
          break
        case 'stock:change':
        case 'stock:update':
          if (onStockChange) {
            onStockChange(payload)
          }
          if (onCacheEvict) {
            onCacheEvict('stock', payload.entityId)
          }
          clearApiCache('stock')
          clearApiCache('material')
          break
        default:
          break
      }
    } catch (e) {
      console.warn('[DataSync] 处理消息失败', e)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const unsubscribeDataChanged = subscribe('data_changed', handleDataChanged)
    const unsubscribeAll = subscribe('*', (msg) => {
      if (msg.type !== 'data_changed') return
      handleDataChanged(msg)
    })

    return () => {
      unsubscribeDataChanged()
      unsubscribeAll()
    }
  }, [enabled, subscribe, handleDataChanged])

  return {
    connected
  }
}

export function useOrderDataSync(
  orderId?: string | number,
  options: {
    userId?: string
    tenantId?: string | number
    token?: string
    onUpdate?: (event: DataSyncEvent) => void
    onRefresh?: () => void
  } = {}
) {
  const { userId, tenantId, token, onUpdate, onRefresh } = options

  const handleOrderUpdate = useCallback((event: DataSyncEvent) => {
    if (orderId && event.entityId === String(orderId)) {
      if (onUpdate) {
        onUpdate(event)
      }
      if (onRefresh) {
        onRefresh()
      }
    }
  }, [orderId, onUpdate, onRefresh])

  return useDataSync({
    userId,
    tenantId,
    token,
    enabled: !!orderId && !!userId
  }, {
    onOrderUpdate: handleOrderUpdate,
    onScanCreate: handleOrderUpdate,
    onProgressUpdate: handleOrderUpdate
  })
}

export function useStockDataSync(
  materialCode?: string,
  options: {
    userId?: string
    tenantId?: string | number
    token?: string
    onChange?: (event: DataSyncEvent) => void
    onRefresh?: () => void
  } = {}
) {
  const { userId, tenantId, token, onChange, onRefresh } = options

  const handleStockChange = useCallback((event: DataSyncEvent) => {
    if (materialCode && event.entityId === materialCode) {
      if (onChange) {
        onChange(event)
      }
      if (onRefresh) {
        onRefresh()
      }
    }
  }, [materialCode, onChange, onRefresh])

  return useDataSync({
    userId,
    tenantId,
    token,
    enabled: !!materialCode && !!userId
  }, {
    onStockChange: handleStockChange
  })
}
