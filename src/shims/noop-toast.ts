// src/shims/noop-toast.ts
// No-op shim for react-hot-toast used only in UMD builds.
// Prevents crashes from portal/style mounting in host pages.

type ToastFn = (msg?: any, opts?: any) => void;

const nop: ToastFn = () => { /* noop */ };

const toast = Object.assign(nop, {
  success: nop,
  error: nop,
  loading: nop,
  dismiss: (_id?: string) => { /* noop */ },
  remove: (_id?: string) => { /* noop */ },
  custom: nop,
  promise: async <T>(p: Promise<T>, _msgs: any) => p,
  // expose config but ignore
  configure: (_opts: any) => { /* noop */ },
  // Toaster component no-ops (returns null)
  Toaster: () => null,
});

export default toast;
export { toast };
