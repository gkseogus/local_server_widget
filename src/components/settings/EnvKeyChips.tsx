import { useId, useState, type ReactElement } from "react";
import { BUTTON_CLASS, ERROR_TEXT_CLASS, INPUT_CLASS, INPUT_ERROR_CLASS, LABEL_CLASS, MONO_CLASS } from "@/contents/form";
import { CONNECTION_TEXT, ENV_KEY_PATTERN, VALIDATION_TEXT } from "@/contents/settings";
import { cn } from "@/lib/cn";

interface EnvKeyChipsFace {
  keys: string[];
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
}

/** 백엔드 주소를 넣을 변수 이름 칩 + 직접 입력 */
const EnvKeyChips = ({ keys, onAdd, onRemove }: EnvKeyChipsFace): ReactElement => {
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = (): void => {
    const key = text.trim();
    if (!key) return;
    if (!ENV_KEY_PATTERN.test(key)) return setError(VALIDATION_TEXT.envKeyInvalid);
    if (keys.includes(key)) return setError(VALIDATION_TEXT.envKeyDuplicate);
    onAdd(key);
    setText("");
    setError(null);
  };

  return (
    <div role="group" aria-labelledby={`${id}-label`}>
      <p id={`${id}-label`} className={LABEL_CLASS}>
        {CONNECTION_TEXT.apiKeysLabel}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {keys.map((key) => (
          <span
            key={key}
            className="inline-flex items-center h-7 gap-1 pl-2 pr-1 bg-emerald-500/10 border border-emerald-500/25 rounded-md font-mono text-[11px] text-emerald-100"
          >
            {key}
            <button
              type="button"
              aria-label={`${key} ${CONNECTION_TEXT.removeKeySuffix}`}
              onClick={() => onRemove(key)}
              className="inline-flex items-center justify-center size-5 rounded text-emerald-300/70 hover:bg-emerald-500/20 hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            >
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              handleAdd();
            }}
            aria-label={CONNECTION_TEXT.apiKeyInput}
            aria-invalid={error !== null}
            aria-describedby={error ? `${id}-error` : undefined}
            placeholder={CONNECTION_TEXT.apiKeyPlaceholder}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            className={cn(INPUT_CLASS, MONO_CLASS, "h-7 w-44 text-[11px]", error && INPUT_ERROR_CLASS)}
          />
          <button type="button" onClick={handleAdd} disabled={!text.trim()} className={cn(BUTTON_CLASS, "h-7 px-2.5")}>
            {CONNECTION_TEXT.addKey}
          </button>
        </div>
      </div>
      {error && (
        <p id={`${id}-error`} className={ERROR_TEXT_CLASS}>
          {error}
        </p>
      )}
    </div>
  );
};

export default EnvKeyChips;
