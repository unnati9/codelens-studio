type CreationToolbarProps = {
  onAddCode: () => void;
  onAddImage: () => void;
  onToggleAnnotations: () => void;
  annotationMode: boolean;
  disabled?: boolean;
};

export function CreationToolbar({
  onAddCode,
  onAddImage,
  onToggleAnnotations,
  annotationMode,
  disabled,
}: CreationToolbarProps) {
  return (
    <aside className="flex w-[88px] shrink-0 flex-col items-center gap-3 border-r border-[#dedbd2] bg-[#fffdf8] px-3 py-5">
      <span className="mb-1 text-[10px] font-black uppercase tracking-widest text-[#96989c]">
        Create
      </span>
      <button
        type="button"
        data-testid="add-code-node"
        onClick={onAddCode}
        disabled={disabled}
        className="group grid w-full place-items-center gap-1 rounded-xl border border-[#dedbd2] bg-white px-2 py-3 text-[#253348] shadow-sm transition hover:-translate-y-0.5 hover:border-[#ff5a36] disabled:opacity-50"
      >
        <span className="font-mono text-lg font-black text-[#ff5a36]">&lt;/&gt;</span>
        <span className="text-[10px] font-bold">Code</span>
      </button>
      <button
        type="button"
        data-testid="add-image-node"
        onClick={onAddImage}
        disabled={disabled}
        className="group grid w-full place-items-center gap-1 rounded-xl border border-[#dedbd2] bg-white px-2 py-3 text-[#253348] shadow-sm transition hover:-translate-y-0.5 hover:border-[#ff5a36] disabled:opacity-50"
      >
        <span className="grid h-6 w-8 place-items-center rounded border-2 border-[#15263d] text-[8px] font-black">
          IMG
        </span>
        <span className="text-[10px] font-bold">Image</span>
      </button>
      <button
        type="button"
        data-testid="toggle-annotation-mode"
        aria-pressed={annotationMode}
        onClick={onToggleAnnotations}
        disabled={disabled}
        className={`grid w-full place-items-center gap-1 rounded-xl border px-2 py-3 shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50 ${
          annotationMode
            ? "border-[#ff5a36] bg-[#ffebe5] text-[#c9361c]"
            : "border-[#dedbd2] bg-white text-[#253348] hover:border-[#ff5a36]"
        }`}
      >
        <span className="text-xl font-black leading-none">✎</span>
        <span className="text-[10px] font-bold">Trace</span>
      </button>
      <div className="mt-auto text-center text-[9px] leading-4 text-[#9a9ca0]">
        {annotationMode ? (
          <>
            Drawing mode
            <br />
            nodes locked
          </>
        ) : (
          <>
            Drag header
            <br />
            to move
          </>
        )}
      </div>
    </aside>
  );
}
