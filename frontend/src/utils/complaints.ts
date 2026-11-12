export const COMPLAINT_CATEGORIES: { value: string; label: string }[] = [
  { value: 'order_delivery', label: 'Order or delivery' },
  { value: 'payment_refund', label: 'Payment or refund' },
  { value: 'product_quality', label: 'Product quality' },
  { value: 'website_app', label: 'Website problem' },
  { value: 'staff_service', label: 'Staff or service' },
  { value: 'other', label: 'Other' },
];

export const COMPLAINT_STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_customer: 'Waiting for you',
  resolved: 'Resolved',
  closed: 'Closed',
};

/** Pill colour class shared by the storefront and the admin portal. */
export function complaintTone(status: string): 'ok' | 'bad' | 'warn' | '' {
  if (status === 'resolved') return 'ok';
  if (status === 'closed') return '';
  if (status === 'open') return 'bad';
  return 'warn';
}

export type ComplaintMessage = { id: number; type: 'customer' | 'staff' | 'note'; author: string; body: string; createdAt: string };
