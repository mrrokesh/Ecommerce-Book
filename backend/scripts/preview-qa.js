// Disposable local preview: no production database or integration credentials are loaded.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import bcrypt from 'bcryptjs';
const scratch = path.resolve('.qa-pg');
fs.mkdirSync(scratch, { recursive: true });
const dir = fs.mkdtempSync(path.join(scratch, 'run-'));
const probe = net.createServer();
await new Promise((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
const databasePort = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const pg=new EmbeddedPostgres({databaseDir:dir,user:'postgres',password:'qa-only',port:databasePort,persistent:false,initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-c','listen_addresses=127.0.0.1'],onLog:message=>{if (/FATAL|ERROR|could not/i.test(message)) console.error('QA PostgreSQL:', message.trim());}});
await pg.initialise();
await pg.start();
process.env.NODE_ENV='test';process.env.DATABASE_URL=`postgresql://postgres:qa-only@127.0.0.1:${databasePort}/postgres?sslmode=disable`;process.env.JWT_SECRET='local-qa-only-secret-never-use-in-production';
const previewPort = Number(process.env.QA_PREVIEW_PORT || 5100);
if (!Number.isInteger(previewPort) || previewPort < 1024 || previewPort > 65535) throw new Error('Invalid QA_PREVIEW_PORT');
process.env.CLIENT_URL=`http://127.0.0.1:${previewPort},http://localhost:5173,http://127.0.0.1:5173`;
for(const key of ['SMTP_HOST','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','MSG91_AUTH_KEY','ROKESH_NOTIFY_API_URL','ROKESH_NOTIFY_API_KEY'])process.env[key]='';
const {query,getPool}=await import('../src/db/pool.js');
const { rows: [connection] } = await query('SELECT inet_server_addr()::text AS host, inet_server_port() AS port, current_database() AS db');
if (connection.host !== '127.0.0.1/32' && connection.host !== '127.0.0.1') throw new Error('QA database must be on IPv4 loopback');
if (connection.port !== databasePort || connection.db !== 'postgres') throw new Error('Unexpected QA database connection');
const {initSchema}=await import('../src/db/init.js');await initSchema();
await query("INSERT INTO users(name,email,password_hash,role) VALUES('QA Admin','qa@example.invalid',$1,'admin') ON CONFLICT(email) DO UPDATE SET password_hash=$1",[await bcrypt.hash('LocalPreview123!',10)]);
await query("INSERT INTO books(title,slug,author_name,mrp,sale_price,stock) VALUES('The Reading Life','qa-reading-life','A. Writer',299,249,3) ON CONFLICT(slug) DO NOTHING");
const sampleOrder = await query(`INSERT INTO orders(order_number,status,subtotal,total,payment_method,payment_status,shipping_name,shipping_phone,shipping_address,guest_email)
  VALUES('QA-ORDER-001','placed',249,249,'cod','pending','Sample Guest With A Long Name','9000000000','Sample address, Salem 636001','sample.customer.with.a.long.email@example.invalid') RETURNING id`);
await query(`INSERT INTO order_items(order_id,book_id,title,unit_price,quantity,line_total)
  SELECT $1,id,title,sale_price,1,sale_price FROM books WHERE slug='qa-reading-life'`, [sampleOrder.rows[0].id]);
const {default:app}=await import('../src/app.js');
const server=app.listen(previewPort,'127.0.0.1');
await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
console.log(`QA preview: http://127.0.0.1:${previewPort}/admin/login (qa@example.invalid / LocalPreview123!)`);
let stopping=false;
async function stop(){if(stopping)return;stopping=true;server.closeAllConnections();await new Promise(r=>server.close(r));await(await getPool()).end();await pg.stop();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
