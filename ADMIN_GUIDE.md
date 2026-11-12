# Salem Book House admin guide

Open `/admin/login` with your staff account. Go to **Settings → Help & guide** for searchable in-app instructions. On a phone, use **Open menu** to reach the sidebar. Use **Jump to a page** to find a section by name.

## Daily work

| Where | What to do |
| --- | --- |
| Home | Check orders to confirm and ship, open returns, pending refunds, and low stock. The bell controls new-order sound on this browser. |
| Sales → Orders | Search by order number, customer name, phone, or email. Filter by date, payment, carrier, or status. Open an order to view items and updates, print its packing slip or address label, and arrange shipment. Use the bulk controls to confirm or pack selected orders. |
| Sales → Returns | Review the customer's reason and items. Approve pickup and record the reference, or decline with a reason. After receiving and inspecting the items, complete the return. Check its payment outcome separately. |
| Payments → Payments & refunds | Look up a payment or order. Use recovery for a captured payment without an order. Request a refund with the amount and reason. Verify gateway completion. For COD, record completion after the money has actually been returned. |
| Fulfilment → Shipping partners | Configure the carrier and pickup settings. Check the resulting AWB and courier before promising a tracking date. Address labels printed by Salem Book House are for addressing parcels. Use the carrier-issued label if required. |

## Products, customers, and campaigns

| Where | What to do |
| --- | --- |
| Catalogue → Products / Add product | Set title, author, SKU, prices, categories, stock, and visibility. Turn off **Cash on delivery available** for online-only products. Use **Inventory** for adjustments with a reason. |
| Catalogue → Import & bulk tools | Export the CSV template. Keep `id` to update a product and leave it blank to create one. Supply title, author, MRP, sale price, whole-number stock, and `true` or `false` visibility. Import up to 1,000 rows at a time. Keep an export before changing many products. Bulk actions can publish, hide, set a price, or add a category. |
| Sales → Customers / Reviews / Gift cards | Open a customer to see their orders and add internal notes. Moderate reviews. Search gift cards and inspect their balances and transaction history. Treat full gift-card codes like cash. |
| Marketing → Banners & coupons / Promotional emails / Subscribers | Prepare and preview offers. Check the coupon dates and subscriber selection before sending. Use the outbox to inspect delivery and retry eligible failed messages. |
| Payments → Sales reports | Pick a date range, review order totals and payment metrics, and export the orders if your role allows it. Treat CSV exports as customer data. |

## Store settings and staff access

- **Store settings** controls shipping fees, free shipping, delivery pincodes, the return window, and the low-stock threshold. After changing delivery rules, check a sample pincode and quote.
- **Staff & roles** controls permissions. Give read-only staff **Orders** or **Products**. Add **Edit orders** or **Edit products** when they need to make changes. Grant **Refunds** separately to staff authorized to issue or reconcile payments.
- **Audit history** shows recorded changes. Use **Account security** to enable authenticator-based two-factor sign-in. A staff password reset ends that staff member's existing sessions.
- Guest order links expire after 24 hours. A guest can request a fresh link using the email and order number from checkout. Links issued before expiry tracking was introduced also need to be requested again.

## Gaps worth prioritizing

| Priority | Missing or limited capability | Why it matters |
| --- | --- | --- |
| High | Carrier-issued label retrieval and return-pickup booking | Staff currently print an address label or record a pickup reference. Native booking and labels would cut switching between systems. |
| High | COD remittance reconciliation | Delivery changes the store payment status. There is no dedicated workflow to compare carrier remittances against orders and flag shortages. |
| Medium | CSV preview with per-row errors and a change summary | Import is transactional, but staff cannot preview price, stock, and visibility changes before applying the file. |
| Medium | Purchase orders and supplier receiving | Inventory supports manual adjustments and history. A purchase-order workflow would track stock expected from suppliers. |
| Medium | Separate permission for exporting customer data and launching campaigns | Section access currently carries multiple capabilities. Separate permissions would make it easier to delegate daily work. |

Verify payment and shipment state with the provider whenever the admin shows a pending or uncertain result. Use Audit history and the order number when handing a case to another staff member.
