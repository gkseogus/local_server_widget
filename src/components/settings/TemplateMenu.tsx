import type { ReactElement } from "react";
import { SELECT_CLASS } from "@/contents/form";
import { ENV_TEXT } from "@/contents/settings";
import { cn } from "@/lib/cn";
import type { TemplateOptionFace } from "@/types/settings";

interface TemplateMenuFace {
  /** 접근성 이름, 예: "템플릿 넣기 1" */
  label: string;
  options: TemplateOptionFace[];
  onInsert: (template: string) => void;
}

// 네이티브 select 를 메뉴로 쓴다: 고르면 넣고 곧바로 "템플릿" 으로 돌아온다
const TemplateMenu = ({ label, options, onInsert }: TemplateMenuFace): ReactElement => (
  <select
    aria-label={label}
    value=""
    onChange={(event) => event.target.value && onInsert(event.target.value)}
    className={cn(SELECT_CLASS, "w-[4.75rem] px-2 text-[11px] text-zinc-400")}
  >
    <option value="" disabled>
      {ENV_TEXT.templatePlaceholder}
    </option>
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

export default TemplateMenu;
