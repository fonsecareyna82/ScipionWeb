import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import PageMeta from "../../components/common/PageMeta";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Button from "../../components/ui/button/Button";
import { resetPassword } from "../../api/auth";
import AuthLayout from "./AuthPageLayout";

/** Choose a new password with the link mailed for it (?token=…). */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const mismatch = repeat.length > 0 && repeat !== password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setDone((await resetPassword(token, password)).message);
    } catch (err: any) {
      setError(String(err?.message || "The new password could not be set"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageMeta title="Scipion | New password" description="Choose a new password" />
      <AuthLayout>
        <div className="flex flex-col flex-1">
          <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
            <div className="mb-5 sm:mb-8">
              <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
                Choose a new password
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                At least 8 characters, with a letter and a number.
              </p>
            </div>
            {!token ? (
              <p className="text-sm text-red-500">
                This page opens from the link of the mail.{" "}
                <Link to="/forgot-password" className="text-brand-500">Ask for one</Link>.
              </p>
            ) : done ? (
              <p role="status" className="text-sm text-gray-700 dark:text-gray-300">
                {done} <Link to="/signin" className="text-brand-500">Sign in</Link>
              </p>
            ) : (
              <form onSubmit={submit}>
                <div className="space-y-6">
                  <div>
                    <Label htmlFor="new-password">New password <span className="text-error-500">*</span></Label>
                    <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="repeat-password">Repeat it <span className="text-error-500">*</span></Label>
                    <Input id="repeat-password" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
                    {mismatch && <p className="mt-1 text-sm text-red-500">The two passwords are not the same.</p>}
                  </div>
                  <Button className="w-full" size="sm" type="submit"
                          disabled={busy || password.length < 8 || repeat !== password}>
                    {busy ? "Saving…" : "Set the new password"}
                  </Button>
                  {error && (
                    <p className="text-sm text-red-500 text-center">
                      {error} <Link to="/forgot-password" className="text-brand-500">Ask for a new link</Link>
                    </p>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      </AuthLayout>
    </>
  );
}
