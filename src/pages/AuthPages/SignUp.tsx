import { useEffect } from "react";
import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignUpForm from "../../components/auth/SignUpForm";
import { useProcessingPlugins } from "@/hooks/useProcessingPlugins";


export default function SignUp() {
  const { clearProcessingState } = useProcessingPlugins();

  useEffect(() => {
    clearProcessingState();
   
  }, []);

  return (
    <>
      <PageMeta
        title="Scipion"
        description="Scipion web"
      />
      <AuthLayout>
        <SignUpForm />
      </AuthLayout>
    </>
  );
}
