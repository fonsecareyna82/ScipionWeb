// src/components/common/SessionTimeoutModal.tsx
import React, { useEffect, useState } from "react";
import Button from "../ui/button/Button";
import { Modal } from "../ui/modal";

interface Props {
  isVisible: boolean;
  onStayConnected: () => void;
  countdownStart: number; // segundos
}

export default function SessionTimeoutModal({ isVisible, onStayConnected, countdownStart }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(countdownStart);

  useEffect(() => {
    if (!isVisible) return;

    setSecondsLeft(countdownStart); // restarts on opening

    const interval = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [isVisible, countdownStart]);

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${min}:${sec}`;
  };

  return (
    <Modal isOpen={isVisible} onClose={onStayConnected} className="max-w-[400px] m-4">
      <div className="p-6 bg-white dark:bg-gray-900 rounded-xl">
        <h4 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
        Session about to expire
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 mt-8">
        You have been inactive. Your session will close in <strong>{formatTime(secondsLeft)}</strong>
        </p>
        <div className="flex justify-end gap-3">
         {/* <Button size="sm" onClick={onStayConnected}>
          Stay connected
          </Button> */}
        </div>
      </div>
    </Modal>
  );
}
