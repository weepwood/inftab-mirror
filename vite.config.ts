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
            // Related opt-in widgets share templates and imports, but never pull
            // a panel or a permission request into the startup graph.
            {
              name: 'local-widgets',
              test: /\/src\/components\/(?:Todo|Habits|Notes|Countdown|Calendar|FocusTimer)SummaryWidget\.vue/,
              includeDependenciesRecursively: false,
            },
            {
              name: 'browser-widgets',
              test: /\/src\/components\/(?:Bookmarks|History|TopSites)SummaryWidget\.vue/,
              includeDependenciesRecursively: false,
            },
            {
              name: 'browser-tools',
              test: /\/src\/components\/(?:BookmarksPanel|HistoryPanel|BrowserTabImport)\.vue/,
              includeDependenciesRecursively: false,
            },
            // Coalesce the optional launcher menu and Dock; neither is a startup dependency.
            { name: 'home-menus', test: /\/src\/components\/(?:HomeDock|ShortcutContextMenu)\.vue|\/src\/components\/menuNavigation\.ts/, includeDependenciesRecursively: false },
            // Optional extension adapters share runtime/permission guards without loading panels.
            { name: 'browser-data', test: /\/src\/data\/(?:browserApiShared|browserBookmarks|browserHistory|browserTabs)\.ts/, includeDependenciesRecursively: false },
            // Related modal editors share validation/focus/form markup. Their
            // native shortcut shell can open before this optional chunk arrives.
            {
              name: 'local-editors',
              test: /\/src\/components\/(?:ShortcutEditor|FolderDialog|ConfirmDialog)\.vue/,
              includeDependenciesRecursively: false,
            },
            // Coalesce optional management forms, sharing template and validation
            // overhead without pulling them into the homepage startup graph.
            {
              name: 'settings-tools',
              test: /\/src\/components\/(?:CustomThemeEditor|ConfigMigration|ShortcutManager|HomeLayoutEditor)\.vue|\/src\/data\/(?:backupHistory|shortcutBatch|downloadBackup)\.ts/,
              includeDependenciesRecursively: false,
            },
            // Small offline tools share Vue/icon imports and repeated form markup.
            // Group them for gzip efficiency, but fetch none on the homepage.
            {
              name: 'local-tools',
              // Keep the calculator-only parser here too, avoiding a tiny
              // facade that imports back into the same tools chunk.
              test: /\/src\/(?:components\/(?:Todo|Notes|Countdown|Calendar|Calculator|FocusTimer|Habits)Panel\.vue|data\/calculator\.ts)/,
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
