import DocsHub, { type DocTopic } from '../components/DocsHub';

const support = { label: 'Email support', to: 'mailto:support@salembookhouse.com' };
const orders = { label: 'My orders', to: '/account/orders' };
const guest = { label: 'Find a guest order', to: '/guest-order' };
const track = { label: 'Track an order', to: '/track' };
const contact = { label: 'Contact us', to: '/contact' };
const stores = { label: 'Store details', to: '/stores' };

const shipping: DocTopic = { id:'shipping', title:'Shipping and delivery', summary:'Check your pincode before placing an order.', paragraphs:[
  'Enter the delivery pincode at checkout to see whether we can deliver and what shipping costs. Delivery times depend on the destination and carrier. An estimate is not a guaranteed date.',
  'After dispatch, open your order for the latest update and the courier tracking number when available. If tracking has stalled or a parcel shows delivered but hasn’t arrived, contact us with your order number.',
], links:[track, contact] };
const returns: DocTopic = { id:'returns', title:'Cancellations, returns and refunds', summary:'Start with the order you need help with.', paragraphs:[
  'Open the order and use Cancel if the option is available before dispatch. If the order has already shipped, check its status and contact support about the next step.',
  'For a damaged, wrong or missing item, contact us promptly. Keep the packaging and proof of purchase. If Request return is available on the order, select the item or order as prompted and tell us what happened. The return window starts at delivery and eligibility depends on the order.',
  'We review return requests before confirming the next step. If a refund is due, check the payment status on the order. Contact us with the order number if the status is unclear. Never share a PIN, OTP or full card number.',
], links:[orders, guest, contact] };
const payment: DocTopic = { id:'payments', title:'Payments, offers and gift cards', paragraphs:[
  'Checkout shows the payment methods available for the items in your cart. When online payments are available, Razorpay handles supported UPI, card and net banking payments. Some products require online payment and are unavailable for Cash on Delivery.',
  'Apply an eligible coupon or an e-gift card at checkout and review the updated total before paying. Offers may expire or have order requirements. Keep gift-card codes private.',
  'If money was deducted and no order appears, use the previous-payment check at checkout if available. Check your order history or confirmation email before trying again. Contact support with the payment reference if you still need help.',
], links:[orders, contact] };
const helpTopics: DocTopic[] = [
  { id:'orders', title:'Find or track an order', paragraphs:['Signed in when you ordered? Open My orders to find your order history and available actions. Checked out as a guest? Enter the order number and checkout email to request a private access link. If the link has expired, request a fresh one.'], links:[orders, guest, track] },
  shipping, returns, payment,
  { id:'account', title:'Sign-in and email verification', paragraphs:['Verify your email from the message sent to your inbox. If you can’t find the message, check spam and request another from your account. Use Forgot password to request a reset email.'], links:[{label:'My account',to:'/account'},{label:'Reset password',to:'/forgot-password'}] },
  { id:'shopping', title:'Find books, exam guides and gifts', paragraphs:['Search by title or author, or browse Tamil and English books, school and college texts, competitive exam guides, stationery, toys and gifts. Call the Salem shop to check availability before a special trip.'], links:[{label:'Browse products',to:'/shop'},{label:'Competitive exams',to:'/exams'},stores] },
];

export type StoreHelpPage = 'help' | 'shipping' | 'returns' | 'about' | 'contact' | 'terms' | 'privacy';
const pages: Record<StoreHelpPage, { title:string; intro:string; topics:DocTopic[]; shortcuts?: DocTopic['links'] }> = {
  help: { title:'How can we help?', intro:'Find answers about shopping online or visiting Salem Book House.', topics:helpTopics, shortcuts:[orders, guest, contact] },
  shipping: { title:'Shipping & delivery', intro:'Check delivery availability, charges and tracking for your order.', topics:[shipping], shortcuts:[track] },
  returns: { title:'Returns & refunds', intro:'Find out how to cancel an order, report a problem or request a return.', topics:[returns], shortcuts:[orders, guest] },
  about: { title:'About Salem Book House', intro:'A bookshop in Salem for readers, students and families. Shop online or visit us in person.', topics:[
    { id:'catalogue', title:'What you’ll find', paragraphs:['Browse Tamil and English books, school and board guides, college textbooks, competitive exam preparation, novels, stationery, toys, gifts and e-gift cards.'], links:[{label:'Explore the shop',to:'/shop'},{label:'Exam preparation',to:'/exams'}] },
    { id:'visit', title:'Visit the Salem store', paragraphs:['Speak to the store team for help finding an edition, textbook or exam guide. Contact the shop to check stock and current hours before visiting.'], links:[stores,contact] },
  ] },
  contact: { title:'Contact Salem Book House', intro:'Get help with an order, ask about a book or plan a store visit.', shortcuts:[support,{label:'Call 94877 24584',to:'tel:+919487724584'},{label:'WhatsApp',to:'https://wa.me/919487724584'}], topics:[
    { id:'order-help', title:'Help with an online order', paragraphs:['Have your order number and checkout email ready. Tell us what happened and which item is affected. Never include passwords, payment PINs or one-time codes.'], links:[orders,guest,support] },
    { id:'store', title:'Store enquiries', paragraphs:['Store hours are usually Monday to Saturday 9:30 am–9 pm and Sunday 10 am–8 pm. Call ahead for holiday hours or stock availability.'], links:[stores,{label:'Call 79049 57436',to:'tel:+917904957436'},{label:'Landline 0427 2411315',to:'tel:+914272411315'}] },
  ] },
  terms: { title:'Terms & conditions', intro:'Information about buying from Salem Book House online.', topics:[
    { id:'purchases', title:'Orders and pricing', paragraphs:['Review the items, delivery details and total shown at checkout. Product prices include applicable taxes unless stated otherwise. We may cancel an order if stock, pricing or payment issues prevent fulfilment and will notify you if that happens.'] },
    { id:'order-policy', title:'Delivery, cancellation and returns', paragraphs:['Delivery depends on your pincode and carrier. Request cancellation before dispatch where available. If an item arrives damaged or differs from what you ordered, keep proof of purchase and request help within the return window shown for your order. Opened stationery may have limited return eligibility.'], links:[{label:'Shipping information',to:'/shipping'},{label:'Return information',to:'/returns'}] },
    { id:'gift-cards', title:'Payments and gift cards', paragraphs:['Use the payment options shown at checkout. Redeemed gift-card balances cannot be exchanged for cash. For questions about an order, contact Salem Book House.'], links:[contact] },
  ] },
  privacy: { title:'Privacy policy', intro:'How Salem Book House uses the information you provide when shopping or contacting us.', topics:[
    { id:'data', title:'Information used to run the store', paragraphs:['We use contact, account, delivery and order details to manage accounts, fulfil purchases, provide support and send relevant updates. Guest checkout uses the contact and delivery details needed for the order.'] },
    { id:'providers', title:'Payments, shipping and messages', paragraphs:['We use payment, delivery and messaging providers to process payments, deliver orders and send communications. Payment details entered into Razorpay checkout are handled by the payment provider.'] },
    { id:'choices', title:'Your choices and requests', paragraphs:['Use the unsubscribe link in promotional messages to stop receiving offers. Contact support to request a correction or deletion of your account data. Some order and invoice records may need to be retained.'], links:[support] },
  ] },
};

export default function StoreHelp({ page }: { page: StoreHelpPage }) {
  return <div className="container"><DocsHub key={page} label="Salem Book House · Customer help" {...pages[page]} /></div>;
}
