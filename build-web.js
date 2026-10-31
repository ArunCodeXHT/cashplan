const fs = require('fs'), esbuild = require('esbuild');
fs.mkdirSync('www', { recursive: true });
esbuild.buildSync({ entryPoints: ['bridge.js'], bundle: true, minify: true, format: 'iife', outfile: 'www/bridge.js', target: 'es2019' });
fs.copyFileSync('app.html', 'www/index.html');
fs.copyFileSync('node_modules/jspdf/dist/jspdf.umd.min.js', 'www/jspdf.umd.min.js');
fs.copyFileSync('node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js', 'www/jspdf.plugin.autotable.min.js');
console.log('web build ok');
