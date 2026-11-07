import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-bold tracking-wide cursor-pointer transition-all duration-300 ease-out focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 relative overflow-hidden active:scale-95",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-accent-light to-accent text-primary-dark shadow-accent-glow hover:brightness-105 border-b-[3px] border-accent-dark",
        destructive:
          "bg-gradient-to-b from-coral-light to-coral text-white shadow-coral-glow hover:brightness-105 border-b-[3px] border-coral-dark",
        outline:
          "border-[3px] border-primary-dark bg-cream text-primary-dark shadow-sm hover:bg-primary-bg",
        secondary:
          "bg-gradient-to-b from-info to-primary text-white shadow-sky-glow hover:brightness-105 border-b-[3px] border-primary-dark",
        ghost: "hover:bg-primary-bg hover:text-primary-dark",
        link: "text-primary-dark underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[44px] px-6 py-2 text-base",
        sm: "h-[36px] rounded-full px-4 text-sm",
        lg: "h-[54px] rounded-full px-8 text-lg",
        icon: "h-[44px] w-[44px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
