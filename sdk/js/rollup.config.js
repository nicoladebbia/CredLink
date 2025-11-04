import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

export default [
  // CommonJS build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      typescript({
        declaration: false,
        declarationMap: false,
      }),
    ],
    external: ['uuid'],
  },
  // ES Module build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.esm.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      typescript({
        declaration: false,
        declarationMap: false,
      }),
      terser({
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
        mangle: {
          keep_classnames: true,
          keep_fnames: true,
        },
      }),
    ],
    external: ['uuid'],
  },
];
