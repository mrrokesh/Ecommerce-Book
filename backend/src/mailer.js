import nodemailer from 'nodemailer';
import { query,getPool } from './db/pool.js';
export function notifyConfigured(){return Boolean(process.env.ROKESH_NOTIFY_API_URL&&process.env.ROKESH_NOTIFY_API_KEY);}
export function smtpConfigured(){return Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS);}
export function mailConfigured(){return notifyConfigured()||smtpConfigured();}
function fromHeader(){return process.env.MAIL_FROM||'Salem Book House <noreply@salembookhouse.com>';}
/** Send through Rokesh Notify (HTTP API, Bearer key). Throws with the provider's message on failure. */
async function sendViaNotify(m){
  const url=new URL(process.env.ROKESH_NOTIFY_API_URL);
  if(process.env.NODE_ENV==='production'&&url.protocol!=='https:')throw new Error('ROKESH_NOTIFY_API_URL must use https in production');
  const res=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+process.env.ROKESH_NOTIFY_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:fromHeader()||undefined,to:m.to_email,subject:m.subject,text:m.body,html:m.html_body||undefined}),signal:AbortSignal.timeout(15000)});
  if(!res.ok){let d='';try{const j=await res.json();d=j?.error?.message||j?.error||j?.message||'';}catch{}throw new Error('Rokesh Notify '+res.status+(d?': '+String(d).slice(0,200):''));}
}
export async function deliverEmail(id){
  if(!mailConfigured())return {sent:false,error:'No email provider is configured'};
  const c=await(await getPool()).connect();
  try{
    await c.query('BEGIN');
    const {rows}=await c.query('SELECT * FROM email_outbox WHERE id=$1 FOR UPDATE SKIP LOCKED',[id]);
    const m=rows[0];if(!m||m.sent){await c.query('COMMIT');return {sent:!!m?.sent};}
    try{
      if(notifyConfigured())await sendViaNotify(m);
      else{
        const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},connectionTimeout:10000,socketTimeout:15000});
        await transport.sendMail({from:fromHeader(),to:m.to_email,subject:m.subject,text:m.body,html:m.html_body||undefined,messageId:'<'+m.id+'@salembookhouse.local>'});
      }
      await c.query('UPDATE email_outbox SET sent=TRUE,error=NULL,attempts=attempts+1 WHERE id=$1',[id]);
      await c.query('COMMIT');return {sent:true};
    }catch(e){await c.query("UPDATE email_outbox SET error=$2,attempts=attempts+1,next_attempt_at=NOW()+INTERVAL '5 minutes' WHERE id=$1",[id,e.message]);await c.query('COMMIT');return {sent:false,error:e.message};}
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
/**
 * Cost/abuse guard for mail that anonymous visitors can trigger (reset, verification, guest link).
 * Caps messages per recipient and overall per hour so the endpoints cannot be used to flood an inbox or burn the quota.
 */
export async function mailBudgetOk(to, subjectPrefix, { perRecipient = 3, overall = 300 } = {}) {
  const like = subjectPrefix.replace(/[%_\\]/g, (c) => '\\' + c) + '%';
  const { rows } = await query(
    `SELECT COUNT(*) FILTER (WHERE lower(to_email) = lower($1))::int AS mine, COUNT(*)::int AS total
       FROM email_outbox WHERE subject LIKE $2 AND created_at > NOW() - INTERVAL '1 hour'`,
    [String(to), like]
  );
  return rows[0].mine < perRecipient && rows[0].total < overall;
}
export async function sendMail({to,subject,text,html}){
  const {rows}=await query('INSERT INTO email_outbox(to_email,subject,body,html_body) VALUES($1,$2,$3,$4) RETURNING id',[to,subject,text||'',html||null]);
  return {...await deliverEmail(rows[0].id),id:rows[0].id};
}
export async function retryEmails(){
  if(!mailConfigured())return;
  const {rows}=await query('SELECT id FROM email_outbox WHERE sent=FALSE AND attempts<5 AND next_attempt_at<=NOW() ORDER BY created_at LIMIT 20');
  for(const m of rows)await deliverEmail(m.id);
}
