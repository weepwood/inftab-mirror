import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: { allowedHosts: ['.e2b.app'] },
  preview: { allowedHosts: ['.e2b.app'] },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Keep the static startup graph together: tiny shared chunks otherwise
          // add request and gzip overhead. Dynamic panels/widgets stay lazy.
          groups: [
            { name: 'startup', tags: ['$initial'], priority: 20 },
            // Coalesce only non-startup Lucide modules: a dozen tiny icon files
            // otherwise repeat import/gzip overhead. Never pull tools into home.
            {
              name: 'shared-icons',
              test: /\/node_modules\/@lucide\/vue\/dist\/esm\/icons\//,
              priority: 10,
              includeDependenciesRecursively: false,
            },
            // Small offline tools share Vue/icon imports and repeated form markup.
            // Group them for gzip efficiency, but fetch none on the homepage.
            {
              name: 'local-tools',
              test: /\/src\/components\/(?:Todo|Notes|Countdown|Calendar|Calculator|FocusTimer)Panel\.vue/,
              // Shared icons are also used by homepage chunks. Capturing them
              // here would indirectly fetch every tool before a panel opens.
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
