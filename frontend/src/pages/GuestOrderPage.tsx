import {useEffect,useState} from 'react';
import { askText } from '../components/Dialogs';
import api from '../api/client';
export default function GuestOrderPage(){
  const [token,setToken]=useState(()=>window.location.hash.slice(1));
  useEffect(()=>{const onHash=()=>{setToken(window.location.hash.slice(1));setData(null);setMessage('');};window.addEventListener('hashchange',onHash);return()=>window.removeEventListener('hashchange',onHash);},[]);
  const [data,setData]=useState<any>(null);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const headers={'x-order-token':token};
  async function load(){setBusy(true);try{const r=await api.get('/customer-tools/guest-order',{headers});setData(r.data);}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  return <main className="container" style={{padding:'40px 0',maxWidth:800}}><h1>Guest order access</h1>
    {token?<button className="btn btn-gold" disabled={busy} onClick={load}>View my order</button>:<form className="auth-form" onSubmit={async e=>{e.preventDefault();setBusy(true);const f=Object.fromEntries(new FormData(e.currentTarget));try{const r=await api.post('/customer-tools/guest-link',f);setMessage(r.data.message);}catch(err){setMessage(err.message);}finally{setBusy(false);}}}><label>Order number<input name="orderNumber" required /></label><label>Email used at checkout<input name="email" type="email" required /></label><button className="btn btn-gold" disabled={busy}>Email a secure link</button></form>}
    {message&&<p role="status">{message}</p>}{data&&<><h2>{data.order.orderNumber}</h2><p>{data.order.status} · Payment: {data.order.paymentStatus} · ₹{data.order.total}</p><p>{data.order.shippingAddress}</p><ul>{data.items.map((i,index)=><li key={index}>{i.title} × {i.quantity} — ₹{i.line_total}</li>)}</ul>
      <button className="btn btn-outline" onClick={async()=>{try{const r=await api.get('/customer-tools/guest-order/invoice',{headers,responseType:'blob'});const url=URL.createObjectURL(r.data);const a=document.createElement('a');a.href=url;a.download=data.order.orderNumber+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setMessage(e.message);}}}>Download printable invoice</button>
      {['cancel','return'].filter(a=>a==='cancel'?data.order.canCancel:data.order.canReturn).map(action=><button key={action} className="btn btn-outline" disabled={busy} onClick={async()=>{const reason=await askText({title:action==='cancel'?'Cancel order':'Request return',label:'Reason',multiline:true,confirmText:'Submit'});if(!reason)return;try{await api.post('/customer-tools/guest-order/'+action,{reason},{headers});await load();}catch(e){setMessage(e.message);}}}>{action==='cancel'?'Cancel order':'Request return'}</button>)}
      <h2>Order updates</h2><ul>{data.events.map((e,index)=><li key={index}>{e.status}: {e.note}</li>)}</ul></>}
  </main>;
}
