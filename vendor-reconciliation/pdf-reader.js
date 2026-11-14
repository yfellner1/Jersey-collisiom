/* Reads a text-based PDF report (QuickBooks, CCC ONE, vendor statements) into rows and columns,
   so it can go through the same column matching as a CSV or Excel export. Runs in the browser. */
(function(){
var KEYS=/(vendor|supplier|invoice|inv\b|num|no\.|ref|date|amount|amt|total|balance|type|r\.?o\b|repair\s*order|memo|description)/i;
function linesOf(items){
  items=items.filter(function(it){return it.str&&it.str.trim()}).map(function(it){return {s:it.str,x0:it.transform[4],y:it.transform[5],x1:it.transform[4]+(it.width||0)}});
  items.sort(function(a,b){return b.y-a.y||a.x0-b.x0});
  var lines=[];
  items.forEach(function(it){var L=lines.length&&lines[lines.length-1];if(L&&Math.abs(L.y-it.y)<=2.5)L.items.push(it);else lines.push({y:it.y,items:[it]})});
  return lines.map(function(L){
    L.items.sort(function(a,b){return a.x0-b.x0});
    var cells=[];
    L.items.forEach(function(it){var c=cells[cells.length-1];
      if(c&&it.x0-c.x1<3.5){c.s+=(it.x0-c.x1>1?" ":"")+it.s;c.x1=Math.max(c.x1,it.x1)}else cells.push({s:it.s,x0:it.x0,x1:it.x1})});
    cells.forEach(function(c){c.s=c.s.replace(/\s+/g," ").trim()});
    return cells.filter(function(c){return c.s});
  });
}
function isFooter(cells){var t=cells.map(function(c){return c.s}).join(" ");return /^page\s*\d+(\s*of\s*\d+)?$/i.test(t)||/\bpage\s*\d+\s*of\s*\d+\b/i.test(t)&&cells.length<=3||/^(mon|tues|wednes|thurs|fri|satur|sun)day,/i.test(t)&&cells.length<=3}
function isHeader(cells){return cells.length>=3&&cells.filter(function(c){return KEYS.test(c.s)&&c.s.length<=30}).length>=2}
window.pdfToGrid=async function(data){
  var pdf=await pdfjsLib.getDocument({data:data,isEvalSupported:false,disableFontFace:true}).promise;
  var pages=[],chars=0;
  for(var i=1;i<=pdf.numPages;i++){var tc=await (await pdf.getPage(i)).getTextContent();var ls=linesOf(tc.items);ls.forEach(function(l){l.forEach(function(c){chars+=c.s.length})});pages.push(ls)}
  if(chars<30*pdf.numPages)return {scanned:true,pages:pdf.numPages};
  var head=null,headKey="";
  pages.some(function(ls){return ls.some(function(l){if(isHeader(l)){head=l;return true}})});
  if(!head){ // no header row: use the line with the most cells as the column layout
    pages.forEach(function(ls){ls.forEach(function(l){if(!head||l.length>head.length)head=l})});
    head=head.map(function(c,i){return {s:"Column "+(i+1),x0:c.x0,x1:c.x1}});
  }
  headKey=head.map(function(c){return c.s}).join("|");
  var cols=head.map(function(c){return {name:c.s,x0:c.x0,x1:c.x1,cx:(c.x0+c.x1)/2}});
  var grid=[cols.map(function(c){return c.name})];
  pages.forEach(function(ls){
    var started=!isHeaderPage(ls);
    ls.forEach(function(l){
      var key=l.map(function(c){return c.s}).join("|");
      if(key===headKey||isHeader(l)&&similar(l,head)){started=true;return}
      if(!started||isFooter(l))return;
      var row=cols.map(function(){return ""});
      l.forEach(function(c){
        var cx=(c.x0+c.x1)/2,best=0,bd=1e9;
        cols.forEach(function(h,k){var d=Math.min(Math.abs(cx-h.cx),Math.abs(c.x0-h.x0),Math.abs(c.x1-h.x1));if(d<bd){bd=d;best=k}});
        row[best]=row[best]?row[best]+" "+c.s:c.s;
      });
      grid.push(row);
    });
  });
  function isHeaderPage(ls){return ls.some(function(l){return l.map(function(c){return c.s}).join("|")===headKey||isHeader(l)&&similar(l,head)})}
  return {grid:grid,pages:pdf.numPages};
};
function similar(a,b){var A=a.map(function(c){return c.s.toLowerCase()}),B=b.map(function(c){return c.s.toLowerCase()});var n=A.filter(function(x){return B.indexOf(x)>-1}).length;return n>=Math.min(A.length,B.length)-1&&n>=2}
})();
