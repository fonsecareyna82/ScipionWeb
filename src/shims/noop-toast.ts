// src/shims/noop-toast.ts
// Minimal no-op shim for react-hot-toast used in UMD builds.
// It exports a default "toast" function/object and a named <Toaster/> component.

import React from "react";

// No-op Toaster component
export const Toaster: React.FC<any> = () => null;

// No-op toast function with common methods
type ToastFn = ((message?: any, opts?: any) => void) & {
  success: (message?: any, opts?: any) => void;
  error: (message?: any, opts?: any) => void;
  loading: (message?: any, opts?: any) => string | void;
  dismiss: (toastId?: any) => void;
  remove: (toastId?: any) => void;
  promise: <T>(p: Promise<T>, msgs: { loading?: any; success?: any; error?: any }, opts?: any) => Promise<T>;
};

// Create a noop implementation
const toastImpl: ToastFn = Object.assign(
  function toast() { /* no-op */ },
  {
    success() { /* no-op */ },
    error() { /* no-op */ },
    loading() { return undefined; },
    dismiss() { /* no-op */ },
    remove() { /* no-op */ },
    async promise<T>(p: Promise<T>) { return p; },
  }
);

// Default export must mimic react-hot-toast API
export default toastImpl;

// Also export anything else you might import by name elsewhere
export const toast = toastImpl;
