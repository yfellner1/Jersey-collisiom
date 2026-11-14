(function(){
var $=function(s,r){return (r||document).querySelector(s)}, $all=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
function toast(m){var t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(t._h);t._h=setTimeout(function(){t.classList.remove("show")},2400)}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function money(n){if(n==null||isNaN(n))return "—";var s=Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});return (n<0?"−$":"$")+s}
function r2(n){return Math.round(n*100)/100}
function loadFixes(){try{return JSON.parse(localStorage.getItem("vendor-recon-fixes")||"{}")}catch(e){return {}}}
function saveFixes(f){try{localStorage.setItem("vendor-recon-fixes",JSON.stringify(f))}catch(e){}}
var fixes=loadFixes();

/* ---------- files ---------- */
var files={ccc:[],qb:[]}, seq=0;
$all(".drop").forEach(function(d){
  var side=d.dataset.side,input=$('input[type=file][data-side="'+side+'"]');
  d.addEventListener("click",function(){input.click()});
  d.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();input.click()}});
  d.addEventListener("dragover",function(e){e.preventDefault();d.classList.add("over")});
  d.addEventListener("dragleave",function(){d.classList.remove("over")});
  d.addEventListener("drop",function(e){e.preventDefault();d.classList.remove("over");Array.prototype.forEach.call(e.dataTransfer.files,function(f){addFile(side,f)})});
  input.addEventListener("change",function(){Array.prototype.forEach.call(input.files,function(f){addFile(side,f)});input.value=""});
});
function addFile(side,file){
  var F={id:++seq,side:side,name:file.name,kind:/\.pdf$/i.test(file.name)?"pdf":"table",status:"Reading…",cls:"",records:null};
  files[side].push(F);renderFiles(side);
  if(F.kind==="pdf")readPdf(F,file);else readTable(F,file);
}
function setF(F,status,cls){F.status=status;F.cls=cls||"";renderFiles(F.side);updateRun()}
function updateRun(){var busy=files.ccc.concat(files.qb).some(function(f){return f.busy||f.status==="Reading…"||/^Reading/.test(f.status)});
  $("#runBtn").disabled=busy||!(usable("ccc")&&usable("qb"));$("#runBtn").textContent=busy?"Reading files…":"Run report"}
function usable(side){return files[side].some(function(f){return f.kind==="table"?!!f.headers:!!f.records})}
function renderFiles(side){
  var box=$('[data-list="'+side+'"]');
  box.innerHTML=files[side].map(function(F){
    var detail="";
    if(F.kind==="table"&&F.headers)detail=(F.fromPdf&&F.side==="qb"?'<label class="hint" style="display:block;margin-top:.5rem">Vendor on this statement <input type="text" data-vo="'+F.id+'" value="'+esc(F.vendorOverride||"")+'" placeholder="Read from the columns" style="margin-top:.25rem"></label>':"")+'<details><summary>Columns used</summary><div class="map" data-fmap="'+F.id+'">'+mapHtml(F)+"</div></details>";
    return '<div class="fileitem"><div class="top"><div><div class="nm">'+esc(F.name)+'</div><div class="st '+F.cls+'">'+esc(F.status)+'</div></div><button class="rm" data-rm="'+F.id+'" aria-label="Remove '+esc(F.name)+'">×</button></div>'+detail+"</div>";
  }).join("");
  $all("[data-rm]",box).forEach(function(b){b.addEventListener("click",function(){files[side]=files[side].filter(function(f){return f.id!==+b.dataset.rm});renderFiles(side);updateRun()})});
  $all("[data-vo]",box).forEach(function(inp){inp.addEventListener("change",function(){var F=files[side].filter(function(f){return f.id===+inp.dataset.vo})[0];if(F)F.vendorOverride=inp.value.trim()})});
  $all("[data-fmap]",box).forEach(function(m){var F=files[side].filter(function(f){return f.id===+m.dataset.fmap})[0];
    $all("select,input",m).forEach(function(el){el.addEventListener("change",function(){if(el.type==="checkbox")F.map[el.dataset.k]=el.checked;else F.map[el.dataset.k]=+el.value})})});
}

/* ---------- PDF files ---------- */
async function readPdf(F,file){
  F.busy=true;
  try{
    if(!window.pdfjsLib||!window.pdfToGrid)throw new Error("nolib");
    if(pdfjsLib.GlobalWorkerOptions)pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    var r=await pdfToGrid(new Uint8Array(await file.arrayBuffer()));
    if(r.scanned){
      if(!window.ocrPdfToGrid){setF(F,"This PDF is a scanned image with no text to read. Export the report as CSV, Excel or a text PDF instead.","bad");return}
      var o=await ocrPdfToGrid(new Uint8Array(await file.arrayBuffer()),function(msg){setF(F,msg)});
      if(!o.rows){setF(F,"No invoice lines could be read from this scan. Try a clearer scan, or export the statement as CSV or Excel.","bad");return}
      F.kind="table";F.fromPdf=true;F.scanned=true;F.vendorOverride=o.vendor||"";
      setTable(F,o.grid);
      setF(F,"Scanned statement: "+o.rows+" invoice line"+(o.rows!==1?"s":"")+" read from "+o.pages+" page"+(o.pages>1?"s":"")+". "+
        (o.flagged.length?o.flagged.length+" amount"+(o.flagged.length>1?"s":"")+" didn’t match the running balance, so double-check: "+o.flagged.slice(0,6).join(", ")+(o.flagged.length>6?"…":"")+".":"Every amount matched the statement’s running balance.")+
        " Invoice numbers come from the scan, so an odd one may be off by a digit.",o.flagged.length?"":"good");
      return;
    }
    F.kind="table";F.fromPdf=true;
    setTable(F,r.grid);
    if(F.headers)setF(F,(F.rows.length)+" rows read from "+r.pages+" PDF page"+(r.pages>1?"s":"")+". Check “Columns used” below.","good");
  }catch(e){setF(F,e&&e.message==="nolib"?"The PDF reader didn’t load. Refresh the page and try again.":e&&e.message==="noocr"?"The scan reader didn’t load. Check the internet connection and add the file again.":"This PDF couldn’t be opened. Try exporting it as CSV or Excel.","bad")}
  finally{F.busy=false;updateRun()}
}

