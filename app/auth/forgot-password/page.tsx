import { ForgotPasswordForm } from "@/components/forgot-password-form";

export default function Page() {
  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-background px-4 py-8 sm:p-8">
      <div className="w-full max-w-md">
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
