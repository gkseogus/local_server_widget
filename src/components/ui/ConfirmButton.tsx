import { useState, type ReactElement } from "react";
import { BUTTON_CLASS, CONFIRM_TEXT, DANGER_BUTTON_CLASS, DANGER_SOLID_BUTTON_CLASS } from "@/contents/form";

interface ConfirmButtonFace {
  /** 첫 버튼 문구, 예: "서버 삭제" */
  label: string;
  /** 확인 단계 질문, 예: "이 서버를 지울까요?" */
  prompt: string;
  /** 확인 단계의 실행 버튼 문구. 기본 "삭제" */
  confirmLabel?: string;
  onConfirm: () => void;
}

// window.confirm 은 Tauri dialog 플러그인이 Promise 를 돌려주는 함수로 바꿔 끼우므로 쓰지 않고, 화면 안에서 두 번 묻는다.
const ConfirmButton = ({ label, prompt, confirmLabel = CONFIRM_TEXT.confirm, onConfirm }: ConfirmButtonFace): ReactElement => {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={DANGER_BUTTON_CLASS}>
        {label}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={prompt}
      onKeyDown={(event) => event.key === "Escape" && setConfirming(false)}
      className="flex items-center gap-2"
    >
      <span className="text-xs text-rose-300">{prompt}</span>
      <button type="button" onClick={onConfirm} className={DANGER_SOLID_BUTTON_CLASS}>
        {confirmLabel}
      </button>
      {/* 실수로 Enter 를 눌러도 지워지지 않도록 취소에 포커스 */}
      <button type="button" autoFocus onClick={() => setConfirming(false)} className={BUTTON_CLASS}>
        {CONFIRM_TEXT.cancel}
      </button>
    </div>
  );
};

export default ConfirmButton;
