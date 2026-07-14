export function GuestServiceErrorState({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div className="rounded-[24px] border border-[#ba1a1a]/20 bg-[#fff7f5] px-6 py-10 text-center shadow-[0_12px_36px_rgba(127,29,29,0.07)]" role="alert">
      <p className="text-sm font-semibold leading-6 text-[#93000a]">{message}</p>
      <button type="button" onClick={onRetry} className="vs-touch-button mt-5 min-h-11 rounded-full bg-[#93000a] px-5 text-sm font-bold text-white transition-colors duration-200 hover:bg-[#761008] active:bg-[#5c0c06]">{retryLabel}</button>
    </div>
  );
}
