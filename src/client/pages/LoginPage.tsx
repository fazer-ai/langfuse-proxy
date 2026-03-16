import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { Button, Input } from "@/client/components";
import { useAuth } from "@/client/contexts/AuthContext";
import { api } from "@/client/lib/api";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: apiError } = await api.api.auth.login.post({
        email,
        password,
      });

      if (apiError) {
        setError(
          (apiError.value as { error?: string })?.error ||
            t("auth.loginFailed", "Login failed"),
        );
        return;
      }

      if (data?.user) {
        login(data.user);
        navigate("/");
      }
    } catch {
      setError(
        t("auth.genericError", "Something went wrong. Please try again."),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-md">
        <h1 className="mb-8 text-center font-bold text-3xl text-text-primary">
          {t("auth.login", "Login")}
        </h1>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-border bg-bg-secondary p-8"
        >
          {error && (
            <div className="rounded-lg border border-error bg-error-soft px-4 py-2 text-error text-sm">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="mb-1 block font-medium text-sm text-text-primary"
            >
              {t("auth.email", "Email")}
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder={t("auth.emailPlaceholder", "you@example.com")}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block font-medium text-sm text-text-primary"
            >
              {t("auth.password", "Password")}
            </label>
            <Input
              id="password"
              type="password"
              showPasswordToggle
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="••••••••"
            />
          </div>

          <Button type="submit" loading={loading} className="w-full">
            {loading
              ? t("auth.loggingIn", "Logging in...")
              : t("auth.login", "Login")}
          </Button>
        </form>

        <p className="mt-4 text-center text-text-secondary">
          {t("auth.noAccount", "Don't have an account?")}{" "}
          <Link
            to="/signup"
            className="font-medium text-accent hover:underline"
          >
            {t("auth.signup", "Sign Up")}
          </Link>
        </p>
      </div>
    </div>
  );
}
