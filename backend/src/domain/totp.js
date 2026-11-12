import crypto from 'crypto';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes){let bits=0,v=0,out='';for(const b of bytes){v=(v<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(v>>>(bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(v<<(5-bits))&31];return out;}
function decode(s){let bits=0,v=0,out=[];for(const c of s.toUpperCase()){const n=alphabet.indexOf(c);if(n<0)continue;v=(v<<5)|n;bits+=5;if(bits>=8){out.push((v>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
export function totp(secret,time=Date.now(),digits=6){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(time/30000)));const h=crypto.createHmac('sha1',decode(secret)).update(counter).digest();const offset=h[19]&15;const n=(h.readUInt32BE(offset)&0x7fffffff)%10**digits;return String(n).padStart(digits,'0');}
export function verifyTotp(secret,code){if(!/^\d{6}$/.test(String(code)))return false;return [-1,0,1].some(i=>crypto.timingSafeEqual(Buffer.from(totp(secret,Date.now()+i*30000)),Buffer.from(String(code))));}
function key(){if(!process.env.JWT_SECRET)throw new Error('JWT_SECRET is required');return crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();}
export function encryptSecret(secret){const iv=crypto.randomBytes(12);const c=crypto.createCipheriv('aes-256-gcm',key(),iv);const body=Buffer.concat([c.update(secret,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body]).toString('base64');}
export function decryptSecret(s){const b=Buffer.from(s,'base64');const c=crypto.createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));c.setAuthTag(b.subarray(12,28));return Buffer.concat([c.update(b.subarray(28)),c.final()]).toString('utf8');}
