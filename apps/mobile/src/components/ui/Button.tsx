import { Pressable, Text, ActivityIndicator } from "react-native";
import { COLORS } from "@/src/constants/theme";

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "destructive" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  className?: string;
};

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  icon,
  className = "",
}: ButtonProps) {
  const base = "flex-row items-center justify-center rounded-3xl min-h-[52px] px-6";
  const variants: Record<string, string> = {
    primary: "bg-sage",
    secondary: "bg-white border border-charcoal/10",
    destructive: "bg-red-600",
    ghost: "bg-transparent",
  };
  const textVariants: Record<string, string> = {
    primary: "text-white",
    secondary: "text-charcoal",
    destructive: "text-white",
    ghost: "text-sage",
  };

  return (
    <Pressable
      className={`${base} ${variants[variant]} ${disabled ? "opacity-50" : ""} ${className}`}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#fff" : COLORS.sage} />
      ) : (
        <>
          {icon}
          <Text
            className={`text-[15px] font-medium ${textVariants[variant]} ${icon ? "ml-2" : ""}`}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
