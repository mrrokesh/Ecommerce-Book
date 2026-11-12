export function csv(rows) {
  if(!rows.length)return '';
  const keys=Object.keys(rows[0]);
  const cell=v=>'"'+String(v ?? '').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
  return [keys,...rows.map(r=>keys.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n');
}
export function parseCsv(text) {
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw new Error('CSV contains an unclosed quote');
  row.push(field);if(row.some(Boolean))rows.push(row);
  const header=rows.shift()?.map(s=>s.trim().replace(/^\uFEFF/,'')) || [];
  if(new Set(header).size!==header.length)throw new Error('Duplicate CSV columns');
  return rows.map((r,i)=>{if(r.length!==header.length)throw new Error('Incorrect column count on CSV row '+(i+2));return Object.fromEntries(header.map((h,j)=>[h,r[j]]));});
}
