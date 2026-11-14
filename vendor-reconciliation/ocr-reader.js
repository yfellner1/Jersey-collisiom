/* Reads scanned (image-only) PDF statements: renders each page, runs OCR in the browser with
   Tesseract, then turns the statement lines into invoice rows. Amounts are cross-checked
   against the statement's own running balance, and doubtful lines are flagged. */
(function(){
var DATE=/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g;
function cleanInv(s){
  s=s.replace(/[—–_~|"“”'‘’]+/g," ").replace(/\s\.+\s/g," ").trim();
  var t=s.split(/\s+/);
  var inv=t[0]||"";
  if(t.length>1&&/^[A-Z0-9]{1,3}$/i.test(t[0])&&/^\d/.test(t[1]))inv=t[0]+t[1]; // "2P 148900" -> "2P148900"
  inv=inv.replace(/[.,;:]+$/,"").replace(/\.(?=[A-Z0-9])/gi,"-").toUpperCase();
  inv=inv.replace(/-(B|R)[TLI](?=$|-)/g,"-$11").replace(/(\d)O(?=\d)/g,"$10");      // OCR: Bt->B1, 1O2->102
  return inv;
}
function money(chunk){
  var c=chunk.replace(/\s+/g,"");
  if(!/^[\(\-−]?\$?[\d,.¢]+\)?$/.test(c))return null;
  var neg=/^[\(\-−]/.test(c)||/\)$/.test(c);
  var d=c.replace(/[^\d]/g,"");if(!d)return null;
  var v=parseInt(d,10)/100;                       // statement amounts always carry cents
  return neg?-v:v;
}
function fixDate(d1,d2){
  function mk(m){if(!m)return null;var mo=+m[1],da=+m[2],y=+m[3];if(y<100)y+=2000;if(mo<1||mo>12||da<1||da>31)return null;return new Date(y,mo-1,da)}
  var a=mk(d1),b=mk(d2);
  if(!a&&b){a=new Date(b);a.setDate(a.getDate()-30)}
  return {date:a,due:b};
}
function fmt(d){return d?(d.getMonth()+1)+"/"+d.getDate()+"/"+d.getFullYear():""}
window.parseStatementText=function(text){
  var lines=text.split(/\r?\n/),rows=[],vendor="";
  // vendor: first company-looking line near the top that isn't the customer (Jersey Collision)
  for(var i=0;i<Math.min(lines.length,15)&&!vendor;i++){var L=lines[i].trim();
    if(/\b(INC|LLC|CORP|CORPORATION|COMPANY|CO|LTD|SUPPLY|PARTS|AUTO)\b\.?/i.test(L)&&!/jersey\s*collision|remit|po box|phone|tel:|fax/i.test(L)&&L.length<50)vendor=L.replace(/^[^A-Za-z0-9]+/,"").replace(/[\s.,]+$/,"")}
  lines.forEach(function(line){
    var ds=[],m;DATE.lastIndex=0;
    while((m=DATE.exec(line)))ds.push({m:m,i:m.index,end:m.index+m[0].length});
    if(!ds.length)return;
    var before=line.slice(0,ds[0].i);
    if(!/\d/.test(before))return;                 // invoice lines start with the invoice number
    var inv=cleanInv(before);if(!inv||inv.length<3)return;
    var after=line.slice(ds[ds.length-1].end);
    var chunks=after.split(/\s{2,}/).map(function(s){return s.trim()}).filter(Boolean);
    var desc=[],amts=[];
    chunks.forEach(function(ch){var v=money(ch);if(v==null){if(!amts.length)desc.push(ch)}else amts.push(v)});
    if(!amts.length)return;
    var dd=fixDate(ds[0].m,ds.length>1?ds[1].m:null);
    rows.push({inv:inv,date:dd.date,due:dd.due,desc:desc.join(" "),amts:amts});
  });
  // cross-check each amount against the running statement balance (last column)
  var flagged=[],checked=0,prevBal=null;
  var withBal=rows.filter(function(r){return r.amts.length>=3}).length>rows.length/2;
  rows.forEach(function(r){
    var a=r.amts[0],b=r.amts.length>=3?r.amts[1]:null,bal=withBal?r.amts[r.amts.length-1]:null;
    var diff=(bal!=null&&prevBal!=null)?Math.round((bal-prevBal)*100)/100:(bal!=null&&prevBal==null?bal:null);
    var amt=a,ok=false;
    function eq(x,y){return x!=null&&y!=null&&Math.abs(x-y)<.005}
    if(eq(a,b)){amt=a;ok=true}
    else if(eq(diff,a)){amt=a;ok=true}
    else if(eq(diff,b)){amt=b;ok=true}
    else if(diff!=null&&b==null&&!eq(diff,a)){amt=a}
    if(!ok&&b==null&&diff==null)ok=true;          // nothing to check against
    if(ok)checked++;else flagged.push(r.inv);
    r.amount=amt;r.ok=ok;
    if(bal!=null)prevBal=bal;
  });
  var grid=[["Invoice #","Date","Due Date","Description","Amount","Vendor","Read check"]];
  rows.forEach(function(r){grid.push([r.inv,fmt(r.date),fmt(r.due),r.desc,(r.amount<0?"(":"")+Math.abs(r.amount).toFixed(2)+(r.amount<0?")":""),vendor,r.ok?"ok":"check"])});
  return {grid:grid,vendor:vendor,rows:rows.length,checked:checked,flagged:flagged};
};
var worker=null;
async function getWorker(progress){
  if(worker)return worker;
  if(!window.Tesseract){
    progress("Loading the scan reader (first time takes a moment)…");
    await new Promise(function(res,rej){var sc=document.createElement("script");sc.src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";sc.onload=res;sc.onerror=function(){rej(new Error("noocr"))};document.head.appendChild(sc)});
  }
  progress("Loading the scan reader (first time takes a moment)…");
  worker=await Tesseract.createWorker("eng",1);
  await worker.setParameters({preserve_interword_spaces:"1"});
  return worker;
}
window.ocrPdfToGrid=async function(data,progress){
  progress=progress||function(){};
  var pdf=await pdfjsLib.getDocument({data:data,isEvalSupported:false,disableFontFace:true}).promise;
  var w=await getWorker(progress),text=[];
  for(var i=1;i<=pdf.numPages;i++){
    progress("Reading scanned page "+i+" of "+pdf.numPages+"…");
    var pg=await pdf.getPage(i),vp=pg.getViewport({scale:3}),c=document.createElement("canvas");
    c.width=Math.round(vp.width);c.height=Math.round(vp.height);
    var ctx=c.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
    await pg.render({canvasContext:ctx,viewport:vp}).promise;
    var r=await w.recognize(c);text.push(r.data.text);
  }
  var out=parseStatementText(text.join("\n"));out.pages=pdf.numPages;return out;
};
})();
