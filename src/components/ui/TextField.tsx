import { useId, type ReactElement, type ReactNode } from "react";
import { ERROR_TEXT_CLASS, HELPER_CLASS, INPUT_CLASS, INPUT_ERROR_CLASS, LABEL_CLASS, MONO_CLASS } from "@/contents/form";
import { cn } from "@/lib/cn";

interface TextFieldFace {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** 입력란 아래 쉬운 설명. 오류가 있으면 그 자리에 오류를 보여 준다 */
  helper?: string;
  error?: string | null;
  /** 경로·명령·포트·env 처럼 글자 그대로 봐야 하는 값 */
  mono?: boolean;
  placeholder?: string;
  inputMode?: "numeric" | "text";
  maxLength?: number;
  /** 입력란 오른쪽에 붙는 버튼 */
  action?: ReactNode;
  className?: string;
  /** 입력란 너비 등 덮어쓰기, 예: 포트 "w-28" */
  inputClassName?: string;
}

// 경로·명령은 맞춤법 검사·자동 고침이 값을 망가뜨리므로 모두 끈다
const TextField = ({
  label,
  value,
  onChange,
  helper,
  error,
  mono = false,
  placeholder,
  inputMode,
  maxLength,
  action,
  className,
  inputClassName,
}: TextFieldFace): ReactElement => {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error || helper;

  return (
    <div className={className}>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          maxLength={maxLength}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          aria-invalid={Boolean(error)}
          aria-describedby={message ? messageId : undefined}
          className={cn(INPUT_CLASS, mono && MONO_CLASS, error && INPUT_ERROR_CLASS, inputClassName)}
        />
        {action}
      </div>
      {message && (
        <p id={messageId} className={error ? ERROR_TEXT_CLASS : HELPER_CLASS}>
          {message}
        </p>
      )}
    </div>
  );
};

export default TextField;
