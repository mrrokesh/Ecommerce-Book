export const transitions = {
  placed: ['confirmed', 'cancelled'], confirmed: ['packed', 'shipped', 'cancelled'],
  packed: ['shipped', 'cancelled'], shipped: ['out_for_delivery', 'delivered', 'returned'],
  out_for_delivery: ['delivered', 'returned'], delivered: ['return_requested'],
  return_requested: ['return_approved', 'delivered'], return_approved: ['returned'],
  cancelled: [], returned: [],
};
export function assertTransition(from, to) {
  if (from !== to && !transitions[from]?.includes(to)) throw new Error(`Cannot change ${from} to ${to}`);
}
export function money(value) { return Math.round(Number(value) * 100) / 100; }
export function canReturn(order, days = 7, now = Date.now()) {
  const delivered = new Date(order.delivered_at).getTime();
  return order.status === 'delivered' && !!order.delivered_at && Number.isFinite(delivered) && now >= delivered && now - delivered <= days * 86400000;
}
