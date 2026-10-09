import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // Каркас подключается ИСХОДНИКАМИ, а не собранным пакетом.
      //
      // Так правка в yg-core сразу видна во всех играх, без публикации и
      // переустановки. Обратная сторона: сломав каркас, ломаешь все игры
      // разом, — поэтому в нём есть typecheck, и гонять его надо перед
      // коммитом.
      'yg-core': fileURLToPath(new URL('../../yg-core/src/index.ts', import.meta.url)),
    },
  },
  // Площадка распаковывает архив в подкаталог, поэтому все пути обязаны быть
  // относительными. Абсолютные дают чёрный экран.
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // без хэшей проще сверять содержимое архива перед заливкой
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: { host: '127.0.0.1', port: 5171 },
});
