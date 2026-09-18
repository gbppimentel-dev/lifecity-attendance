// Change ID: LC-P08A-v1
export type ExportMember={id:string;member_number:string;first_name:string;last_name:string;email:string|null;mobile:string|null;status:string;is_starred:boolean;created_at:string;admin_note:string|null;churches:{id:string;name:string}[];ministries:{id:string;name:string}[]}
export function csvCell(value:unknown){
 let text=value==null?'':String(value)
 // Neutralize spreadsheet formula prefixes, including leading whitespace.
 if(/^[\s\uFEFF]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text
 return '"'+text.replace(/"/g,'""')+'"'
}
export function memberCsv(rows:ExportMember[],detailed:boolean,sort:string){
 const ordered=[...rows].sort((a,b)=>{
  if(sort==='server')return 0
  if(a.is_starred!==b.is_starred)return a.is_starred?-1:1
  const name=[a.first_name,a.last_name].join(' ').localeCompare([b.first_name,b.last_name].join(' '))
  if(sort==='name-desc')return -name
  if(sort==='added-oldest')return Date.parse(a.created_at)-Date.parse(b.created_at)
  if(sort==='added-newest')return Date.parse(b.created_at)-Date.parse(a.created_at)
  return name
 })
 const header=['Member Number','First Name','Last Name','Email','Mobile','Status','Starred','Churches','Ministries']
 if(detailed)header.push('Member ID','Added At (UTC)','Church IDs','Ministry IDs','Admin Note')
 const lines=[header,...ordered.map(m=>{
  const row=[m.member_number,m.first_name,m.last_name,m.email??'',m.mobile??'',m.status==='active'?'Active':'Inactive',m.is_starred?'Yes':'No',m.churches.map(x=>x.name).join('; '),m.ministries.map(x=>x.name).join('; ')]
  if(detailed)row.push(m.id,new Date(m.created_at).toISOString(),m.churches.map(x=>x.id).join('; '),m.ministries.map(x=>x.id).join('; '),m.admin_note??'')
  return row
 })]
 return '\uFEFF'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n'
}
