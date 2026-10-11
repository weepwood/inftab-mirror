import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

export interface OptionalBrowserResourceOptions<T> {
  supported: boolean
  initial: T
  hasPermission: () => Promise<boolean>
  subscribeToPermissionChanges: (listener: () => void) => () => void
  subscribeToChanges?: (listener: () => void) => () => void
  load: () => Promise<T>
  permissionError: string
  resourceError: string
  changeDebounceMs?: number
}

export function useOptionalBrowserResource<T>(options: OptionalBrowserResourceOptions<T>) {
  const permissionGranted = ref(false)
  const loading = ref(false)
  const error = ref('')
  const data = shallowRef(options.initial)
  let refreshSequence = 0
  let permissionSequence = 0
  let changeTimer: ReturnType<typeof setTimeout> | undefined
  let stopListening: (() => void) | undefined
  let stopWatchingPermission: (() => void) | undefined

  async function refresh() {
    const sequence = ++refreshSequence
    loading.value = true
    error.value = ''
    try {
      const next = await options.load()
      if (sequence === refreshSequence) data.value = next
    } catch {
      if (sequence === refreshSequence) error.value = options.resourceError
    } finally {
      if (sequence === refreshSequence) loading.value = false
    }
  }

  function queueRefresh() {
    if (changeTimer !== undefined) clearTimeout(changeTimer)
    changeTimer = setTimeout(() => {
      changeTimer = undefined
      if (permissionGranted.value) void refresh()
    }, options.changeDebounceMs ?? 100)
  }

  function watchResourceChanges() {
    if (!stopListening && options.subscribeToChanges) stopListening = options.subscribeToChanges(queueRefresh)
  }

  async function syncPermission() {
    const sequence = ++permissionSequence
    try {
      const granted = await options.hasPermission()
      if (sequence !== permissionSequence) return
      permissionGranted.value = granted
      if (granted) {
        watchResourceChanges()
        await refresh()
      } else {
        refreshSequence += 1
        if (changeTimer !== undefined) clearTimeout(changeTimer)
        changeTimer = undefined
        stopListening?.()
        stopListening = undefined
        data.value = options.initial
        loading.value = false
        error.value = ''
      }
    } catch {
      if (sequence === permissionSequence) error.value = options.permissionError
    }
  }

  async function retry() {
    if (permissionGranted.value) await refresh()
    else await syncPermission()
  }

  onMounted(() => {
    if (!options.supported) return
    stopWatchingPermission = options.subscribeToPermissionChanges(() => { void syncPermission() })
    void syncPermission()
  })

  onBeforeUnmount(() => {
    permissionSequence += 1
    refreshSequence += 1
    if (changeTimer !== undefined) clearTimeout(changeTimer)
    stopListening?.()
    stopWatchingPermission?.()
  })

  return { supported: options.supported, permissionGranted, loading, error, data, refresh, retry }
}
