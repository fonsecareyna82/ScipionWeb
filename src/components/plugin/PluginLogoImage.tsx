import { useState, type ReactNode } from "react";

/** A plugin's logo, or the fallback when it has none or it does not load (Scipion's server may not answer). */
export default function PluginLogoImage({ src, alt, className, fallback }: {
  src?: string;
  alt: string;
  className?: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <>{fallback}</>;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(src)} />;
}
