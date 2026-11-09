import { useState } from "react";
import { Link } from "react-router-dom";

import PageMeta from "../../components/common/PageMeta";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Button from "../../components/ui/button/Button";
import { forgotPassword } from "../../api/auth";
import AuthLayout from "./AuthPageLayout";

/** Ask for a link to choose a new password, mailed to the account's address. */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setMessage((await forgotPassword(email.trim())).message);
    } catch (err: any) {
      setError(String(err?.message || "The request did not go: try again"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageMeta title="Scipion | Forgot password" description="Choose a new password" />
      <AuthLayout>
        <div className="flex flex-col flex-1">
          <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
            <div className="mb-5 sm:mb-8">
              <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
                Forgot your password?
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Write the address of your account: we mail you a link to choose a new one.
              </p>
            </div>
            {message ? (
              <p role="status" className="text-sm text-gray-700 dark:text-gray-300">{message}</p>
            ) : (
              <form onSubmit={submit}>
                <div className="space-y-6">
                  <div>
                    <Label htmlFor="forgot-email">Email <span className="text-error-500">*</span></Label>
                    <Input id="forgot-email" type="email" placeholder="you@example.org" value={email}
                           onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <Button className="w-full" size="sm" type="submit" disabled={busy || !email.trim()}>
                    {busy ? "Sending…" : "Mail me a link"}
                  </Button>
                  {error && <p className="text-sm text-red-500 text-center">{error}</p>}
                </div>
              </form>
            )}
            <p className="mt-5 text-sm text-gray-700 dark:text-gray-400">
              <Link to="/signin" className="text-brand-500 hover:text-brand-600 dark:text-brand-400">Back to sign in</Link>
            </p>
          </div>
        </div>
      </AuthLayout>
    </>
  );
}
