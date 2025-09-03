// src/components/auth/ProtectedRoute.tsx
import { Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { jwtDecode, JwtPayload } from "jwt-decode";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const token = localStorage.getItem("accessToken");

  if (!token) {
    return <Navigate to="/" replace />;
  }

  try {
    const decoded = jwtDecode<JwtPayload>(token);
    const now = Date.now() / 1000;

    if (decoded.exp && decoded.exp < now) {
      // Token caducado → limpiar y redirigir
      localStorage.removeItem("accessToken");
      return <Navigate to="/" replace />;
    }

    return <>{children}</>;
  } catch (err) {
    // Token inválido (no se puede decodificar)
    localStorage.removeItem("accessToken");
    return <Navigate to="/" replace />;
  }
}
