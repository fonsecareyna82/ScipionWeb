import * as React from "react";

type ButtonSize = "sm" | "md";
type ButtonVariant = "primary" | "outline";

type ButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "children"
> & {
  children: React.ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  className?: string;
  type?: "button" | "submit" | "reset";
};

const Button: React.FC<ButtonProps> = ({
  children,
  size = "md",
  variant = "primary",
  startIcon,
  endIcon,
  onClick,
  className = "",
  disabled = false,
  type = "button",
  ...rest
}) => {
  // pxBasedSizingToAvoidHostRemScaling
  const sizeClasses: Record<ButtonSize, string> = {
    sm: "px-[14px] py-[10px] text-[13px]",
    md: "px-[18px] py-[12px] text-[14px]",
  };

  // stablePaletteToAvoidMissingBrandTokensInHost
  const variantClasses: Record<ButtonVariant, string> = {
    primary:
      "bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-300",
    outline:
      "bg-white text-gray-800 border border-gray-300 hover:bg-gray-50 " +
      "dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800",
  };

  // baseResetToReduceHostCssInterference
  const baseClasses =
    "appearance-none inline-flex items-center justify-center gap-2 " +
    "rounded-lg font-medium leading-[1.1] select-none whitespace-nowrap " +
    "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
    "disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <button
      type={type}
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {startIcon && <span className="flex items-center">{startIcon}</span>}
      {children}
      {endIcon && <span className="flex items-center">{endIcon}</span>}
    </button>
  );
};

export default Button;
