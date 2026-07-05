"use client";

import { useActionState } from "react";
import { login } from "../../../lib/auth-actions";

type Labels = { email: string; password: string; submit: string; error: string };

export function LoginForm({ locale, labels }: { locale: string; labels: Labels }) {
  const [state, action, pending] = useActionState(login, { error: false });
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <label className="flex flex-col gap-1 text-sm">
        {labels.email}
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          className="rounded-lg border border-neutral-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {labels.password}
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-lg border border-neutral-300 px-3 py-2"
        />
      </label>
      {state.error ? <p className="text-sm text-red-600">{labels.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {labels.submit}
      </button>
    </form>
  );
}
