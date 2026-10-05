/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface RazorpayInstance {
  open: () => void;
}

interface Window {
  Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
}
