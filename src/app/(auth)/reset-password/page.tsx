import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "New password" };

export default function Page() {
  return (
    <Suspense>
      <AuthForm mode="reset" />
    </Suspense>
  );
}
