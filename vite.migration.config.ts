import {defineConfig} from 'vite'
export default defineConfig({
 root:'migration',
 base:'./',
 publicDir:false,
 build:{outDir:'../dist-migration',emptyOutDir:true},
})
