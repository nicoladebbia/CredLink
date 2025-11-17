import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import { visualizer } from 'rollup-plugin-visualizer';

const production = !process.env.ROLLUP_WATCH;

export default [
  // UMD bundle for browsers
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'umd',
      name: 'CredLinkSDK',
      sourcemap: true,
    },
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false, // Handled by build:types
      }),
      production && terser({
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log'],
        },
        mangle: {
          reserved: ['CredLinkSDK'],
        },
      }),
      production && visualizer({
        filename: 'dist/bundle-analysis.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
    ].filter(Boolean),
    external: [], // Bundle everything for browser usage
  },
  // ES module bundle for modern bundlers
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.esm.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: [
      resolve({
        preferBuiltins: false,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
      }),
      production && terser({
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log'],
        },
        format: {
          comments: false,
        },
      }),
      production && visualizer({
        filename: 'dist/bundle-analysis-esm.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
    ].filter(Boolean),
    external: ['uuid'], // Keep uuid external for tree-shaking
  },
  // Node.js CommonJS bundle
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.cjs.js',
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
    },
    plugins: [
      resolve({
        preferBuiltins: true,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
      }),
      production && terser({
        compress: {
          drop_console: false, // Keep console for Node.js debugging
          drop_debugger: true,
        },
        format: {
          comments: false,
        },
      }),
    ].filter(Boolean),
    external: ['uuid'], // Keep uuid external
  },
];
