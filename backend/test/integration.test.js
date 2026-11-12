import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';

test('commerce API integration with isolated PostgreSQL', {timeout:120000}, async t=>{
  const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const directory=path.resolve('.test-pg-'+process.pid);fs.rmSync(directory,{recursive:true,force:true});fs.mkdirSync(directory,{recursive:true});
  const pg=new EmbeddedPostgres({databaseDir:directory,user:'postgres',password:'test-only',port,persistent:true,initdbFlags:['--encoding=UTF8','--locale=C'],onLog:()=>{},onError:()=>{}});
  if(!fs.existsSync(path.join(directory,'PG_VERSION')))await pg.initialise();
  await pg.start();
  let testPool,testServer;
  t.after(async()=>{if(testServer){testServer.closeAllConnections();await new Promise(r=>testServer.close(r));}if(testPool)await testPool.end();await pg.stop();try{fs.rmSync(directory,{recursive:true,force:true});}catch{}});
  process.env.DATABASE_URL=`postgresql://postgres:test-only@127.0.0.1:${port}/postgres?sslmode=disable`;
  process.env.JWT_SECRET='local-test-secret-not-for-production-123';process.env.NODE_ENV='test';process.env.RAZORPAY_KEY_ID='';process.env.RAZORPAY_KEY_SECRET='';process.env.SMTP_HOST='';process.env.MSG91_AUTH_KEY='';
  process.env.ROKESH_NOTIFY_API_URL='';
  process.env.ROKESH_NOTIFY_API_KEY='';
  process.env.CLIENT_URL='http://store.test.invalid';
  const {getPool,query}=await import('../src/db/pool.js');
  // The isolated cluster is dedicated to this suite. Each run gets its own schema.
  const pool=await getPool();testPool=pool;const schema='test_'+Date.now();await query(`CREATE SCHEMA ${schema}`);pool.on('connect',c=>c.query(`SET search_path TO ${schema},public`));await query(`SET search_path TO ${schema},public`);
  const {initSchema}=await import('../src/db/init.js');await initSchema();
  const {default:app}=await import('../src/app.js');const server=app.listen(0,'127.0.0.1');testServer=server;await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const {signToken}=await import('../src/middleware/auth.js');
  const admin=(await query("INSERT INTO users(name,email,password_hash,role) VALUES('Admin','admin@test.invalid','x','admin') RETURNING *")).rows[0];
  const user=(await query("INSERT INTO users(name,email,password_hash,email_verified_at) VALUES('Buyer','buyer@test.invalid','x',NOW()) RETURNING *")).rows[0];
  const headers=u=>({'Content-Type':'application/json',Authorization:'Bearer '+signToken(u.id),'x-session-id':'test-session'});
  async function request(url,{method='GET',body,user:who=admin}={}){const r=await fetch(base+url,{method,headers:headers(who),body:body?JSON.stringify(body):undefined});const data=await r.json();return {status:r.status,...data};}
  const book=(await query("INSERT INTO books(title,slug,author_name,mrp,sale_price,stock) VALUES('Test book','test-book','Author',200,100,20) RETURNING *")).rows[0];
  const cart=(await query('INSERT INTO carts(user_id) VALUES($1) RETURNING *',[user.id])).rows[0];
  const payload={shipping:{fullName:'Buyer',phone:'9876543210',line1:'123 Street',city:'Salem',state:'Tamil Nadu',pincode:'636001'},paymentMethod:'cod'};
  let order;
  try{
    await t.test('browser writes accept only configured origins', async () => {
      for (const [origin, status] of [['http://store.test.invalid', 200], ['http://other.test.invalid', 403]]) {
        const response = await fetch(base + '/auth/logout', { method: 'POST', headers: { Origin: origin } });
        assert.equal(response.status, status);
      }
    });
    await t.test('settings and quote use identical shipping rules',async()=>{
      assert.equal((await request('/operations/settings',{method:'PUT',body:{shippingFee:49,freeShippingThreshold:499,returnDays:7,lowStockThreshold:5,restrictedCoverage:false}})).status,200);
      await query('INSERT INTO cart_items(cart_id,book_id,quantity) VALUES($1,$2,2)',[cart.id,book.id]);
      const q=await request('/payments/quote',{method:'POST',body:payload,user});assert.equal(q.data.total,249);
      const r=await request('/orders',{method:'POST',body:payload,user});assert.equal(r.status,201,JSON.stringify(r));order=r.data.order;assert.equal(order.total,249);
    });
    await t.test('invalid order transitions cannot change inventory',async()=>{
      const r=await request('/admin/orders/'+order.id,{method:'PATCH',body:{status:'delivered'}});assert.equal(r.status,400);
      assert.equal((await query('SELECT stock FROM books WHERE id=$1',[book.id])).rows[0].stock,18);
    });
    await t.test('concurrent cancellation restores stock once',async()=>{
      const results=await Promise.all([request('/orders/'+order.id+'/cancel',{method:'PATCH',body:{reason:'test'},user}),request('/orders/'+order.id+'/cancel',{method:'PATCH',body:{reason:'test'},user})]);assert.equal(results.filter(r=>r.status===200).length,1);
      assert.equal((await query('SELECT stock FROM books WHERE id=$1',[book.id])).rows[0].stock,20);
    });
    await t.test('full gift credit works without online signature and is restored once',async()=>{
      await query("INSERT INTO gift_cards(code,amount,remaining) VALUES('TEST-GIFT',249,249)");await query('INSERT INTO cart_items(cart_id,book_id,quantity) VALUES($1,$2,2)',[cart.id,book.id]);
      const r=await request('/orders',{method:'POST',body:{...payload,giftCardCode:'TEST-GIFT',paymentMethod:'upi'},user});assert.equal(r.status,201,JSON.stringify(r));assert.equal(r.data.order.total,0);
      assert.equal((await request('/orders/'+r.data.order.id+'/cancel',{method:'PATCH',body:{reason:'test'},user})).status,200);
      const g=(await query("SELECT remaining FROM gift_cards WHERE code='TEST-GIFT'")).rows[0];assert.equal(Number(g.remaining),249);
    });
    await t.test('stock adjustment validation and audit',async()=>{
      assert.equal((await request('/operations/inventory/adjust',{method:'POST',body:{bookId:book.id,delta:-100,reason:'bad'}})).status,400);
      assert.equal((await request('/operations/inventory/adjust',{method:'POST',body:{bookId:book.id,delta:3,reason:'Restock'}})).status,200);
      const audit=await request('/operations/audit');assert.ok(audit.data.rows.some(r=>r.action==='stock.adjusted'));
    });
    await t.test('customer cannot read admin operations',async()=>{assert.equal((await request('/operations/payments',{user})).status,403);});
    await t.test('report, returns, customers, gifts, emails and catalogue endpoints load',async()=>{for(const endpoint of ['reports','returns','customers','gifts','emails','products','payments','inventory/history']){const r=await request('/operations/'+endpoint);assert.equal(r.status,200,endpoint+JSON.stringify(r));}});
    async function fixture({method='cod',status='delivered',payment='paid',awb=null}={}){
      const o=(await query(`INSERT INTO orders(order_number,user_id,status,subtotal,total,payment_method,payment_status,shipping_name,shipping_phone,shipping_address,delivered_at,awb) VALUES($1,$2,$3,200,200,$4,$5,'Buyer','9876543210','Salem 636001',NOW(),$6) RETURNING *`,['TEST-'+crypto.randomUUID().slice(0,18),user.id,status,method,payment,awb])).rows[0];
      const i=(await query("INSERT INTO order_items(order_id,book_id,title,unit_price,quantity,line_total) VALUES($1,$2,'Test book',100,2,200) RETURNING *",[o.id,book.id])).rows[0];return {o,i};
    }
    await t.test('partial return requires approval, restores only selected quantity, queues a refund',async()=>{
      const {o,i}=await fixture();const before=(await query('SELECT stock FROM books WHERE id=$1',[book.id])).rows[0].stock;
      const r=await request('/returns/'+o.id,{method:'POST',body:{reason:'Damaged copy',items:[{id:i.id,quantity:1}]},user});assert.equal(r.status,200,JSON.stringify(r));
      assert.equal((await request('/returns/admin/'+r.data.id,{method:'POST',body:{action:'receive',note:'Inspection'}})).status,400);
      assert.equal((await request('/returns/admin/'+r.data.id,{method:'POST',body:{action:'approve',note:'Pickup REF-1'}})).status,200);
      const received=await request('/returns/admin/'+r.data.id,{method:'POST',body:{action:'receive',note:'Received damaged copy'}});assert.equal(received.status,200,JSON.stringify(received));
      assert.equal((await query('SELECT stock FROM books WHERE id=$1',[book.id])).rows[0].stock,before+1);
      assert.equal((await request('/returns/admin/'+r.data.id,{method:'POST',body:{action:'receive',note:'Duplicate'}})).status,400);
      const refund=(await query('SELECT * FROM refund_requests WHERE order_id=$1',[o.id])).rows[0];assert.equal(Number(refund.amount),100);assert.equal(refund.status,'pending');
      const done=await request('/operations/payments/refunds/'+refund.id+'/retry',{method:'POST',body:{manual:true}});assert.equal(done.status,200,JSON.stringify(done));
      assert.equal((await query('SELECT payment_status FROM orders WHERE id=$1',[o.id])).rows[0].payment_status,'partially_refunded');
    });
    await t.test('refund gateway failure never marks payment refunded; retry reconciles completion',async()=>{
      const {o}=await fixture({method:'razorpay'});await query("UPDATE orders SET razorpay_payment_id='pay_test_fixture' WHERE id=$1",[o.id]);
      const r=await request('/operations/payments/refund',{method:'POST',body:{order:o.order_number,amount:200,reason:'Test refund'}});assert.equal(r.status,200,JSON.stringify(r));
      const {processRefund}=await import('../src/domain/lifecycle.js');
      await assert.rejects(processRefund(r.data.id,{refundPayment:async()=>{throw new Error('Gateway unavailable');}}));
      assert.equal((await query('SELECT payment_status FROM orders WHERE id=$1',[o.id])).rows[0].payment_status,'refund_pending');
      await processRefund(r.data.id,{refundPayment:async()=>({status:'processed',refundId:'rfnd_fixture'})});
      assert.equal((await query('SELECT payment_status FROM orders WHERE id=$1',[o.id])).rows[0].payment_status,'refunded');
      const duplicate=await request('/operations/payments/refund',{method:'POST',body:{order:o.order_number,amount:1,reason:'Duplicate'}});assert.equal(duplicate.status,400);
    });
    await t.test('courier delivery collects COD and late events cannot regress status',async()=>{
      const {o}=await fixture({status:'shipped',payment:'pending',awb:'AWB-TEST'});
      const {applyTrackingWebhook}=await import('../src/shipping/service.js');
      await applyTrackingWebhook({awb:'AWB-TEST',status:'delivered'});
      await applyTrackingWebhook({awb:'AWB-TEST',status:'in_transit'});
      const current=(await query('SELECT * FROM orders WHERE id=$1',[o.id])).rows[0];assert.equal(current.status,'delivered');assert.equal(current.payment_status,'paid');
    });
    await t.test('staff with view permission cannot adjust stock or issue refunds',async()=>{
      const role=(await query("INSERT INTO staff_roles(name,permissions) VALUES('Reader',ARRAY['products','orders']) RETURNING id")).rows[0];
      const staff=(await query("INSERT INTO users(name,email,password_hash,role,staff_role_id) VALUES('Reader','reader@test.invalid','x','staff',$1) RETURNING *",[role.id])).rows[0];
      assert.equal((await request('/operations/inventory',{user:staff})).status,200);
      assert.equal((await request('/operations/inventory/adjust',{method:'POST',body:{bookId:book.id,delta:1,reason:'Unauthorized'},user:staff})).status,403);
      assert.equal((await request('/operations/payments',{user:staff})).status,403);
    });
    await t.test('invalid CSV rolls back the entire import',async()=>{
      const data='id,title,author_name,sku,mrp,sale_price,stock,is_active\n'+book.id+',Changed,Author,,200,100,20,true\n,Invalid,Author,,50,100,1,true';
      assert.equal((await request('/operations/products/import',{method:'POST',body:{csv:data}})).status,400);
      assert.equal((await query('SELECT title FROM books WHERE id=$1',[book.id])).rows[0].title,'Test book');
    });
    await t.test('CSV and bulk prices keep the catalogue discount in sync', async () => {
      const csv = `id,title,author_name,sku,mrp,sale_price,stock,is_active\n${book.id},Test book,Author,,200,150,20,true`;
      assert.equal((await request('/operations/products/import', { method:'POST', body:{csv} })).status, 200);
      assert.equal((await query('SELECT discount_percent FROM books WHERE id=$1', [book.id])).rows[0].discount_percent, 25);
      assert.equal((await request('/operations/products/bulk', { method:'POST', body:{ids:[book.id],action:'price',value:100} })).status, 200);
      assert.equal((await query('SELECT discount_percent FROM books WHERE id=$1', [book.id])).rows[0].discount_percent, 50);
    });
    await t.test('guest access requires an unguessable order token',async()=>{assert.equal((await request('/customer-tools/guest-order',{user})).status,401);});
    await t.test('restricted delivery coverage is enforced at checkout',async()=>{await request('/operations/settings',{method:'PUT',body:{shippingFee:40,freeShippingThreshold:499,returnDays:7,lowStockThreshold:5,restrictedCoverage:true}});const r=await request('/payments/quote',{method:'POST',body:payload,user});assert.equal(r.status,400);});
    await t.test('sign-up email verification, account emails and password-change notice',async()=>{
      const post=async(url,body,cookie)=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});return {status:r.status,cookie:(r.headers.get('set-cookie')||'').split(';')[0],...await r.json()};};
      const outbox=async(to,subject)=>(await query('SELECT * FROM email_outbox WHERE to_email=$1 AND subject ILIKE $2 ORDER BY created_at DESC',[to,subject])).rows;
      const email='newbie@test.invalid';
      assert.equal((await post('/auth/register',{name:'N1',email:'bad-name@test.invalid',password:'Newbie#2026ok'})).status,400,'digits in name rejected');
      assert.equal((await post('/auth/register',{name:'Newbie',email:'bad-phone@test.invalid',phone:'123',password:'Newbie#2026ok'})).status,400,'bad phone rejected');
      assert.equal((await post('/auth/register',{name:'Newbie',email:'weak@test.invalid',password:'alllettersonly'})).status,400,'weak password rejected');
      const reg=await post('/auth/register',{name:'Newbie',email,password:'Newbie#2026ok'});
      assert.equal(reg.status,201);assert.equal(reg.data.user.emailVerified,false);
      await new Promise(r=>setTimeout(r,300));
      const mail=(await outbox(email,'Verify your%'))[0];assert.ok(mail,'verification email queued');
      const token=mail.body.match(/token=([0-9a-f]+)/)[1];
      assert.equal((await post('/auth/verify-email',{token:'0'.repeat(48)})).status,400,'unknown token rejected');
      assert.equal((await post('/auth/verify-email',{token})).status,200);
      assert.equal((await post('/auth/verify-email',{token})).status,400,'token is single-use');
      assert.ok((await query('SELECT email_verified_at FROM users WHERE email=$1',[email])).rows[0].email_verified_at);
      await new Promise(r=>setTimeout(r,300));
      assert.ok((await outbox(email,'Welcome to%')).length,'welcome email after verification');
      const login=await post('/auth/login',{email,password:'Newbie#2026ok'});assert.equal(login.status,200);assert.equal(login.data.user.emailVerified,true);
      await new Promise(r=>setTimeout(r,300));
      assert.ok((await outbox(email,'New sign-in%')).length,'sign-in alert queued');
      await post('/auth/forgot',{email});await new Promise(r=>setTimeout(r,300));
      const reset=(await outbox(email,'Reset your%'))[0];const rt=reset.body.match(/token=([0-9a-f]+)/)[1];
      assert.equal((await post('/auth/reset',{token:rt,password:'Changed#2026ok'})).status,200);await new Promise(r=>setTimeout(r,300));
      assert.ok((await outbox(email,'Your Salem Book House password was changed')).length,'password-changed notice');
    });
    await t.test('two-factor setup, sign-in challenge and disable',async()=>{
      const {default:bcrypt}=await import('bcryptjs');const {totp}=await import('../src/domain/totp.js');
      const pw='Admin#2026ok';
      const ad=(await query("INSERT INTO users(name,email,password_hash,role,email_verified_at) VALUES('Sec Admin','sec-admin@test.invalid',$1,'admin',NOW()) RETURNING *",[await bcrypt.hash(pw,4)])).rows[0];
      const sec=(url,body)=>request(url,{method:'POST',body,user:ad});
      const net=await request('/security/network',{user:ad});assert.equal(net.status,200);assert.ok(net.data.ip&&net.data.trustProxyHops>=0);
      const viaProxy=await fetch(base+'/security/network',{headers:{'Content-Type':'application/json',Authorization:'Bearer '+signToken(ad.id,ad.token_version),'X-Forwarded-For':'203.0.113.7, 198.51.100.2, 10.0.0.5'}}).then(r=>r.json());
      assert.equal(viaProxy.data.suggestedTrustProxyHops,3,'suggests one hop per forwarded address');assert.equal(viaProxy.data.clientAddressGuess,'203.0.113.7');assert.equal(viaProxy.data.ok,false);assert.match(viaProxy.data.hint,/Set TRUST_PROXY_HOPS to 3/);
      assert.equal((await sec('/security/setup',{password:'wrong'})).status,400,'password required');
      const setup=await sec('/security/setup',{password:pw});assert.equal(setup.status,200);assert.ok(setup.data.secret);
      assert.equal((await sec('/security/enable',{password:pw,code:'000000'})).status,400,'bad code rejected');
      assert.equal((await sec('/security/enable',{password:pw,code:totp(setup.data.secret)})).status,200);
      const login=(body)=>fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:ad.email,password:pw,...body})}).then(async r=>({status:r.status,...await r.json()}));
      assert.equal((await login({})).status,401,'code required once enabled');
      assert.equal((await login({code:totp(setup.data.secret)})).status,200);
      const fresh=(await query('SELECT * FROM users WHERE id=$1',[ad.id])).rows[0];
      const dis=await fetch(base+'/security/disable',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+signToken(fresh.id,fresh.token_version)},body:JSON.stringify({password:pw,code:totp(setup.data.secret)})});assert.equal(dis.status,200);
      assert.equal((await login({})).status,200,'no code needed after disable');
    });
    await t.test('promotional campaigns reach only opted-in customers and honour unsubscribe',async()=>{
      const post=async(url,body)=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
      const yes=await post('/auth/register',{name:'Promo Yes',email:'promo-yes@test.invalid',password:'Promo#2026ok',marketingOptIn:true});assert.equal(yes.status,201);assert.equal(yes.data.user.marketingOptIn,true);
      const unverified=await post('/auth/register',{name:'Promo Unverified',email:'promo-unverified@test.invalid',password:'Promo#2026ok',marketingOptIn:true});assert.equal(unverified.status,201);
      await query("UPDATE users SET email_verified_at=NOW() WHERE email='promo-yes@test.invalid'");
      const no=await post('/auth/register',{name:'Promo No',email:'promo-no@test.invalid',password:'Promo#2026ok'});assert.equal(no.data.user.marketingOptIn,false,'consent box is off unless ticked');
      assert.equal((await request('/campaigns',{user})).status,403,'customers cannot open campaigns');
      await query("INSERT INTO coupons(code,description,percent_off,min_order) VALUES('DIWALI20','Diwali',20,300) ON CONFLICT (code) DO NOTHING");
      const draft={name:'Diwali',subject:'Diwali sale: 20% off festive reads',preheader:'This week only',headline:'Happy Diwali!',body:'Enjoy a festive discount.'+String.fromCharCode(10,10)+'Offer ends Sunday.',couponCode:'DIWALI20',ctaLabel:'Shop now',ctaUrl:'/shop/books'};
      assert.equal((await request('/campaigns',{method:'POST',body:{...draft,ctaUrl:'javascript:alert(1)'}})).status,400,'unsafe button link rejected');
      const c=await request('/campaigns',{method:'POST',body:draft});assert.equal(c.status,200,JSON.stringify(c));
      const pv=await request('/campaigns/'+c.data.id+'/preview',{method:'POST',body:{}});assert.match(pv.data.html,/DIWALI20/);assert.match(pv.data.html,/Unsubscribe/);
      const list=await request('/campaigns');assert.equal(list.data.subscribers,1,'an opt-in from an unverified address is not mailed');
      assert.equal((await request('/campaigns/'+c.data.id+'/send',{method:'POST',body:{}})).status,400,'needs explicit confirmation');
      const sent=await request('/campaigns/'+c.data.id+'/send',{method:'POST',body:{confirm:true}});assert.equal(sent.data.queued,1);
      const rows=(await query("SELECT to_email,html_body FROM email_outbox WHERE campaign_id=$1",[c.data.id])).rows;
      assert.deepEqual(rows.map(r=>r.to_email),['promo-yes@test.invalid']);
      const tok=rows[0].html_body.match(/unsubscribe\?token=([0-9a-f]{32})/)[1];
      assert.equal((await request('/campaigns/'+c.data.id+'/send',{method:'POST',body:{confirm:true}})).status,400,'a campaign cannot be sent twice');
      assert.equal((await post('/auth/unsubscribe',{token:tok})).status,200);
      assert.equal((await query("SELECT marketing_opt_in FROM users WHERE email='promo-yes@test.invalid'")).rows[0].marketing_opt_in,false);
      assert.equal((await request('/campaigns')).data.subscribers,0);
    });
    await t.test('admin-added subscribers need consent, join campaigns once and can unsubscribe',async()=>{
      const post=async(url,body)=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
      assert.equal((await request('/campaigns/subscribers',{method:'POST',body:{email:'listed@test.invalid'}})).status,400,'consent is required');
      assert.equal((await request('/campaigns/subscribers',{method:'POST',body:{email:'not-an-email',consent:true}})).status,400,'valid email required');
      assert.equal((await request('/campaigns/subscribers',{method:'POST',body:{email:'listed@test.invalid',name:'Listed Person',consent:true}})).status,200);
      assert.equal((await request('/campaigns/subscribers',{method:'POST',body:{email:'LISTED@test.invalid',consent:true}})).data.already,true,'duplicates are not added twice');
      assert.equal((await request('/campaigns/subscribers',{user})).status,403,'customers cannot read the list');
      const list=await request('/campaigns/subscribers');assert.ok(list.data.subscribers.some(s=>s.email==='listed@test.invalid'&&s.source==='admin'));
      const draft={name:'List test',subject:'List test subject line',headline:'Hello there',body:'A short message for the list.',ctaLabel:'Shop',ctaUrl:'/shop/books'};
      const c=await request('/campaigns',{method:'POST',body:draft});
      const sent=await request('/campaigns/'+c.data.id+'/send',{method:'POST',body:{confirm:true}});assert.equal(sent.data.queued,1);
      const row=(await query('SELECT to_email,html_body FROM email_outbox WHERE campaign_id=$1',[c.data.id])).rows[0];assert.equal(row.to_email,'listed@test.invalid');
      const tok=row.html_body.match(/unsubscribe\?token=([0-9a-f]{32})/)[1];
      assert.equal((await post('/auth/unsubscribe',{token:tok})).status,200);
      assert.equal((await query("SELECT active FROM marketing_subscribers WHERE email='listed@test.invalid'")).rows[0].active,false);
      assert.equal((await request('/campaigns/subscribers',{method:'POST',body:{email:'listed@test.invalid',consent:true}})).status,400,'an unsubscribed person is not re-added by an admin');
    });
    await t.test('a campaign can be sent to chosen subscribers only',async()=>{
      for(const e of ['pick-a@test.invalid','pick-b@test.invalid'])assert.equal((await request('/campaigns/subscribers',{method:'POST',body:{email:e,consent:true}})).status,200);
      const draft={name:'Pick test',subject:'Chosen recipients only',headline:'Just for you',body:'This goes to chosen people only.',ctaLabel:'Shop',ctaUrl:'/shop/books'};
      const c=await request('/campaigns',{method:'POST',body:draft});
      const bad=await request('/campaigns/'+c.data.id+'/send',{method:'POST',body:{confirm:true,emails:['stranger@test.invalid']}});assert.equal(bad.status,400,'people who are not subscribed are never emailed');
      const ok=await request('/campaigns/'+c.data.id+'/send',{method:'POST',body:{confirm:true,emails:['PICK-A@test.invalid','stranger@test.invalid']}});assert.equal(ok.data.queued,1);
      const rows=(await query('SELECT to_email FROM email_outbox WHERE campaign_id=$1',[c.data.id])).rows;assert.deepEqual(rows.map(r=>r.to_email),['pick-a@test.invalid']);
    });
    await t.test('new-order feed reports only orders after the given time and needs the orders permission',async()=>{
      const none=await request('/admin/order-alerts');assert.equal(none.status,200);assert.deepEqual(none.data.orders,[],'first call only returns a starting point');
      assert.ok(none.data.asOf);
      const all=await request('/admin/order-alerts?since=2000-01-01T00:00:00Z');assert.equal(all.status,200);assert.ok(all.data.orders.length>0&&all.data.orders[0].orderNumber);
      const later=await request('/admin/order-alerts?since='+encodeURIComponent(new Date(Date.now()+60000).toISOString()));assert.deepEqual(later.data.orders,[]);
      assert.equal((await request('/admin/order-alerts?since=2000-01-01T00:00:00Z',{user})).status,403,'customers are refused');
    });
    await t.test('products can be online-payment-only: quote flags it, COD is refused, online works, admin can toggle',async()=>{
      await request('/operations/settings',{method:'PUT',body:{shippingFee:49,freeShippingThreshold:499,returnDays:7,lowStockThreshold:5,restrictedCoverage:false}});
      const nocod=(await query("INSERT INTO books(title,slug,author_name,mrp,sale_price,stock,cod_allowed) VALUES('No COD book','no-cod-book','Author',300,300,5,FALSE) RETURNING *")).rows[0];
      await query('DELETE FROM cart_items WHERE cart_id=$1',[cart.id]);
      await query('INSERT INTO cart_items(cart_id,book_id,quantity) VALUES($1,$2,1)',[cart.id,nocod.id]);
      const q=await request('/payments/quote',{method:'POST',body:payload,user});
      assert.equal(q.status,200,JSON.stringify(q));assert.equal(q.data.codAvailable,false);assert.deepEqual(q.data.codBlockedItems,['No COD book']);
      const cod=await request('/orders',{method:'POST',body:{...payload,paymentMethod:'cod'},user});
      assert.equal(cod.status,400);assert.match(cod.error,/Cash on delivery is not available/);
      assert.equal((await query('SELECT stock FROM books WHERE id=$1',[nocod.id])).rows[0].stock,5,'a refused order must not touch stock');
      const online=await request('/orders',{method:'POST',body:{...payload,paymentMethod:'upi'},user});assert.equal(online.status,201,JSON.stringify(online));
      const flip=await request('/admin/books/'+book.id,{method:'PATCH',body:{codAllowed:false}});assert.equal(flip.status,200,JSON.stringify(flip));
      assert.equal((await query('SELECT cod_allowed FROM books WHERE id=$1',[book.id])).rows[0].cod_allowed,false);
      assert.equal((await request('/admin/books/'+book.id,{method:'PATCH',body:{title:'Test book'}})).status,200);
      assert.equal((await query('SELECT cod_allowed FROM books WHERE id=$1',[book.id])).rows[0].cod_allowed,false,'editing other fields keeps the COD setting');
      await request('/admin/books/'+book.id,{method:'PATCH',body:{codAllowed:true}});
      assert.equal((await query('SELECT cod_allowed FROM books WHERE id=$1',[book.id])).rows[0].cod_allowed,true);
    });
    await t.test('address-independent abuse limits: per-account login lock, daily sign-up and COD caps',async()=>{
      const post=async(url,body)=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
      const email='lock-test@test.invalid',pw='Locked#2026ok';
      assert.equal((await post('/auth/register',{name:'Lock Test',email,password:pw})).status,201);
      assert.equal((await post('/auth/login',{email,password:'wrong'})).status,401);
      const { recordLoginFailure } = await import('../src/utils/abuseGuard.js');
      for(let i=0;i<9;i++)recordLoginFailure(email); // 10 failures in total (the shared per-IP limiter would otherwise trip first)
      const locked=await post('/auth/login',{email,password:pw});
      assert.equal(locked.status,429,'locked after 10 failures even with the right password');
      const other=await post('/auth/login',{email:'nobody-else@test.invalid',password:'x'});
      assert.equal(other.status,401,'other accounts are not affected');
      const { resetLoginLocksForTests } = await import('../src/utils/abuseGuard.js');
      resetLoginLocksForTests();
      assert.equal((await post('/auth/login',{email,password:pw})).status,200,'works again after the lock clears');
      // site-wide daily sign-up cap
      process.env.SIGNUP_DAILY_CAP='1';
      try{assert.equal((await post('/auth/register',{name:'Cap Test',email:'cap-test@test.invalid',password:'Capped#2026ok'})).status,429,'sign-up cap');}
      finally{delete process.env.SIGNUP_DAILY_CAP;}
      // site-wide daily COD cap
      const { codOrderCapReached } = await import('../src/utils/abuseGuard.js');
      process.env.COD_DAILY_CAP='0';
      try{assert.equal(await codOrderCapReached(),true,'COD cap reached at 0');}
      finally{delete process.env.COD_DAILY_CAP;}
      assert.equal(await codOrderCapReached(),false,'COD cap not reached by default');
    });
    await t.test('one account per phone number; unverified customers cannot order',async()=>{
      const post=async(url,body)=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
      await query("INSERT INTO users(name,email,password_hash,phone) VALUES('Phone One','phone-one@test.invalid','x','9876501234')"); // inserted directly: the shared per-IP auth limiter is nearly used up by earlier tests
      const dup=await post('/auth/register',{name:'Phone Two',email:'phone-two@test.invalid',phone:'+91 98765-01234',password:'Phone#2026ok'});
      assert.equal(dup.status,409,'same phone (different formatting) is refused');
      assert.match(dup.error,/phone number/i);
      const u=(await query("SELECT * FROM users WHERE email='phone-one@test.invalid'")).rows[0];
      const mine=await request('/auth/me',{method:'PATCH',body:{phone:'9876501234'},user:u});assert.equal(mine.status,200,'own phone can be re-saved');
      const blocked=await request('/orders',{method:'POST',body:{paymentMethod:'cod'},user:u});
      assert.equal(blocked.status,403);assert.equal(blocked.code,'EMAIL_NOT_VERIFIED');
      const noPhone=await request('/payments/create-order',{method:'POST',body:{shipping:{fullName:'A B',phone:'',line1:'1 Main Road',city:'Salem',pincode:'636001'}},user});
      assert.equal(noPhone.status,400,'online payment needs a mobile number');assert.match(noPhone.error,/mobile/i);
      const badPhoneOrder=await request('/orders',{method:'POST',body:{paymentMethod:'cod',shipping:{fullName:'A B',phone:'12345',line1:'1 Main Road',city:'Salem',pincode:'636001'}},user});
      assert.equal(badPhoneOrder.status,400);
      const blockedPay=await request('/payments/create-order',{method:'POST',body:{},user:u});
      assert.equal(blockedPay.status,403);assert.equal(blockedPay.code,'EMAIL_NOT_VERIFIED');
    });
    await t.test('run-3 audit fixes: no mail bodies for staff, masked gift codes, no coupon on gift cards, pincode bound to address, coupon limit by phone',async()=>{
      // 1. the admin email list never returns message bodies (they hold reset / verification / guest links)
      await query("INSERT INTO email_outbox(to_email,subject,body) VALUES('leak@test.invalid','Reset your Salem Book House password','Open https://x.example/reset-password?token=SECRET')");
      const mails=await request('/admin/emails');assert.equal(mails.status,200,'emails '+JSON.stringify(mails));assert.ok(mails.data.emails.length>0);
      assert.ok(mails.data.emails.every(e=>!('body' in e)),'body must not be listed');
      // 2. gift-card codes are masked for staff, full for admin
      await query("INSERT INTO gift_cards(code,amount,remaining,buyer_email) VALUES('SBH-ABCD-1234-ZZZZ',500,500,'g@test.invalid') ON CONFLICT DO NOTHING");
      const mrole=(await query("INSERT INTO staff_roles(name,permissions) VALUES('Marketer',ARRAY['marketing']) RETURNING id")).rows[0];
      const marketer=(await query("INSERT INTO users(name,email,password_hash,role,staff_role_id) VALUES('Marketer','marketer@test.invalid','x','staff',$1) RETURNING *",[mrole.id])).rows[0];
      const asStaff=await request('/operations/gifts',{user:marketer});assert.equal(asStaff.status,200,'gifts '+JSON.stringify(asStaff));
      assert.ok(asStaff.data.rows.length>0&&asStaff.data.rows.every(g=>String(g.code).startsWith('****')),'staff see masked codes');
      assert.ok((await request('/operations/gifts')).data.rows.some(g=>g.code==='SBH-ABCD-1234-ZZZZ'),'admin sees full codes');
      // 3. a coupon never discounts a gift-card line
      await request('/operations/settings',{method:'PUT',body:{shippingFee:49,freeShippingThreshold:499,returnDays:7,lowStockThreshold:5,restrictedCoverage:false}});
      await query("INSERT INTO coupons(code,description,percent_off,min_order) VALUES('GC10','Ten percent',10,0) ON CONFLICT (code) DO NOTHING");
      const gift=(await query("INSERT INTO books(title,slug,author_name,mrp,sale_price,stock,product_type) VALUES('Gift card 500','gift-card-500','Salem',500,500,50,'gift-card') RETURNING *")).rows[0];
      await query('DELETE FROM cart_items WHERE cart_id=$1',[cart.id]);
      await query('INSERT INTO cart_items(cart_id,book_id,quantity) VALUES($1,$2,1)',[cart.id,gift.id]);
      const q1=await request('/payments/quote',{method:'POST',body:{...payload,couponCode:'GC10'},user});
      assert.equal(q1.status,400,JSON.stringify(q1));assert.match(q1.error,/cannot be used on gift cards/,'a coupon is refused for a gift-card-only cart');
      await query('INSERT INTO cart_items(cart_id,book_id,quantity) VALUES($1,$2,1)',[cart.id,book.id]);
      const q2=await request('/payments/quote',{method:'POST',body:{...payload,couponCode:'GC10'},user});
      assert.equal(q2.data.discount,10,'only the book (100) is discounted');
      // 4. the pincode must agree with the address text
      await query('DELETE FROM cart_items WHERE cart_id=$1',[cart.id]);
      await query('INSERT INTO cart_items(cart_id,book_id,quantity) VALUES($1,$2,1)',[cart.id,book.id]);
      const mism=await request('/orders',{method:'POST',body:{...payload,paymentMethod:'upi',shippingName:'Buyer',shippingPhone:'9876543210',shippingAddress:'12 Street, Chennai 600001'},user});
      assert.equal(mism.status,400);assert.match(mism.error,/pincode does not match/i);
      // 5. per-customer coupon limit also counts the delivery phone
      const {couponLimitError}=await import('../src/routes/coupons.js');
      await query("UPDATE orders SET coupon_code='PHONE1',guest_email='first@test.invalid',shipping_phone='9876543210',status='placed' WHERE id=$1",[order.id]);
      const msg=await couponLimitError({id:0,code:'PHONE1',per_customer_limit:1,usage_limit:null},{email:'someone-else@test.invalid',phone:'+91 98765 43210'});
      assert.equal(msg,'You have already used this coupon');
      assert.equal(await couponLimitError({id:0,code:'PHONE1',per_customer_limit:1,usage_limit:null},{email:'someone-else@test.invalid',phone:'9123456780'}),null,'a different phone is a different customer');
      await query("UPDATE orders SET coupon_code=NULL WHERE id=$1",[order.id]);
    });
  }finally{console.log('Integration assertions complete');}
});
