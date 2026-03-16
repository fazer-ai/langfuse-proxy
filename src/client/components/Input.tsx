import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/client/lib/utils";

type BaseInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  error?: boolean;
  errorMessage?: string;
  helperText?: string;
};

type PasswordToggleInputProps = BaseInputProps & {
  showPasswordToggle: true;
  type: "password";
};

type RegularInputProps = BaseInputProps & {
  showPasswordToggle?: false;
  type?: React.InputHTMLAttributes<HTMLInputElement>["type"];
};

type InputProps = PasswordToggleInputProps | RegularInputProps;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      error,
      errorMessage,
      helperText,
      showPasswordToggle,
      type,
      autoComplete,
      ...props
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const hasError = error || !!errorMessage;
    const descriptionId = useId();
    const hasDescription = !!errorMessage || !!helperText;
    const [showPassword, setShowPassword] = useState(false);

    return (
      <div className="w-full">
        <div className="relative">
          <input
            ref={ref}
            type={showPasswordToggle && showPassword ? "text" : type}
            autoComplete={
              showPasswordToggle
                ? (autoComplete ?? "new-password")
                : autoComplete
            }
            aria-invalid={hasError || undefined}
            aria-describedby={hasDescription ? descriptionId : undefined}
            className={cn(
              "w-full rounded-lg border border-border bg-bg-tertiary px-4 py-2 text-text-primary placeholder-text-placeholder focus:border-border-focus focus:outline-none disabled:opacity-60",
              { "border-error": hasError, "pr-10": !!showPasswordToggle },
              className,
            )}
            {...props}
          />
          {showPasswordToggle && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-text-muted hover:text-text-primary"
              tabIndex={-1}
              aria-label={
                showPassword
                  ? t("common.hidePassword", "Hide password")
                  : t("common.showPassword", "Show password")
              }
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
        {errorMessage && (
          <span id={descriptionId} className="mt-1 block text-error text-xs">
            {errorMessage}
          </span>
        )}
        {helperText && !errorMessage && (
          <span
            id={descriptionId}
            className="mt-1 block text-text-muted text-xs"
          >
            {helperText}
          </span>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
