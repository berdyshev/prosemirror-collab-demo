import nodeResolve from 'rollup-plugin-node-resolve';
import json from 'rollup-plugin-json';
import commonjs from 'rollup-plugin-commonjs';
import babel from 'rollup-plugin-babel';
import replace from 'rollup-plugin-replace';

let globals = {
    '@babel/runtime/regenerator': 'regeneratorRuntime'
  },
  external = [];
'model transform state view keymap inputrules history commands schema-basic schema-list dropcursor menu example-setup gapcursor'
  .split(' ')
  .forEach((name) => {
    globals['prosemirror-' + name] = 'PM.' + name.replace(/-/g, '_');
    // external.push('prosemirror-' + name);
  });

export default {
  input: './client/index.js',
  plugins: [
    nodeResolve({ main: true, preferBuiltins: false, browser: true }),
    json(),
    commonjs({
      include: 'node_modules/**'
    }),
    babel({
      exclude: 'node_modules/**',
      babelrc: false,
      runtimeHelpers: true,
      presets: [['@babel/env', { modules: false }]],
      plugins: [
        '@babel/plugin-transform-runtime',
        '@babel/plugin-proposal-object-rest-spread'
      ]
    }),
    replace({
      'process.env.NODE_ENV': JSON.stringify('development')
    })
  ],
  // external,
  output: {
    format: 'iife',
    file: './public/collab.js',
    globals,
    sourcemap: true
  }
};
