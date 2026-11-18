import { cn } from "@/lib/cn";

interface ToggleSwitchFace {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** 접근성 이름, 예: "acme/backend". 켜짐 여부는 aria-checked 가 알린다. */
  label: string;
  disabled?: boolean;
}

const ToggleSwitch = ({ checked, onChange, label, disabled = false }: ToggleSwitchFace) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative inline-flex shrink-0 items-center h-5 w-9 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40",
      checked ? "bg-emerald-500" : "bg-zinc-600",
    )}
  >
    <span
      className={cn(
        "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
        checked ? "translate-x-4.5" : "translate-x-0.5",
      )}
    />
  </button>
);

export default ToggleSwitch;
