import Link from "next/link";
import { Brand } from "@/components/ui/brand";

export default function DemoPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#15263d] px-6 text-center text-white">
      <div className="max-w-xl">
        <div className="inline-flex rounded-2xl bg-white p-3">
          <Brand compact />
        </div>
        <p className="mt-8 text-xs font-black uppercase tracking-[0.22em] text-[#ff8a70]">
          Day 3 route reserved
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-[-0.04em]">
          The seeded demo board is coming next.
        </h1>
        <p className="mt-5 leading-7 text-white/65">
          Day 1 keeps this route intentionally quiet while persistence and canvas geometry earn
          their acceptance gate.
        </p>
        <Link
          href="/boards"
          className="mt-8 inline-block rounded-xl bg-[#ff5a36] px-5 py-3 text-sm font-bold text-white"
        >
          Open review boards
        </Link>
      </div>
    </main>
  );
}
