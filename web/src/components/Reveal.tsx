"use client";

import type { ReactNode } from "react";
import { useInView } from "./useInView";

/** Adds `in` once scrolled into view. Content is visible without JS; CSS animates only under `.armed`. */
export default function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { ref, seen } = useInView<HTMLDivElement>(0.2);
  return (
    <div ref={ref} className={`reveal armed${seen ? " in" : ""} ${className}`}>
      {children}
    </div>
  );
}
