import nodeResolve from 'rollup-plugin-node-resolve';
import json from 'rollup-plugin-json';
import commonjs from 'rollup-plugin-commonjs';
import buble from 'rollup-plugin-buble';
import copy from 'rollup-plugin-copy';

let globals = {},
  external = [];
'model transform state view keymap inputrules history commands schema-basic schema-list dropcursor menu example-setup gapcursor'
  .split(' ')
  .forEach((name) => {
    globals['prosemirror-' + name] = 'PM.' + name.replace(/-/g, '_');
    external.push('prosemirror-' + name);
  });

export default {
  input: './client/collab.js',
  plugins: [
    copy({
      targets: [
        'node_modules/prosemirror-view/style/prosemirror.css',
        'node_modules/prosemirror-menu/style/menu.css',
        'node_modules/prosemirror-gapcursor/style/gapcursor.css',
        'node_modules/prosemirror-example-setup/style/style.css',
        'node_modules/codemirror/lib/codemirror.css'
      ],
      // outputFolder: 'public/styles',
      // hook: 'buildStart',
      verbose: true
    }),
    nodeResolve({ main: true, preferBuiltins: false }),
    json(),
    commonjs(),
    buble()
  ],
  // external,
  output: { format: 'iife', file: './public/collab.js' }
};
