import Link from "next/link";
import { LandingActions } from "@/components/landing/landing-actions";
import { Brand } from "@/components/ui/brand";
import { ConfigNotice } from "@/components/ui/config-notice";
import { isSupabaseConfigured } from "@/lib/supabase/client";

const principles = [
  [
    "01",
    "Place the evidence",
    "Keep the implementation and rendered interface in one shared view.",
  ],
  [
    "02",
    "Review spatially",
    "Move and size artifacts until the relationship is immediately clear.",
  ],
  ["03", "Return without losing context", "Every layout change is stored with the review board."],
];

export default function HomePage() {
  const configured = isSupabaseConfigured();

  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f2ed]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <Brand />
        <nav className="flex items-center gap-6 text-sm font-semibold text-[#62666f]">
          <Link href="/boards" className="hover:text-[#171a1f]">
            Boards
          </Link>
          <span className="rounded-full border border-[#d8d3c8] bg-white/70 px-3 py-1.5 text-xs">
            Day 1 foundation
          </span>
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-16 pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:pt-20">
        <div className="max-w-3xl">
          <p className="mb-5 text-xs font-black uppercase tracking-[0.24em] text-[#db4527]">
            Review the code you can see
          </p>
          <h1 className="text-balance text-5xl font-black leading-[0.98] tracking-[-0.055em] text-[#15263d] sm:text-6xl lg:text-7xl">
            Put code and pixels on the same page.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[#5a5e66]">
            CodeLens Studio gives review teams a durable spatial canvas for comparing an
            implementation with the interface it produced.
          </p>
          <div className="mt-9">
            <LandingActions />
          </div>
          {!configured && (
            <div className="mt-8 max-w-2xl">
              <ConfigNotice />
            </div>
          )}
        </div>

        <div className="relative min-h-[440px] rounded-[32px] bg-[#15263d] p-5 shadow-[0_30px_80px_rgba(21,38,61,0.22)]">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full border-[38px] border-[#ff5a36]/80" />
          <div className="relative h-full overflow-hidden rounded-[22px] border border-white/10 bg-[#0f1d30] p-4">
            <div className="flex items-center gap-2 border-b border-white/10 pb-4">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5a36]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#ffd166]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#70d6a1]" />
              <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-white/40">
                Review canvas
              </span>
            </div>
            <div className="mt-5 grid h-[340px] grid-cols-[1.12fr_0.88fr] gap-4">
              <div className="rotate-[-1.5deg] rounded-xl border border-white/10 bg-[#192b43] p-4 shadow-2xl">
                <p className="text-xs font-bold text-white">checkout-button.tsx</p>
                <div className="mt-4 space-y-2 font-mono text-[11px] text-[#acc3de]">
                  <p>
                    <span className="text-[#ff7a5f]">const</span> button = &#123;
                  </p>
                  <p className="pl-4">
                    display: <span className="text-[#ffd166]">&quot;flex&quot;</span>,
                  </p>
                  <p className="rounded bg-[#ff5a36]/15 px-1 pl-4 text-[#ff957e]">marginTop: 16,</p>
                  <p>&#125;;</p>
                </div>
              </div>
              <div className="translate-y-8 rotate-[2deg] rounded-xl bg-[#fffdf8] p-4 shadow-2xl">
                <div className="h-20 rounded-lg bg-[#ece9e1]" />
                <div className="mt-4 h-3 w-2/3 rounded bg-[#d9d5ca]" />
                <div className="mt-2 h-3 w-1/2 rounded bg-[#e5e1d8]" />
                <div className="mt-12 ml-auto h-10 w-28 translate-y-3 rounded-lg bg-[#ff5a36]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#dcd8cf] bg-[#ebe8e1]">
        <div className="mx-auto grid max-w-7xl gap-px bg-[#d6d2c9] md:grid-cols-3">
          {principles.map(([number, title, description]) => (
            <article key={number} className="bg-[#ebe8e1] p-8 lg:p-10">
              <span className="text-xs font-black text-[#ff5a36]">{number}</span>
              <h2 className="mt-8 text-xl font-bold tracking-tight text-[#15263d]">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-[#62666f]">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
