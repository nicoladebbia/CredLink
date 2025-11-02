import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default [
  // Service Worker build
  {
    input: 'src/sw.ts',
    output: {
      file: 'dist/sw.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      nodeResolve(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: 'dist',
        rootDir: 'src',
        target: 'ES2020',
        lib: ['ES2020', 'WebWorker']
      })
    ],
    external: []
  }
];
