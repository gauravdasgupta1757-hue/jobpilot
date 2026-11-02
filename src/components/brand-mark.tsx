import { cn } from "@/lib/cn";

/** JobPilot's mark: a cream tile with a bold "J", as in the rail. Decorative: put the name next to it. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-[13px] bg-[#f7efd2] text-[19px] leading-none font-extrabold tracking-[-0.04em] text-[#111114]",
        className,
      )}
    >
      J
    </span>
  );
}
