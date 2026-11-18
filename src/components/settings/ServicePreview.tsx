import { useId, type ReactElement } from "react";
import { SECTION_TITLE_CLASS } from "@/contents/form";
import { PREVIEW_TEXT } from "@/contents/settings";
import { resolveTemplate } from "@/lib/template";
import type { DraftServiceFace } from "@/types/settings";

interface ServicePreviewFace {
  service: DraftServiceFace;
  /** 같은 그룹 서비스 이름 → 포트 (자기 자신 포함, Rust 와 같다) */
  groupPorts: Record<string, number | null>;
}

// 템플릿을 실제 값으로 바꿔 "켜면 이렇게 실행된다" 를 보여 준다. 못 바꾼 토큰은 그대로 남아 눈에 띈다.
const ServicePreview = ({ service, groupPorts }: ServicePreviewFace): ReactElement => {
  const id = useId();
  const resolve = (text: string): string => resolveTemplate(text, service.port, groupPorts);
  const rows: [string, ReactElement | string][] = [
    [PREVIEW_TEXT.folder, service.cwd || PREVIEW_TEXT.empty],
    [PREVIEW_TEXT.command, resolve(service.command) || PREVIEW_TEXT.empty],
    [
      PREVIEW_TEXT.env,
      service.env.length > 0 ? (
        <>
          {service.env.map((row, index) => (
            <span key={index} className="block">{`${row.key}=${resolve(row.value)}`}</span>
          ))}
        </>
      ) : (
        PREVIEW_TEXT.empty
      ),
    ],
  ];

  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={SECTION_TITLE_CLASS}>
        {PREVIEW_TEXT.title}
      </h2>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 p-4 bg-black/40 border border-zinc-800 rounded-xl font-mono text-[11.5px] leading-5">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="text-zinc-200 break-all select-text">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

export default ServicePreview;
