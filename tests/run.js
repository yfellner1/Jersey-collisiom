// Checks for the Vercel vendor reconciliation. Run: npm test
const fs=require('fs'),path=require('path'),assert=require('assert');
const {JSDOM}=require('jsdom');
const dir=path.join(__dirname,'..','vendor-reconciliation');
let failed=0;
function t(name,fn){try{fn();console.log('  ok  '+name)}catch(e){failed++;console.log('  FAIL '+name+'\n       '+e.message)}}

// 1. Scanned statement parsing (OCR text with typical misreads)
{
  const w=new JSDOM('',{runScripts:'outside-only'}).window;
  w.eval(fs.readFileSync(path.join(dir,'ocr-reader.js'),'utf8'));
  const r=w.parseStatementText(fs.readFileSync(path.join(__dirname,'fixtures','scanned-statement-ocr.txt'),'utf8'));
  const rows=Object.fromEntries(r.grid.slice(1).map(g=>[g[0],g]));
  t('reads every statement line',()=>assert.strictEqual(r.rows,7));
  t('finds the vendor',()=>assert.strictEqual(r.vendor,"BERGEY'S INC"));
  t('fixes "1.13.11" to 1113.11 using the running balance',()=>assert.strictEqual(rows['2P132843'][4],'1113.11'));
  t('keeps credits negative',()=>assert.strictEqual(rows['2P123723-B2-R1'][4],'(43.16)'));
  t('cleans OCR invoice #s (2P 148900, -Bt, dot)',()=>{assert(rows['2P148900']);assert(rows['2P151912-B1']);assert(rows['2P144452-B1'])});
  t('picks the confirmed amount when columns disagree',()=>assert.strictEqual(rows['2P144452-B1'][4],'658.99'));
  t('flags nothing when the balance checks out',()=>assert.deepStrictEqual(Array.from(r.flagged),[]));
}

// 2. Full report on the built-in sample data
{
  const html=fs.readFileSync(path.join(dir,'index.html'),'utf8').replace(/<script src="[^"]*"><\/script>/g,'');
  const w=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true}).window;
  w.Element.prototype.scrollIntoView=function(){};w.matchMedia=()=>({matches:false});
  w.Papa=require('papaparse');
  w.eval(fs.readFileSync(path.join(dir,'app.js'),'utf8'));
  w.document.querySelector('#sampleBtn').click();
  const txt=s=>w.document.querySelector(s).textContent.replace(/\s+/g,' ');
  t('reports missing invoices',()=>assert(/missing from CCC/.test(txt('#tally'))));
  t('lists FM-450117 and K-55388 as missing',()=>{assert(/FM-450117/.test(txt('#secMissing')));assert(/K-55388/.test(txt('#secMissing')))});
  t('matches TL-21008 to typo TL-21080 by amount',()=>assert(/TL-21008.*TL-21080/.test(txt('#secAmount'))));
  t('Abington CM credits are credits, not missing',()=>{assert(/CM-4471/.test(txt('#secCredits')));assert(!/CM-4471/.test(txt('#secMissing')))});
  t('flags TL-20977 under the wrong vendor',()=>assert(/TL-20977/.test(txt('#secWrong'))));
  t('lists Gerber Glass as a vendor with no statement',()=>assert(/Gerber Glass/.test(txt('#secOtherVen'))));
  t('September invoice is outside the period, not missing',()=>assert(!/AB-76801/.test(txt('#secMissing'))));
}
console.log(failed?`\n${failed} check(s) failed`:'\nAll checks passed');
process.exit(failed?1:0);
