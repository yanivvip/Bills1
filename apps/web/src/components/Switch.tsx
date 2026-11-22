// An on/off switch as in the design: a 50x30 pill, teal when on, with a white knob.
export default function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-[30px] w-[50px] flex-none rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-[#cfcbc2]'}`}>
      <span className={`absolute top-[3px] h-6 w-6 rounded-full bg-white transition-all ${checked ? 'end-[3px]' : 'start-[3px]'}`} />
    </button>
  );
}
