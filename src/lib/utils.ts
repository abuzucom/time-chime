import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names into a single string, resolving conflicting
 * utilities via `tailwind-merge` (e.g. `px-2 px-4` collapses to `px-4`).
 * Named `cn` to match the shadcn/ui ecosystem convention.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
