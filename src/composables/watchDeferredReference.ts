import { onScopeDispose, watch, type Ref } from 'vue'

const referenceGracePeriodMs = 500

/** Keep a newly received cross-key reference briefly while its owning record syncs. */
export function watchDeferredReference(
  reference: Ref<string>,
  isAvailable: (id: string) => boolean,
  getFallback: () => string,
  gracePeriodMs = referenceGracePeriodMs,
) {
  let lastKnownId = reference.value
  let validationTimer: ReturnType<typeof setTimeout> | undefined

  function clearValidationTimer() {
    if (validationTimer === undefined) return
    clearTimeout(validationTimer)
    validationTimer = undefined
  }

  watch(reference, (id) => {
    clearValidationTimer()
    if (isAvailable(id)) {
      lastKnownId = id
      return
    }
    validationTimer = setTimeout(() => {
      validationTimer = undefined
      if (!isAvailable(reference.value)) reference.value = getFallback()
    }, gracePeriodMs)
  }, { flush: 'sync' })

  function reconcileSourceChange() {
    const id = reference.value
    if (isAvailable(id)) {
      lastKnownId = id
      clearValidationTimer()
    } else if (id === lastKnownId) {
      reference.value = getFallback()
    }
  }

  onScopeDispose(clearValidationTimer)
  return reconcileSourceChange
}
