import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight text-[#15263d]">
      <span
        aria-hidden="true"
        className="grid h-9 w-9 place-items-center rounded-xl bg-[#15263d] text-sm font-black text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.2)]"
      >
        C/
      </span>
      {!compact && <span className="text-[17px]">CodeLens Studio</span>}
    </Link>
  );
}
