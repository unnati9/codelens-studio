export function ConfigNotice() {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950 shadow-sm">
      <p className="font-semibold">Connect Supabase to enable saved boards.</p>
      <p className="mt-1 leading-6 text-amber-900">
        Copy <code className="rounded bg-amber-100 px-1">.env.example</code> to{" "}
        <code className="rounded bg-amber-100 px-1">.env.local</code>, add the public project URL
        and anon key, then apply the included migration.
      </p>
    </div>
  );
}
