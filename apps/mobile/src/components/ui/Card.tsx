import { View, ViewProps } from "react-native";

type CardProps = ViewProps & {
  variant?: "default" | "sage" | "beige";
  className?: string;
  children: React.ReactNode;
};

export function Card({ variant = "default", className = "", children, ...props }: CardProps) {
  const variants: Record<string, string> = {
    default: "bg-white border border-charcoal/10",
    sage: "bg-sage",
    beige: "bg-beige",
  };

  return (
    <View className={`rounded-2xl p-4 ${variants[variant]} ${className}`} {...props}>
      {children}
    </View>
  );
}
