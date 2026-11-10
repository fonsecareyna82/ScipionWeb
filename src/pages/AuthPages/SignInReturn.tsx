import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import PageMeta from "../../components/common/PageMeta";
import { exchangeSignInCode } from "../../api/auth";
import AuthLayout from "./AuthPageLayout";

/**
 * Back from an institution's sign-in page (/auth/sso?code=… or ?error=…): the one-time code becomes the session,
 * then home; an error is told, with the way back to the sign-in page.
 */
export default function SignInReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = params.get("code") ?? "";
  const [error, setError] = useState(params.get("error") ?? (code ? "" : "This sign-in has nothing to finish."));
  const asked = useRef(false);

  useEffect(() => {
    if (!code || asked.current || params.get("error")) return;
    asked.current = true;
    exchangeSignInCode(code)
      .then(() => navigate("/home", { replace: true }))
      .catch((err: any) => setError(String(err?.message || "The sign-in could not be finished")));
  }, [code, navigate, params]);

  return (
    <>
      <PageMeta title="Scipion | Signing in" description="Finishing the sign-in" />
      <AuthLayout>
        <div className="flex flex-col flex-1">
          <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
            {error ? (
              <div role="alert">
                <h1 className="mb-3 font-semibold text-gray-800 text-title-sm dark:text-white/90">
                  The sign-in did not work
                </h1>
                <p className="mb-5 text-[15px] text-gray-700 dark:text-gray-300">{error}</p>
                <Link to="/signin" className="text-[15px] text-brand-500 hover:text-brand-600 dark:text-brand-400">
                  Back to the sign-in page
                </Link>
              </div>
            ) : (
              <p className="text-[15px] text-gray-700 dark:text-gray-300">Signing you in…</p>
            )}
          </div>
        </div>
      </AuthLayout>
    </>
  );
}
