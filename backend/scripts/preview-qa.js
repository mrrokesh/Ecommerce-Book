// Disposable local preview: no production database or integration credentials are loaded.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
const dir=path.resolve('.qa-pg');
const pg=new EmbeddedPostgres({databaseDir:dir,user:'postgres',password:'qa-only',port:55440,persistent:true,initdbFlags:['--encoding=UTF8','--locale=C'],onLog:()=>{},onError:()=>{}});
if(!fs.existsSync(path.join(dir,'PG_VERSION')))await pg.initialise();
await pg.start();
process.env.NODE_ENV='test';process.env.DATABASE_URL='postgresql://postgres:qa-only@127.0.0.1:55440/postgres?sslmode=disable';process.env.JWT_SECRET='local-qa-only-secret-never-use-in-production';
for(const key of ['SMTP_HOST','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','MSG91_AUTH_KEY'])process.env[key]='';
const {query,getPool}=await import('../src/db/pool.js');
const {initSchema}=await import('../src/db/init.js');await initSchema();
await query("INSERT INTO users(name,email,password_hash,role) VALUES('QA Admin','qa@example.invalid',$1,'admin') ON CONFLICT(email) DO UPDATE SET password_hash=$1",[await bcrypt.hash('LocalPreview123!',10)]);
await query("INSERT INTO books(title,slug,author_name,mrp,sale_price,stock) VALUES('The Reading Life','qa-reading-life','A. Writer',299,249,3) ON CONFLICT(slug) DO NOTHING");
const {default:app}=await import('../src/app.js');const server=app.listen(5100,'127.0.0.1',()=>console.log('QA preview: http://127.0.0.1:5100/admin/login (qa@example.invalid / LocalPreview123!)'));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;server.closeAllConnections();await new Promise(r=>server.close(r));await(await getPool()).end();await pg.stop();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
