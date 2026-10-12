import { defineAsyncComponent, defineComponent, h, onBeforeUnmount, shallowRef, type AsyncComponentLoader, type Component, type ShallowRef } from 'vue'

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

      onBeforeUnmount(() => {
        if (retryTimer !== undefined) clearTimeout(retryTimer)
      })

      function retryManually() {
        component.value = createAsyncComponent()
      }

      function createAsyncComponent() {
        const errorComponent = defineComponent({
          name: 'PluginChunkLoadError',
          setup: () => () => h('div', { class: 'plugin-load-error panel-loading', role: 'alert' }, [
            h('p', failureMessage),
            h('button', {
              class: 'text-button plugin-load-retry',
              type: 'button',
              'aria-label': '重试加载',
              onClick: retryManually,
            }, '重试加载'),
          ]),
        })

        return defineAsyncComponent({
          loader,
          loadingComponent,
          errorComponent,
          delay: 0,
          suspensible: false,
          onError(_error, retry, fail, attempts) {
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
      return () => h(component.value, attrs, slots)
    },
  })
}
