import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { verifyEmail, resendVerificationCode } from "@/api/auth";

export default function VerifyEmailForm() {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const navigate = useNavigate();

  const handleVerify = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const data = await verifyEmail(code);
      if (data) {
        setSuccessMessage("Email verified successfully!");
        setTimeout(() => navigate("/signin"), 2000);
      }
      else {
        setErrorMessage("Unexpected error");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unexpected error");
    }
  };

  const handleResend = async () => {
    try {
      const data = await resendVerificationCode(email);
      if (data)
        setResendMessage("Verification code resent to your email.");
      else
        setResendMessage("Failed to resend code");
    } catch (error) {
      setResendMessage(error instanceof Error ? error.message : "Failed to resend code");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
        <h2 className="mb-4 text-xl font-semibold text-center text-gray-800 dark:text-white">
          Verify Your Email
        </h2>
        <form onSubmit={handleVerify} className="space-y-4">
          <input
            type="text"
            placeholder="Enter verification code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:text-white"
          />
          <button
            type="submit"
            className="w-full bg-brand-500 text-white py-2 rounded hover:bg-brand-600 transition"
          >
            Verify Email
          </button>
        </form>

        <div className="mt-6 space-y-3">
          <input
            type="email"
            placeholder="Enter your email to resend code"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:text-white"
          />
          <button
            onClick={handleResend}
            className="w-full bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300 transition dark:bg-gray-700 dark:text-white"
          >
            Resend Verification Code
          </button>
          {resendMessage && (
            <p className="text-sm text-center text-green-600">{resendMessage}</p>
          )}
        </div>

        {(errorMessage || successMessage) && (
          <div className="mt-4 text-center">
            {errorMessage && <p className="text-sm text-error-500">{errorMessage}</p>}
            {successMessage && <p className="text-sm text-green-600">{successMessage}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
