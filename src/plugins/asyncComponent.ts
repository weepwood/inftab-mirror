import { defineAsyncComponent, defineComponent, h, onBeforeUnmount, onErrorCaptured, ref, shallowRef, type AsyncComponentLoader, type Component, type ShallowRef } from 'vue'

export async function retryAsyncLoad<T>(loader: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await loader()
    } catch (error) {
      if (attempt >= maxAttempts) throw error
      await new Promise<void>((resolve) => setTimeout(resolve, attempt * 250))
    }
  }
  throw new Error('Async loader exhausted without a result.')
}

export function lazyPluginComponent(loader: AsyncComponentLoader, loadingMessage: string, failureMessage: string): Component {
  const loadingComponent = defineComponent({
    name: 'PluginChunkLoading',
    setup: () => () => h('p', { class: 'panel-loading', role: 'status' }, loadingMessage),
  })

  return defineComponent({
    name: 'RetryablePluginComponent',
    inheritAttrs: false,
    setup(_props, { attrs, slots }) {
      let component: ShallowRef<Component>
      let retryTimer: ReturnType<typeof setTimeout> | undefined
      let isMounted = true
      const runtimeError = ref(false)
      let asyncLoadFailed = false

      onErrorCaptured((_error, _instance, info) => {
        if (asyncLoadFailed || info === 'async component loader') return false
        runtimeError.value = true
        return false
      })

      onBeforeUnmount(() => {
        isMounted = false
        if (retryTimer !== undefined) clearTimeout(retryTimer)
      })

      function retryManually() {
        if (!isMounted) return
        runtimeError.value = false
        asyncLoadFailed = false
        component.value = createAsyncComponent()
      }

      function errorView(message: string) {
        return h('div', { class: 'plugin-load-error panel-loading', role: 'alert' }, [
          h('p', message),
          h('button', {
            class: 'text-button plugin-load-retry',
            type: 'button',
            'aria-label': '重试加载',
            onClick: retryManually,
          }, '重试加载'),
        ])
      }

      function createAsyncComponent() {
        const trackedLoader: AsyncComponentLoader = async () => {
          try {
            const loaded = await loader()
            asyncLoadFailed = false
            return loaded
          } catch (error) {
            asyncLoadFailed = true
            throw error
          }
        }
        const errorComponent = defineComponent({
          name: 'PluginChunkLoadError',
          setup: () => () => errorView(failureMessage),
        })

        return defineAsyncComponent({
          loader: trackedLoader,
          loadingComponent,
          errorComponent,
          delay: 0,
          suspensible: false,
          onError(_error, retry, fail, attempts) {
            if (!isMounted) {
              fail()
              return
            }
            if (attempts >= 3) {
              fail()
              return
            }
            retryTimer = setTimeout(() => {
              retryTimer = undefined
              retry()
            }, attempts * 250)
          },
        })
      }

      component = shallowRef(createAsyncComponent())
      return () => runtimeError.value
        ? errorView('组件运行出错，已暂时隔离。')
        : h(component.value, attrs, slots)
    },
  })
}
