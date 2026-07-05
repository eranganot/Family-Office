import { getTranslations } from "next-intl/server";
import { LoginForm } from "./login-form";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("login");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <h1 className="mb-6 text-xl font-bold">{t("title")}</h1>
      <LoginForm
        locale={locale}
        labels={{
          email: t("email"),
          password: t("password"),
          submit: t("submit"),
          error: t("error"),
        }}
      />
    </main>
  );
}
