"use server";

import { verify } from "@node-rs/argon2";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "./env";
import { createSessionToken, SESSION_COOKIE } from "./session";

export async function login(
  _prev: { error: boolean },
  formData: FormData,
): Promise<{ error: boolean }> {
  const env = getEnv();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const locale = String(formData.get("locale") ?? "he");

  const emailOk = email === env.AUTH_EMAIL.toLowerCase();
  // Always run the hash verification to keep timing uniform.
  const passwordOk = await verify(env.AUTH_PASSWORD_HASH, password).catch(() => false);
  if (!emailOk || !passwordOk) return { error: true };

  const token = await createSessionToken(email, env.AUTH_SECRET);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect(`/${locale}`);
}

export async function logout(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "he");
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect(`/${locale}/login`);
}
