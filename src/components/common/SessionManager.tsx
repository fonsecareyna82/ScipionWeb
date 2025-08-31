// src/components/common/SessionManager.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SessionTimeoutModal from "./SessionTimeoutModal";

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_TIMEOUT = 60; // seconds

export default function SessionManager() {
    const navigate = useNavigate();
    const [showWarning, setShowWarning] = useState(false);
    const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
    const logoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  
    const clearTimers = () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      warningTimerRef.current = null;
      logoutTimerRef.current = null;
    };
  
    const startTimers = () => {
      clearTimers();
      setShowWarning(false); // Closing the Modal
  
      warningTimerRef.current = setTimeout(() => {
        setShowWarning(true);
      }, SESSION_TIMEOUT - WARNING_BEFORE_TIMEOUT * 1000);
  
      logoutTimerRef.current = setTimeout(() => {
        localStorage.removeItem("accessToken");
        navigate("/signin");
      }, SESSION_TIMEOUT);
    };
  
    const resetSession = () => {
      clearTimers();
      setShowWarning(false);
      startTimers();
    };
  
    useEffect(() => {
      startTimers();
  
      const events = ["mousemove", "keydown", "click"];
      events.forEach((event) => window.addEventListener(event, resetSession));
  
      return () => {
        events.forEach((event) => window.removeEventListener(event, resetSession));
        clearTimers();
      };
    }, []);
  
    return (
      <SessionTimeoutModal
        isVisible={showWarning}
        onStayConnected={resetSession}
        countdownStart={WARNING_BEFORE_TIMEOUT}
      />
    );
  }