import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...entrees: ClassValue[]) {
  return twMerge(clsx(entrees));
}
