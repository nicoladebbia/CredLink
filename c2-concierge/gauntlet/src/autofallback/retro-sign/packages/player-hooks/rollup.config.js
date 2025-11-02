import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default [
  // ES Module build
  {
    input: 'src/hlsjs-plugin.ts',
    output: {
      file: 'dist/hlsjs-plugin.esm.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      nodeResolve(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: 'dist',
        rootDir: 'src'
      })
    ],
    external: ['hls.js']
  },
  // CommonJS build
  {
    input: 'src/hlsjs-plugin.ts',
    output: {
      file: 'dist/hlsjs-plugin.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'default'
    },
    plugins: [
      nodeResolve(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false
      })
    ],
    external: ['hls.js']
  },
  // UMD build for browsers
  {
    input: 'src/hlsjs-plugin.ts',
    output: {
      file: 'dist/hlsjs-plugin.umd.js',
      format: 'umd',
      name: 'C2PAHlsPlugin',
      sourcemap: true,
      globals: {
        'hls.js': 'Hls'
      }
    },
    plugins: [
      nodeResolve(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false
      })
    ],
    external: ['hls.js']
  },
  // Web Worker build
  {
    input: 'src/verify.worker.ts',
    output: {
      file: 'dist/verify.worker.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      nodeResolve(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        target: 'ES2020',
        lib: ['ES2020', 'WebWorker']
      })
    ],
    external: []
  }
];