/* ---------- table files ---------- */
function readTable(F,file){
  if(/\.(xlsx|xls)$/i.test(file.name)){
    var fr=new FileReader();
    fr.onload=function(e){try{var wb=XLSX.read(new Uint8Array(e.target.result),{type:"array",cellDates:true});var ws=wb.Sheets[wb.SheetNames[0]];setTable(F,XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:"",dateNF:"mm/dd/yyyy"}))}catch(err){setF(F,"Couldn’t read this Excel file. Save it as CSV and try again.","bad")}};
    fr.readAsArrayBuffer(file);
  } else Papa.parse(file,{skipEmptyLines:true,complete:function(r){setTable(F,r.data)},error:function(){setF(F,"Couldn’t read this file.","bad")}});
}
var KEYS=/(vendor|supplier|invoice|inv\b|num|no\.|ref|date|amount|amt|total|balance|type|r\.?o\b|repair\s*order|memo)/i;
function filled(r){return (r||[]).filter(function(c){return String(c).trim()!==""})}
function findHeaderRow(g){for(var i=0;i<Math.min(g.length,30);i++){var f=filled(g[i]);if(f.length>=3&&f.filter(function(c){return KEYS.test(String(c))}).length>=2)return i}for(var j=0;j<g.length;j++)if(filled(g[j]).length>=3)return j;return 0}
function guess(H,pats){for(var p=0;p<pats.length;p++)for(var i=0;i<H.length;i++)if(pats[p].test(H[i]))return i;return -1}
function setTable(F,grid){
  grid=grid.filter(function(r){return r&&filled(r).length});
  if(grid.length<2){setF(F,"No rows found in this file.","bad");return}
  var h=findHeaderRow(grid),H=grid[h].map(function(c,i){var s=String(c).trim();return s||("Column "+(i+1))});
  F.headers=H;F.rows=grid.slice(h+1);
  var side=F.side;
  F.map={
    inv:guess(H,[/invoice\s*(#|no|num|number)/i,/^inv(oice)?\.?\s*#?$/i,/ref(erence)?\s*(#|no)/i,/^num(ber)?$|^no\.?$|^#$/i,/invoice/i,/bill\s*(#|no)/i]),
    ven:guess(H,[/vendor|supplier/i,/^name$|payee|source/i]),
    amt:side==="ccc"?guess(H,[/invoice\s*total|^total$|total\s*(amount|due)|^balance$/i,/total/i,/amount|amt/i]):guess(H,[/^amount$/i,/original\s*amount/i,/amount|amt/i,/total/i]),
    dt:guess(H,[/invoice\s*date|^date$/i,/date/i]),
    ro:guess(H,[/repair\s*order|^r\.?o\.?\s*(#|no|num|number)?$/i,/\bro\b|work\s*file/i]),
    ty:guess(H,[/transaction\s*type|^type$/i]),
    skip:true
  };
  if(F.map.inv<0)F.map.inv=0;if(F.map.amt<0)F.map.amt=Math.min(1,H.length-1);
  setF(F,F.rows.length+" rows loaded","good");
}
function mapHtml(F){
  var H=F.headers;
  function sel(k,label,none){return '<label>'+label+'</label><select data-k="'+k+'">'+(none?'<option value="-1">'+none+"</option>":"")+H.map(function(h,i){return '<option value="'+i+'"'+(i===F.map[k]?" selected":"")+">"+esc(h)+"</option>"}).join("")+"</select>"}
  return sel("inv","Invoice #")+sel("ven","Vendor",F.side==="qb"?"From section headings":"None")+sel("amt","Invoice total")+sel("dt","Date","None")+
    (F.side==="ccc"?sel("ro","RO #","None"):sel("ty","Type","None")+'<label class="check"><input type="checkbox" data-k="skip"'+(F.map.skip?" checked":"")+"> Skip payments</label>");
}

/* ---------- parsing ---------- */
function normInv(v){var s=String(v==null?"":v).toUpperCase().trim();if(!s)return "";s=s.replace(/^(INV(OICE)?|BILL)\s*#?\s*/,"").replace(/[^A-Z0-9]/g,"").replace(/^0+(?=[A-Z0-9])/,"");return s}
function normVen(v){return String(v||"").toUpperCase().replace(/&/g," AND ").replace(/\b(INC|LLC|CORP|CORPORATION|CO|COMPANY|LTD|THE|OF|AND)\b/g," ").replace(/[^A-Z0-9 ]/g," ").replace(/\s+/g," ").trim()}
function sameVendor(a,b){var x=normVen(a),y=normVen(b);if(!x||!y)return true;if(x===y)return true;var X=x.replace(/ /g,""),Y=y.replace(/ /g,"");if(X.indexOf(Y)>-1||Y.indexOf(X)>-1)return true;var fx=x.split(" ")[0],fy=y.split(" ")[0];return fx.length>=3&&fx===fy}
function invSim(a,b){a=normInv(a);b=normInv(b);if(!a||!b)return 0;if(a===b)return 1;
  var m=a.length,n=b.length,dp=[];for(var i=0;i<=m;i++){dp[i]=[];for(var j=0;j<=n;j++)dp[i][j]=i&&j?0:0}
  for(i=1;i<=m;i++)for(j=1;j<=n;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]+1:Math.max(dp[i-1][j],dp[i][j-1]);
  return dp[m][n]/Math.max(m,n)}
function parseAmt(v){if(typeof v==="number")return v;var s=String(v==null?"":v).trim();if(!s)return NaN;var neg=/^\(.*\)$/.test(s)||/^-/.test(s)||/-$/.test(s)||/^−/.test(s);s=s.replace(/[^0-9.]/g,"");if(!s)return NaN;var n=parseFloat(s);return neg?-n:n}
function parseDate(v){if(!v)return null;if(v instanceof Date)return v;var s=String(v).trim(),m;
  if((m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))){var y=+m[3];if(y<100)y+=2000;return new Date(y,+m[1]-1,+m[2])}
  if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)))return new Date(+m[1],+m[2]-1,+m[3]);var d=new Date(s);return isNaN(d)?null:d}
function ymd(d){return d?d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"):""}
function showDate(d){return d?(d.getMonth()+1)+"/"+d.getDate()+"/"+d.getFullYear():"—"}
function tableRecords(F){
  var m=F.map,out=[],section="",last=null;
  F.rows.forEach(function(r){
    var f=filled(r),first=String(r[0]||"").trim();
    if(/^total\b/i.test(first)||f.some(function(c){return /^total\s+for\b/i.test(String(c).trim())}))return;
    if(m.ven<0&&F.side==="qb"&&f.length===1&&isNaN(parseAmt(f[0]))){section=String(f[0]).trim();last=null;return}
    var type=m.ty>-1?String(r[m.ty]||""):"";
    if(F.side==="qb"&&m.skip&&/payment|check|deposit|transfer/i.test(type)&&!/credit/i.test(type))return;
    var amt=parseAmt(r[m.amt]);if(/credit/i.test(type)&&amt>0)amt=-amt;
    var raw=String(r[m.inv]||"").trim();
    if(!raw){if(last)return; if(isNaN(amt))return;} // blank invoice # under an invoice = an item line, not an invoice
    var rec={invRaw:raw,vendor:F.vendorOverride||(m.ven>-1?String(r[m.ven]||"").trim():section),amt:amt,date:m.dt>-1?parseDate(r[m.dt]):null,ro:F.side==="ccc"&&m.ro>-1?String(r[m.ro]||"").trim():""};
    if(raw)last=rec;
    out.push(rec);
  });
  return invoiceTotals(out);
}
// One record per invoice. Rows repeating the same invoice # in a file are its items:
// use the invoice total once, never the item amounts.
function invoiceTotals(recs){
  var groups={},order=[];
  recs.forEach(function(r){
    if(!r.invRaw){order.push([r]);return}
    var k=normVen(r.vendor)+"|"+normInv(r.invRaw);
    if(!groups[k]){groups[k]=[];order.push(groups[k])}
    groups[k].push(r);
  });
  return order.map(function(g){
    if(g.length===1)return g[0];
    var vals=g.map(function(r){return r.amt}).filter(function(v){return !isNaN(v)});
    var total;
    if(!vals.length)total=NaN;
    else if(vals.every(function(v){return Math.abs(v-vals[0])<.005}))total=vals[0];          // same total repeated on every item row
    else{
      var mx=vals.reduce(function(a,b){return Math.abs(b)>Math.abs(a)?b:a}),rest=vals.reduce(function(a,b){return a+b},0)-mx;
      total=Math.abs(rest-mx)<.02?mx:vals.reduce(function(a,b){return a+b},0);                 // a total row is present, or only item prices
    }
    var r=Object.assign({},g[0]);r.amt=total;r.ro=g.map(function(x){return x.ro}).filter(function(v,i,a){return v&&a.indexOf(v)===i}).join(", ");
    return r;
  });
}
function gather(side){
  var from=$("#dFrom").value,to=$("#dTo").value,sv=$("#stmtVendor").value.trim(),all=[];
  files[side].forEach(function(F){
    var recs=F.kind==="table"&&F.headers?tableRecords(F):[];
    recs.forEach(function(r){
      var inP=!(r.date&&((from&&ymd(r.date)<from)||(to&&ymd(r.date)>to)));
      var x={inv:normInv(r.invRaw),raw:r.invRaw,vendor:r.vendor||(side==="qb"?sv:""),amt:isNaN(r.amt)?0:r2(r.amt),date:r.date,ro:r.ro,file:F.name,inPeriod:inP,scanned:!!F.scanned};
      all.push(x);
    });
  });
  return all;
}

/* ---------- credit rules ---------- */
var DEFAULT_RULES=[{vendor:"Abington Auto Parts Honda",prefix:"CM"}];
function loadRules(){try{var r=JSON.parse(localStorage.getItem("recon-credit-rules")||"null");return Array.isArray(r)?r:DEFAULT_RULES.slice()}catch(e){return DEFAULT_RULES.slice()}}
var rules=loadRules();
function saveRules(){try{localStorage.setItem("recon-credit-rules",JSON.stringify(rules))}catch(e){}}
function isCredit(x){var raw=String(x.raw||x.invRaw||"").toUpperCase().replace(/\s/g,"");return rules.some(function(r){return r.prefix&&raw.indexOf(String(r.prefix).toUpperCase().replace(/\s/g,""))===0&&(!r.vendor||sameVendor(r.vendor,x.vendor))})}
function renderRules(){
  var box=$("#rulesList");
  box.innerHTML=rules.length?rules.map(function(r,i){return '<div class="rule"><span><b>'+esc(r.vendor||"Any vendor")+'</b>: invoice # starting with <b>'+esc(r.prefix)+'</b> is a credit</span><button class="rm" data-rr="'+i+'" aria-label="Remove rule">×</button></div>'}).join(""):'<p class="hint">No rules yet.</p>';
  $all("[data-rr]",box).forEach(function(b){b.addEventListener("click",function(){rules.splice(+b.dataset.rr,1);saveRules();renderRules();if(R)reconcile()})});
}
$("#ruleAdd").addEventListener("click",function(){var v=$("#ruleVendor").value.trim(),p=$("#rulePrefix").value.trim();if(!p){$("#rulePrefix").focus();return}rules.push({vendor:v,prefix:p});saveRules();$("#ruleVendor").value="";$("#rulePrefix").value="";renderRules();toast("Rule added");if(R)reconcile()});
renderRules();
function setLastMonth(){var d=new Date(),a=new Date(d.getFullYear(),d.getMonth()-1,1),b=new Date(d.getFullYear(),d.getMonth(),0);$("#dFrom").value=ymd(a);$("#dTo").value=ymd(b)}
setLastMonth();
$("#lastMonth").addEventListener("click",function(){setLastMonth();if(R)reconcile()});

/* ---------- reconcile ---------- */
var R=null;
function reconcile(){
  var tol=Math.max(0,parseFloat($("#tol").value)||0)+0.004;
  var C=gather("ccc"),Qall=gather("qb");
  var outsideQ=Qall.filter(function(q){return !q.inPeriod&&!isCredit(q)}).length;
  var credits=Qall.filter(isCredit), Q=Qall.filter(function(q){return q.inPeriod&&!isCredit(q)});
  var creditInv={};credits.forEach(function(q){if(q.inv)creditInv[q.inv]=1});
  credits=credits.map(function(q){var inC=C.filter(function(c){return c.inv&&c.inv===q.inv});return {inv:q.raw,vendor:q.vendor,date:q.date,qb:q.amt,inCCC:inC.length>0,ro:inC.map(function(c){return c.ro}).filter(function(v,i,a){return v&&a.indexOf(v)===i}).join(", ")}});
  C=C.filter(function(c){return !(c.inv&&creditInv[c.inv])&&!isCredit(c)});
  var stmtVendors=[];Q.forEach(function(q){if(q.vendor&&!stmtVendors.some(function(v){return sameVendor(v,q.vendor)}))stmtVendors.push(q.vendor)});
  var onStmtVendor=function(v){return !v||stmtVendors.some(function(s){return sameVendor(s,v)})};
  var byInv={};
  C.forEach(function(c){if(c.inv)(byInv[c.inv]=byInv[c.inv]||{c:[],q:[]}).c.push(c)});
  Q.forEach(function(q){if(q.inv)(byInv[q.inv]=byInv[q.inv]||{c:[],q:[]}).q.push(q)});
  var out={missing:[],wrong:[],byAmt:[],off:[],dup:[],notOnStmt:[],noInv:[],matched:[],credits:credits,outsideQ:outsideQ,otherVendor:0,otherRows:[],oldRows:[],cCount:C.length,qCount:Q.length,stmtVendors:stmtVendors};
  Object.keys(byInv).forEach(function(k){
    var g=byInv[k];
    if(!g.q.length){
      g.c.forEach(function(c){var x={inv:c.raw,vendor:c.vendor,date:c.date,ro:c.ro,ccc:c.amt};if(!c.inPeriod)out.oldRows.push(x);else if(onStmtVendor(c.vendor))out.notOnStmt.push(x);else{out.otherVendor++;out.otherRows.push(x)}});
      return;
    }
    g.q.forEach(function(q){
      var right=g.c.filter(function(c){return sameVendor(c.vendor,q.vendor)}), wrongV=g.c.filter(function(c){return !sameVendor(c.vendor,q.vendor)});
      var base={inv:q.raw,vendor:q.vendor,date:q.date,qb:q.amt,scanned:q.scanned};
      if(!right.length&&!wrongV.length){out.missing.push(base);return}
      if(!right.length&&wrongV.length){
        var w=wrongV[0];out.wrong.push(Object.assign({},base,{cccVendor:wrongV.map(function(x){return x.vendor}).filter(function(v,i,a){return a.indexOf(v)===i}).join(", "),ro:wrongV.map(function(x){return x.ro}).filter(function(v,i,a){return v&&a.indexOf(v)===i}).join(", "),ccc:r2(wrongV.reduce(function(s,x){return s+x.amt},0)),sameAmt:Math.abs(wrongV.reduce(function(s,x){return s+x.amt},0)-q.amt)<=tol}));
        return;
      }
      var sum=r2(right.reduce(function(s,x){return s+x.amt},0)),ro=right.map(function(x){return x.ro}).filter(function(v,i,a){return v&&a.indexOf(v)===i}).join(", ");
      var row=Object.assign({},base,{ccc:sum,ro:ro,count:right.length});
      if(right.length>1&&Math.abs(sum-q.amt*right.length)<=tol)out.dup.push(row);
      else if(Math.abs(sum-q.amt)<=tol)(right.length>1?out.dup:out.matched).push(row);
      else out.off.push(Object.assign(row,{diff:r2(q.amt-sum)}));
      if(wrongV.length)out.wrong.push(Object.assign({},base,{cccVendor:wrongV.map(function(x){return x.vendor}).join(", "),ro:wrongV.map(function(x){return x.ro}).filter(function(v,i,a){return v&&a.indexOf(v)===i}).join(", "),ccc:r2(wrongV.reduce(function(s,x){return s+x.amt},0)),also:true}));
    });
  });
  // second pass: match leftover statement invoices to leftover CCC invoices by amount
  var pool=out.notOnStmt.map(function(x){return {x:x,list:"n"}}).concat(out.otherRows.map(function(x){return {x:x,list:"o"}})).concat(out.oldRows.map(function(x){return {x:x,list:"old"}}));
  var used={};
  out.missing.slice().sort(function(a,b){return Math.abs(b.qb)-Math.abs(a.qb)}).forEach(function(q){
    if(!q.qb)return;
    var cands=pool.map(function(p,i){return {p:p,i:i}}).filter(function(o){
      if(used[o.i])return false;var x=o.p.x;if(Math.abs(x.ccc-q.qb)>tol)return false;
      var sv=sameVendor(x.vendor,q.vendor),sim=invSim(x.inv,q.inv);
      if(x.date&&q.date&&Math.abs(x.date-q.date)/864e5>45)return false;
      return sv||sim>=.5;
    }).map(function(o){var x=o.p.x,sv=sameVendor(x.vendor,q.vendor),days=(x.date&&q.date)?Math.abs(x.date-q.date)/864e5:null;
      o.score=(sv?3:0)+invSim(x.inv,q.inv)*2+(days==null?0:days<=7?1.5:days<=31?.5:-1);o.sv=sv;o.days=days;return o});
    if(!cands.length)return;
    cands.sort(function(a,b){return b.score-a.score});
    var best=cands[0];used[best.i]=1;
    var x=best.p.x;
    out.byAmt.push({inv:q.inv,vendor:q.vendor,date:q.date,qb:q.qb,cccInv:x.inv,cccVendor:x.vendor,cccDate:x.date,ro:x.ro,ccc:x.ccc,sameVendor:best.sv,days:best.days,others:cands.length-1,scanned:q.scanned});
    q._byAmt=true;
    if(best.p.list==="o")out.otherVendor--;x._used=true;
  });
  out.missing=out.missing.filter(function(q){return !q._byAmt});
  out.notOnStmt=out.notOnStmt.filter(function(x){return !x._used});
  C.forEach(function(c){if(!c.inv&&c.amt&&c._used)c._skip=true});
  C.concat(Q).forEach(function(x){if(x._skip)return;if(!x.inv&&x.amt)out.noInv.push({inv:"",vendor:x.vendor,date:x.date,ro:x.ro,amt:x.amt,file:x.file})});
  var byV=function(a,b){return String(a.vendor).localeCompare(String(b.vendor))||((a.date||0)-(b.date||0))};
  ["missing","wrong","byAmt","off","dup","notOnStmt","matched"].forEach(function(k){out[k].sort(byV)});
  R=out;render();
  $("#results").style.display="block";
  $("#results").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
}
$("#runBtn").addEventListener("click",reconcile);

/* ---------- report ---------- */
function vk(v){return normVen(v).replace(/ /g,"")}
function fkey(kind,r){return kind+"|"+vk(r.vendor)+"|"+normInv(r.inv)}
function isFixed(kind,r){var f=fixes[fkey(kind,r)];return f&&f.done}
function fixCell(kind,r,ph){var k=fkey(kind,r),f=fixes[k]||{};return '<div class="fixcell"><input type="checkbox" data-k="'+esc(k)+'"'+(f.done?" checked":"")+' aria-label="Mark fixed"><input type="text" data-n="'+esc(k)+'" placeholder="'+esc(ph)+'" value="'+esc(f.note||"")+'"></div>'}
function groupBy(list){var g={};list.forEach(function(r){(g[r.vendor||"Unknown vendor"]=g[r.vendor||"Unknown vendor"]||[]).push(r)});return g}
function sumQ(list){return r2(list.reduce(function(s,r){return s+(r.qb||0)},0))}
function render(){
  var o=R,openMissing=o.missing.filter(function(r){return !isFixed("m",r)}),openWrong=o.wrong.filter(function(r){return !isFixed("w",r)});
  var otherN=o.off.length+o.dup.length+o.notOnStmt.length+o.noInv.length+(o.outsideQ?1:0);
  var ov=o.otherRows.filter(function(x){return !x._used}).sort(function(a,b){return String(a.vendor).localeCompare(String(b.vendor))||((a.date||0)-(b.date||0))});o.ov=ov;
  var parts=[];
  if(o.missing.length)parts.push(o.missing.length+" invoice"+(o.missing.length>1?"s":"")+" missing from CCC ("+money(sumQ(o.missing))+")");
  if(o.byAmt.length)parts.push(o.byAmt.length+" matched by amount with a different invoice #");
  if(o.wrong.length)parts.push(o.wrong.length+" under the wrong vendor in CCC");
  var creditNote=o.credits.length?" "+o.credits.length+" credit"+(o.credits.length>1?"s are":" is")+" listed separately.":"";
  $("#tally").textContent=parts.length?(parts.length>1?parts.slice(0,-1).join(", ")+" and "+parts[parts.length-1]:parts[0])+".":"Every statement invoice in the period is in CCC under the right vendor.";
  $("#tally").textContent+=creditNote;
  var now=new Date();$("#repMeta").textContent="REPORT · "+now.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})+" · "+(o.stmtVendors.length?o.stmtVendors.length+" vendor statement"+(o.stmtVendors.length>1?"s":""):"Statements")+" · "+files.ccc.length+" CCC file"+(files.ccc.length!==1?"s":"")+($("#dFrom").value||$("#dTo").value?" · INVOICES DATED "+($("#dFrom").value?showDate(parseDate($("#dFrom").value)):"…")+" TO "+($("#dTo").value?showDate(parseDate($("#dTo").value)):"…"):"");
  $("#stats").innerHTML=stat(o.qCount,"statement invoices in period","")+stat(o.matched.length,"matched in CCC","green")+stat(o.missing.length,"missing from CCC","red")+stat(o.byAmt.length,"matched by amount, invoice # differs","amber")+stat(o.wrong.length,"wrong vendor in CCC","purple");
  // missing
  var h='<div class="sh"><div><h2>Missing from CCC</h2><p class="hint">On a vendor statement, but not entered in CCC. The parts manager needs to find these and enter them.</p></div>'+(openMissing.length?'<button class="primary" id="partsBtn">Copy list for parts manager ('+openMissing.length+")</button>":"")+"</div>";
  if(!o.missing.length)h+='<p class="okmsg">None. Every statement invoice is in CCC.</p>';
  else{var g=groupBy(o.missing);Object.keys(g).sort().forEach(function(v){h+='<div class="vgroup"><h3>'+esc(v)+' <span class="hint">· '+g[v].length+" · "+money(sumQ(g[v]))+'</span></h3><div class="tablewrap"><table><thead><tr><th>Invoice #</th><th>Date</th><th class="num">Amount</th><th>Done / note</th></tr></thead><tbody>'+
    g[v].map(function(r){return '<tr class="'+(isFixed("m",r)?"fixed":"")+'"><td class="ro">'+esc(r.inv)+"</td><td>"+showDate(r.date)+'</td><td class="num">'+money(r.qb)+"</td><td>"+fixCell("m",r,"e.g. sent to parts mgr 11/6")+"</td></tr>"}).join("")+"</tbody></table></div></div>"})}
  var sm=$("#secMissing");sm.className="rsec "+(o.missing.length?"red":"clear");sm.innerHTML=h;
  // credits
  h='<div class="sh"><div><h2>Credits on the statement</h2><p class="hint">Credit memos from your credit rules. Not counted as missing. They usually belong to earlier months.</p></div></div>';
  if(!o.credits.length)h+='<p class="hint" style="margin:0">No credits on these statements.</p>';
  else h+='<div class="tablewrap"><table><thead><tr><th>Vendor</th><th>Credit #</th><th>Date</th><th class="num">Amount</th><th>In CCC?</th></tr></thead><tbody>'+
    o.credits.map(function(r){return "<tr><td>"+esc(r.vendor||"—")+'</td><td class="ro">'+esc(r.inv)+"</td><td>"+showDate(r.date)+'</td><td class="num">'+money(r.qb)+"</td><td>"+(r.inCCC?'<span class="tag s-ok">Yes'+(r.ro?" · RO "+esc(r.ro):"")+"</span>":'<span class="tag s-none">No</span>')+"</td></tr>"}).join("")+"</tbody></table></div>";
  var sc=$("#secCredits");sc.style.display=o.credits.length||rules.length?"":"none";sc.innerHTML=h;
  // matched by amount
  h='<div class="sh"><div><h2>Matched by amount, invoice # entered differently</h2><p class="hint">These statement invoices had no invoice # match in CCC, but a CCC invoice has the same amount. The invoice # was probably typed differently. Check each one and correct the invoice # in CCC.</p></div></div>';
  if(!o.byAmt.length)h+='<p class="okmsg">None.</p>';
  else h+='<div class="tablewrap"><table><thead><tr><th>Vendor</th><th>Statement invoice #</th><th>CCC invoice #</th><th>Dates</th><th>RO #</th><th class="num">Amount</th><th>How sure</th><th>Fixed / note</th></tr></thead><tbody>'+
    o.byAmt.map(function(r){
      var conf=[];if(r.sameVendor)conf.push("Same vendor");else conf.push("Different vendor in CCC: "+(r.cccVendor||"none"));
      if(r.days!=null)conf.push(r.days<1?"Same date":Math.round(r.days)+" day"+(Math.round(r.days)===1?"":"s")+" apart");
      if(invSim(r.inv,r.cccInv)>=.6)conf.push("Similar invoice #");
      if(r.scanned)conf.push("Statement is a scan, so the scan may have misread the statement invoice #");
      if(r.others)conf.push(r.others+" other CCC invoice"+(r.others>1?"s":"")+" with the same amount");
      var strong=r.sameVendor&&(r.days==null||r.days<=7)&&!r.others;
      return '<tr class="'+(isFixed("a",r)?"fixed":"")+'"><td>'+esc(r.vendor||"—")+'</td><td class="ro">'+esc(r.inv)+'</td><td class="ro" style="color:var(--warn)">'+esc(r.cccInv||"(blank)")+"</td><td>"+showDate(r.date)+(r.cccDate&&ymd(r.cccDate)!==ymd(r.date)?'<div class="hint" style="font-size:.8rem">CCC: '+showDate(r.cccDate)+"</div>":"")+"</td><td>"+esc(r.ro||"—")+'</td><td class="num">'+money(r.qb)+'</td><td><span class="tag '+(strong?"s-ok":"s-off")+'">'+(strong?"Likely":"Check")+'</span><div class="hint" style="font-size:.8rem;margin-top:.2rem">'+esc(conf.join(" · "))+"</div></td><td>"+fixCell("a",r,"e.g. fixed inv # in CCC")+"</td></tr>"}).join("")+"</tbody></table></div>";
  var sa=$("#secAmount");sa.className="rsec "+(o.byAmt.length?"amber":"clear");sa.innerHTML=h;
  // CCC invoices from vendors not on the statements
  h='<div class="sh"><div><h2>CCC invoices from other vendors</h2><p class="hint">Entered in CCC for the period, but the vendor doesn’t match any vendor statement loaded. Check whether each one has the right vendor in CCC, or whether that vendor’s statement is missing.</p></div></div>';
  if(!ov.length)h+='<p class="okmsg">None. Every CCC invoice in the period is from a vendor with a statement.</p>';
  else{var gv=groupBy(ov.map(function(x){return Object.assign({},x,{qb:x.ccc})}));Object.keys(gv).sort().forEach(function(v){h+='<div class="vgroup"><h3>'+esc(v)+' <span class="hint">· '+gv[v].length+" · "+money(sumQ(gv[v]))+'</span></h3><div class="tablewrap"><table><thead><tr><th>Invoice #</th><th>Date</th><th>RO #</th><th class="num">Amount</th><th>Checked / note</th></tr></thead><tbody>'+
    gv[v].map(function(r){return '<tr class="'+(isFixed("o",r)?"fixed":"")+'"><td class="ro">'+esc(r.inv||"—")+"</td><td>"+showDate(r.date)+"</td><td>"+esc(r.ro||"—")+'</td><td class="num">'+money(r.ccc)+"</td><td>"+fixCell("o",r,"Add a note")+"</td></tr>"}).join("")+"</tbody></table></div></div>"})}
  var sov=$("#secOtherVen");sov.className="rsec "+(ov.length?"purple":"clear");sov.innerHTML=h;
  // wrong vendor
  h='<div class="sh"><div><h2>Wrong vendor in CCC</h2><p class="hint">The invoice number is on one vendor’s statement, but it’s entered in CCC under a different vendor.</p></div></div>';
  if(!o.wrong.length)h+='<p class="okmsg">None. Every matched invoice is under the right vendor.</p>';
  else h+='<div class="tablewrap"><table><thead><tr><th>Invoice #</th><th>Entered in CCC under</th><th>Should be (per statement)</th><th>RO #</th><th class="num">CCC</th><th class="num">Statement</th><th>Fixed / note</th></tr></thead><tbody>'+
    o.wrong.map(function(r){return '<tr class="'+(isFixed("w",r)?"fixed":"")+'"><td class="ro">'+esc(r.inv)+'</td><td><span class="tag s-dup">'+esc(r.cccVendor||"No vendor")+'</span></td><td class="vs">'+esc(r.vendor||"—")+"</td><td>"+esc(r.ro||"—")+'</td><td class="num">'+money(r.ccc)+'</td><td class="num">'+money(r.qb)+(r.also?'<div class="hint" style="font-size:.8rem">Also entered under the right vendor</div>':r.sameAmt?'<div class="hint" style="font-size:.8rem">Same amount</div>':"")+"</td><td>"+fixCell("w",r,"Add a note")+"</td></tr>"}).join("")+"</tbody></table></div>";
  var sw=$("#secWrong");sw.className="rsec "+(o.wrong.length?"purple":"clear");sw.innerHTML=h;
  // other
  var so=$("#secOther");so.style.display=otherN?"":"none";
  $("summary",so).textContent="Other things to check ("+otherN+")";
  h="";
  if(o.off.length)h+=sub("Amount doesn’t match","Same vendor and invoice #, different amount.",["Vendor","Invoice #","Date","RO #","CCC","Statement","Difference"],o.off.map(function(r){return [esc(r.vendor),esc(r.inv),showDate(r.date),esc(r.ro||"—"),money(r.ccc),money(r.qb),money(r.diff)]}));
  if(o.dup.length)h+=sub("Entered more than once in CCC","",["Vendor","Invoice #","Date","RO #","Times in CCC","CCC total","Statement"],o.dup.map(function(r){return [esc(r.vendor),esc(r.inv),showDate(r.date),esc(r.ro||"—"),r.count,money(r.ccc),money(r.qb)]}));
  if(o.notOnStmt.length)h+=sub("In CCC, not on any statement","Dated in the period and for a statement vendor, but the invoice # isn’t on the statement.",["Vendor","Invoice #","Date","RO #","CCC"],o.notOnStmt.map(function(r){return [esc(r.vendor),esc(r.inv),showDate(r.date),esc(r.ro||"—"),money(r.ccc)]}));
  if(o.noInv.length)h+=sub("Rows with no invoice #","",["File","Vendor","Date","Amount"],o.noInv.map(function(r){return [esc(r.file),esc(r.vendor||"—"),showDate(r.date),money(r.amt)]}));
  if(o.outsideQ)h+='<p class="hint" style="margin-top:1rem">'+o.outsideQ+" statement invoice"+(o.outsideQ>1?"s are":" is")+" dated outside the period, so "+(o.outsideQ>1?"they weren’t":"it wasn’t")+" checked.</p>";
    $(".inner",so).innerHTML=h;
  var mt=$("#secMatched");$("summary",mt).textContent="Matched invoices ("+o.matched.length+")";
  $(".inner",mt).innerHTML=o.matched.length?sub("","",["Vendor","Invoice #","Date","RO #","Amount"],o.matched.map(function(r){return [esc(r.vendor),esc(r.inv),showDate(r.date),esc(r.ro||"—"),money(r.qb)]})):'<p class="hint">None.</p>';
  wireFixes();
  var pb=$("#partsBtn");if(pb)pb.addEventListener("click",copyParts);
}
function stat(n,l,c){return '<div class="stat '+c+'"><b>'+n+"</b><span>"+l+"</span></div>"}
function sub(t,d,head,rows){var num=function(h){return /CCC|Statement|Difference|Amount|total|Times/i.test(h)};return '<div class="vgroup">'+(t?"<h3>"+t+"</h3>":"")+(d?'<p class="hint" style="margin:-.2rem 0 .5rem">'+d+"</p>":"")+'<div class="tablewrap"><table><thead><tr>'+head.map(function(h){return '<th class="'+(num(h)?"num":"")+'">'+h+"</th>"}).join("")+"</tr></thead><tbody>"+rows.map(function(r){return "<tr>"+r.map(function(c,i){return '<td class="'+(num(head[i])?"num":"")+'">'+c+"</td>"}).join("")+"</tr>"}).join("")+"</tbody></table></div></div>"}
function wireFixes(){
  $all("input[data-k]").forEach(function(cb){cb.addEventListener("change",function(){var k=cb.dataset.k;fixes[k]=fixes[k]||{};fixes[k].done=cb.checked;saveFixes(fixes);toast(cb.checked?"Marked done":"Unmarked");render()})});
  $all("input[data-n]").forEach(function(i){i.addEventListener("change",function(){var k=i.dataset.n;fixes[k]=fixes[k]||{};fixes[k].note=i.value;saveFixes(fixes);toast("Note saved")})});
}

/* ---------- copy ---------- */
function copyText(text,msg){var fb=$("#fallback");function fall(){fb.style.display="block";fb.value=text;fb.focus();fb.select();toast("Select all and copy the text below")}
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(function(){fb.style.display="none";toast(msg)},fall);else fall()}
function missingLines(list){var L=[],g=groupBy(list);Object.keys(g).sort().forEach(function(v){L.push(v);g[v].forEach(function(r){L.push("  Invoice "+r.inv+" · "+showDate(r.date)+" · "+money(r.qb))});L.push("")});return L}
function copyParts(){
  var m=R.missing.filter(function(r){return !isFixed("m",r)});
  var L=["Hi, these vendor invoices are on the vendor statements but aren’t entered in CCC. Can you find them and enter them?",""].concat(missingLines(m));
  L.push("Total: "+m.length+" invoice"+(m.length>1?"s":"")+", "+money(sumQ(m)));
  copyText(L.join("\n"),"Copied. Paste it into a message to the parts manager.");
}
$("#copyReport").addEventListener("click",function(){
  var o=R,L=["VENDOR INVOICE RECONCILIATION",$("#repMeta").textContent.replace(/^REPORT · /,""),"",$("#tally").textContent,""];
  L.push("MISSING FROM CCC ("+o.missing.length+")");if(!o.missing.length)L.push("None.","");else L=L.concat(missingLines(o.missing));
  L.push("MATCHED BY AMOUNT, INVOICE # ENTERED DIFFERENTLY ("+o.byAmt.length+")");if(!o.byAmt.length)L.push("None.");else o.byAmt.forEach(function(r){L.push("  "+(r.vendor||"—")+": statement invoice "+r.inv+" = CCC invoice "+(r.cccInv||"(blank)")+(r.ro?" · RO "+r.ro:"")+" · "+money(r.qb)+(r.sameVendor?"":" · CCC vendor: "+(r.cccVendor||"none")))});
  L.push("");
  L.push("CREDITS ON THE STATEMENT, NOT MISSING ("+o.credits.length+")");if(!o.credits.length)L.push("None.");else o.credits.forEach(function(r){L.push("  "+(r.vendor||"—")+" credit "+r.inv+" · "+showDate(r.date)+" · "+money(r.qb)+(r.inCCC?" · in CCC":" · not in CCC"))});
  L.push("");
  L.push("WRONG VENDOR IN CCC ("+o.wrong.length+")");if(!o.wrong.length)L.push("None.");else o.wrong.forEach(function(r){L.push("  Invoice "+r.inv+": entered under "+(r.cccVendor||"no vendor")+", should be "+(r.vendor||"—")+(r.ro?" · RO "+r.ro:"")+" · "+money(r.qb))});
  L.push("","CCC INVOICES FROM OTHER VENDORS, NOT ON ANY STATEMENT ("+o.ov.length+")");if(!o.ov.length)L.push("None.");else o.ov.forEach(function(r){L.push("  "+(r.vendor||"No vendor")+" invoice "+(r.inv||"—")+" · "+showDate(r.date)+(r.ro?" · RO "+r.ro:"")+" · "+money(r.ccc))});
  if(o.off.length){L.push("","AMOUNT DOESN’T MATCH ("+o.off.length+")");o.off.forEach(function(r){L.push("  "+r.vendor+" invoice "+r.inv+": CCC "+money(r.ccc)+", statement "+money(r.qb))})}
  if(o.dup.length){L.push("","ENTERED MORE THAN ONCE IN CCC ("+o.dup.length+")");o.dup.forEach(function(r){L.push("  "+r.vendor+" invoice "+r.inv+": "+r.count+" times")})}
  L.push("","Matched: "+o.matched.length+" of "+o.qCount+" statement invoices.");
  copyText(L.join("\n"),"Report copied. Paste it into an email or document.");
});

/* ---------- sample ---------- */
function fakeFile(side,name,grid){var F={id:++seq,side:side,name:name,kind:"table",status:"",cls:""};files[side].push(F);setTable(F,grid);renderFiles(side)}
$("#sampleBtn").addEventListener("click",function(){
  files={ccc:[],qb:[]};renderFiles("ccc");renderFiles("qb");
  fakeFile("ccc","ccc-invoices-oct-week1.csv",[["Vendor","Invoice #","Invoice Date","RO #","Invoice Total"],
    ["LKQ Corporation","8812034","10/02/2026","10412","1,284.50"],["Keystone Automotive","K-55190","10/03/2026","10415","418.00"],
    ["Toyota of Lakewood","TL-20931","10/06/2026","10418","2,311.80"],["LKQ Corporation","8812290","10/07/2026","10418","642.10"]]);
  fakeFile("ccc","ccc-invoices-oct-week2.csv",[["Vendor","Invoice #","Invoice Date","RO #","Invoice Total"],
    ["Keystone Automotive","K-55302","10/09/2026","10421","1,077.35"],["Keystone Automotive","TL-20977","10/14/2026","10426","903.40"],
    ["FinishMaster","FM-449021","10/10/2026","10423","586.25"],["FinishMaster","FM-449021","10/10/2026","10423","586.25"],["Gerber Glass","GG-1180","10/15/2026","10430","389.00"],["Toyota of Lakewood","TL-21080","10/19/2026","10433","1,456.75"],["Abington Auto Parts Honda","AB-77120","10/08/2026","10422","845.60"]]);
  fakeFile("qb","qb-vendor-balance-detail-oct.csv",[["","Type","Date","Num","Due Date","Amount","Open Balance"],
    ["FinishMaster","","","","","",""],["","Bill","10/10/2026","FM-449021","11/09/2026","586.25","586.25"],["","Bill","10/22/2026","FM-450117","11/21/2026","712.90","712.90"],["Total for FinishMaster","","","","","1,299.15",""],
    ["Keystone Automotive","","","","","",""],["","Bill","10/03/2026","K-55190","11/02/2026","418.00","0.00"],["","Bill Payment (Check)","10/20/2026","4410","","-418.00",""],["","Bill","10/09/2026","K-55302","11/08/2026","1,077.35","1,077.35"],["","Bill","10/16/2026","K-55388","11/15/2026","264.00","264.00"],["Total for Keystone Automotive","","","","","1,759.35",""],
    ["LKQ Corporation","","","","","",""],["","Bill","10/02/2026","8812034","11/01/2026","1,284.50","1,284.50"],["","Bill","10/07/2026","8812290","11/06/2026","692.10","692.10"],["Total for LKQ Corporation","","","","","1,976.60",""],
    ["Toyota of Lakewood","","","","","",""],["","Bill","10/06/2026","TL-20931","11/05/2026","2,311.80","2,311.80"],["","Bill","10/14/2026","TL-20977","11/13/2026","903.40","903.40"],["","Bill","10/19/2026","TL-21008","11/18/2026","1,456.75","1,456.75"],["Total for Toyota of Lakewood","","","","","4,672.95",""],
    ["Abington Auto Parts Honda","","","","","",""],["","Bill","10/08/2026","AB-77120","11/07/2026","845.60","845.60"],["","Bill","10/21/2026","CM-4471","","-212.40","-212.40"],["","Bill","09/14/2026","CM-4388","","-96.00","-96.00"],["","Bill","09/22/2026","AB-76801","10/22/2026","330.00","0.00"],["Total for Abington Auto Parts Honda","","","","","867.20",""]]);
  $("#dFrom").value="2026-10-01";$("#dTo").value="2026-10-31";
  updateRun();reconcile();
});
})();
