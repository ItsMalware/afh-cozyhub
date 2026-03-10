import React from "react";
import { LucideIcon } from "lucide-react";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export type CozyIconState = "idle" | "focus" | "breakReady" | "warning" | "success";
export type CozyIconMotion = "none" | "breathe" | "float" | "wiggle" | "glow";

export interface CozyIconProps {
    icon: LucideIcon;
    state?: CozyIconState;
    motion?: CozyIconMotion;
    size?: number | string;
    label?: string;
    className?: string;
    reducedMotion?: boolean;
}

const stateColors: Record<CozyIconState, string> = {
    idle: "text-[var(--cozy-ink)] opacity-70",
    focus: "text-[var(--cozy-sky)]",
    breakReady: "text-[var(--cozy-mint)]",
    warning: "text-[var(--cozy-amber)]",
    success: "text-[var(--cozy-mint)] opacity-90",
};

const motionClasses: Record<CozyIconMotion, string> = {
    none: "",
    breathe: "animate-breathe",
    float: "animate-float",
    wiggle: "animate-wiggle",
    glow: "animate-glow",
};

export const CozyIcon: React.FC<CozyIconProps> = ({
    icon: Icon,
    state = "idle",
    motion = "none",
    size = 20,
    label,
    className,
    reducedMotion = false,
}) => {
    const colorClass = stateColors[state];
    const animationClass = reducedMotion ? "" : motionClasses[motion];

    return (
        <div
            className={cn("inline-flex items-center justify-center transition-colors duration-300", colorClass, animationClass, className)}
            aria-label={label}
            role={label ? "img" : "presentation"}
            aria-hidden={!label}
        >
            <Icon size={size} strokeWidth={2} />
        </div>
    );
};
