// Builds the protected copies that get deployed. The readable source stays in this (private) repo;
// only the scrambled output in dist/ is ever published.
//
//   npm run build            -> dist/  (locked to the live Vercel address)
//   node build.js --no-lock  -> dist-test/  (same scrambling, no address lock; used by `npm run test:dist`)
//
// To add an address the live tool may run on (e.g. a custom domain), add it to LOCK_DOMAINS.
const fs = require('fs'), path = require('path');
const Obfuscator = require('javascript-obfuscator');
const { minify } = require('html-minifier-terser');

const LOCK_DOMAINS = ['vendor-invoice-reconciliation.vercel.app'];
const noLock = process.argv.includes('--no-lock');
const ROOT = __dirname, OUT = path.join(ROOT, noLock ? 'dist-test' : 'dist');
const YEAR = new Date().getFullYear();
const BANNER = `/*! (c) ${YEAR} Reliable Office Services. All rights reserved. Proprietary and confidential. ` +
  `Licensed for use only while an active Reliable client. Copying, reverse engineering or reuse is prohibited. */\n`;

function obfuscate(code, lock) {
  return BANNER + Obfuscator.obfuscate(code, {
    compact: true,
    controlFlowFlattening: true, controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: true, deadCodeInjectionThreshold: 0.2,
    stringArray: true, stringArrayThreshold: 1, stringArrayEncoding: ['rc4'],
    stringArrayRotate: true, stringArrayShuffle: true,
    stringArrayWrappersCount: 2, stringArrayWrappersType: 'function',
    splitStrings: true, splitStringsChunkLength: 6,
    numbersToExpressions: true, transformObjectKeys: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,        // pages call each other's window.* functions; keep those names
    selfDefending: true,         // stops working if someone reformats it to read it
    debugProtection: true,       // pauses the page when browser developer tools are opened
    disableConsoleOutput: true,
    domainLock: lock ? LOCK_DOMAINS : [],
    sourceMap: false,
    target: 'browser',
  }).getObfuscatedCode();
}

async function html(src, inlineLock) {
  // Scramble any inline <script> blocks (the claude.ai single-file pages), then minify the page.
  src = src.replace(/<script>([\s\S]*?)<\/script>/g, (_, js) => '<script>' + obfuscate(js, inlineLock) + '</script>');
  return minify(src, { collapseWhitespace: true, removeComments: true, minifyCSS: true, minifyJS: false });
}

const write = (rel, data) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });

  // Vercel site: locked to its own address unless --no-lock.
  const vr = path.join(ROOT, 'vendor-reconciliation');
  for (const f of ['app.js', 'pdf-reader.js', 'ocr-reader.js'])
    write('vendor-reconciliation/' + f, obfuscate(fs.readFileSync(path.join(vr, f), 'utf8'), !noLock));
  write('vendor-reconciliation/index.html', await html(fs.readFileSync(path.join(vr, 'index.html'), 'utf8'), false));
  write('vendor-reconciliation/vercel.json', fs.readFileSync(path.join(vr, 'vercel.json')));

  // claude.ai pages: scrambled, not address-locked (claude.ai serves artifacts from addresses we don't control).
  const ca = path.join(ROOT, 'claude-artifacts');
  for (const f of fs.readdirSync(ca).filter(f => f.endsWith('.html')))
    write('claude-artifacts/' + f, await html(fs.readFileSync(path.join(ca, f), 'utf8'), false));

  console.log('Built ' + path.relative(ROOT, OUT) + '/' + (noLock ? ' (no address lock, for tests)' : ' (locked to ' + LOCK_DOMAINS.join(', ') + ')'));
})().catch(e => { console.error(e); process.exit(1); });
