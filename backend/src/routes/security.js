import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {Router} from 'express';
import rateLimit from 'express-rate-limit';
import {query} from '../db/pool.js';
import {requireBackOffice,signToken,setAuthCookie} from '../middleware/auth.js';
import {base32,encryptSecret,decryptSecret,verifyTotp} from '../domain/totp.js';
const router=Router();router.use(requireBackOffice,rateLimit({windowMs:900000,limit:20}));
router.get('/network',(req,res)=>res.json({success:true,data:{ip:req.ip,forwardedFor:req.get('x-forwarded-for')||null,trustProxyHops:Number(req.app.get('trust proxy')),hint:'ip should be YOUR public address. If it is a Vercel/Render address, set TRUST_PROXY_HOPS to 2.'}}));
router.get('/',async(req,res)=>{const u=(await query('SELECT mfa_secret FROM users WHERE id=$1',[req.user.id])).rows[0];res.json({success:true,data:{enabled:!!u.mfa_secret}});});
router.post('/:action',async(req,res)=>{try{
  const u=(await query('SELECT * FROM users WHERE id=$1',[req.user.id])).rows[0];
  if(!await bcrypt.compare(String(req.body.password||''),u.password_hash))throw new Error('Your current password is required');
  if(req.params.action==='setup'){
    if(u.mfa_secret)throw new Error('Two-factor authentication is already enabled');
    const secret=base32(crypto.randomBytes(20));await query('UPDATE users SET mfa_pending=$2 WHERE id=$1',[u.id,encryptSecret(secret)]);
    return res.json({success:true,data:{secret,uri:`otpauth://totp/SalemBookHouse:${encodeURIComponent(u.email)}?secret=${secret}&issuer=SalemBookHouse`}});
  }
  const encrypted=req.params.action==='enable'?u.mfa_pending:u.mfa_secret;
  if(!encrypted||!verifyTotp(decryptSecret(encrypted),req.body.code))throw new Error('Invalid authenticator code');
  if(!['enable','disable'].includes(req.params.action))throw new Error('Unknown security action');
  const r=await query('UPDATE users SET mfa_secret=$2,mfa_pending=NULL,token_version=token_version+1 WHERE id=$1 RETURNING token_version',[u.id,req.params.action==='enable'?encrypted:null]);
  setAuthCookie(res,signToken(u.id,r.rows[0].token_version));
  await query('INSERT INTO audit_log(actor_id,actor_name,action,entity_id) VALUES($1,$2,$3,$4)',[u.id,u.name,'mfa.'+req.params.action,u.id]);
  res.json({success:true,data:{enabled:req.params.action==='enable'}});
}catch(e){res.status(400).json({success:false,error:e.message});}});
export default router;
