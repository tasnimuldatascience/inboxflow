"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { api, post } from "../lib/api";
import { Feedback } from "./ui";
export function Auth({ mode }: { mode: string }) {
  return (
    <Suspense>
      <AuthInner mode={mode} />
    </Suspense>
  );
}
function AuthInner({ mode }: { mode: string }) {
  const router = useRouter(),
    params = useSearchParams(),
    {
      register,
      handleSubmit,
      formState: { isSubmitting },
    } = useForm<Record<string, string>>();
  const [message, setMessage] = useState(""),
    [error, setError] = useState(false);
  const title = (
    {
      login: "Welcome back.",
      register: "Your next chapter starts here.",
      recover: "Reset your password.",
      reset: "Choose a new password.",
      invite: "Join your team.",
    } as any
  )[mode];
  const submit = async (values: Record<string, string>) => {
    try {
      setError(false);
      setMessage("");
      if (mode === "invite") {
        await api("/auth/me");
        await post("/team/accept", {
          token: params.get("token") || values.token,
        });
        router.push("/app");
      } else if (mode === "recover") {
        const r = await post("/auth/recover", values);
        setMessage(
          r.sandboxToken
            ? `Local recovery token: ${r.sandboxToken}`
            : r.message,
        );
      } else if (mode === "reset") {
        await post("/auth/reset", {
          password: values.password,
          token: params.get("token") || values.token,
        });
        setMessage("Password reset. You can sign in.");
      } else {
        await post("/auth/" + mode, values);
        router.push("/app");
      }
    } catch (e) {
      setError(true);
      setMessage((e as Error).message);
    }
  };
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Mail size={20} />
          </span>
          inboxflow<span className="brand-dot">®</span>
        </Link>
        <div>
          <BadgeWord />{" "}
          <h1>
            Less friction.
            <br />
            More possibility.
          </h1>
          <p>
            Bring your store, your customers, and their next great moment
            together. Right in the inbox.
          </p>
          <div className="auth-art">
            <span className="orbit one" />
            <span className="orbit two" />
            <div className="art-envelope">✦</div>
          </div>
        </div>
        <small>Original product · Local sandbox environment</small>
      </div>
      <main className="auth-form">
        <Link href="/" className="mobile-brand brand">
          inboxflow
        </Link>
        <div className="eyebrow">LET’S MAKE CONNECTIONS</div>
        <h1>{title}</h1>
        <p>
          {mode === "login"
            ? "Sign in to your InboxFlow workspace."
            : "Build something your customers will love."}
        </p>
        <form onSubmit={handleSubmit(submit)}>
          {mode === "register" && (
            <>
              <label>
                Your name
                <input
                  {...register("name", { required: true })}
                  autoComplete="name"
                  required
                />
              </label>
              <label>
                Organization
                <input
                  {...register("organization", { required: true })}
                  required
                />
              </label>
            </>
          )}
          {!["reset", "invite"].includes(mode) && (
            <label>
              Email address
              <input
                type="email"
                {...register("email", { required: true })}
                defaultValue={mode === "login" ? "owner@inboxflow.local" : ""}
                autoComplete="email"
                required
              />
            </label>
          )}
          {!["recover", "invite"].includes(mode) && (
            <label>
              Password
              <input
                type="password"
                {...register("password", { required: true })}
                defaultValue={mode === "login" ? "InboxFlowDemo!2026" : ""}
                minLength={mode === "register" || mode === "reset" ? 12 : 1}
                maxLength={128}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
              />
            </label>
          )}
          {["reset", "invite"].includes(mode) && !params.get("token") && (
            <label>
              Token
              <input {...register("token", { required: true })} required />
            </label>
          )}
          <Feedback message={message} error={error} />
          <button className="btn primary full" disabled={isSubmitting}>
            {isSubmitting
              ? "Working…"
              : mode === "login"
                ? "Sign in"
                : mode === "register"
                  ? "Create workspace"
                  : mode === "invite"
                    ? "Accept invitation"
                    : "Continue"}
            <ArrowRight size={18} />
          </button>
        </form>
        {mode === "login" && (
          <>
            <div className="row between">
              <Link href="/recover">Forgot password?</Link>
              <Link href="/register">Create an account</Link>
            </div>
            <div className="callout">
              <ShieldCheck size={20} />
              <div>
                <strong>Try the local demo</strong>
                <p>
                  Seeded owner credentials are filled in. Editor, analyst,
                  viewer, and admin accounts use the same demo password.
                </p>
              </div>
            </div>
          </>
        )}
        {mode !== "login" && <Link href="/login">Return to sign in →</Link>}
      </main>
    </div>
  );
}
function BadgeWord() {
  return <span className="pill">✦ A better kind of email</span>;
}
