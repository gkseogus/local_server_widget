import { useId, useState, type ReactElement } from "react";
import EnvKeyChips from "@/components/settings/EnvKeyChips";
import {
  CHECKBOX_CLASS,
  ERROR_TEXT_CLASS,
  HELPER_CLASS,
  INPUT_CLASS,
  INPUT_ERROR_CLASS,
  LABEL_CLASS,
  MONO_CLASS,
  PANEL_CLASS,
  SECTION_TITLE_CLASS,
  SELECT_CLASS,
} from "@/contents/form";
import {
  API_PATH_PATTERN,
  CONNECTION_TEXT,
  DEFAULT_CORS_KEY,
  ENV_KEY_PATTERN,
  VALIDATION_TEXT,
} from "@/contents/settings";
import { cn } from "@/lib/cn";
import {
  apiRef,
  readApiConnection,
  readCorsConnection,
  removeEnvVars,
  renameEnvVar,
  setEnvVar,
  visibleConnections,
  writeApiConnection,
  writeCorsConnection,
} from "@/lib/connection";
import type { ProjectInfoFace } from "@/types/config";
import type { DraftServiceFace, EnvRowFace } from "@/types/settings";

interface ConnectionSectionFace {
  env: EnvRowFace[];
  /** 같은 프로젝트의 다른 서버 (이름이 있는 것만) */
  siblings: DraftServiceFace[];
  /** 폴더에서 감지한 변수 이름 제안. 아직 없으면 null */
  detected: ProjectInfoFace | null;
  onChangeEnv: (env: EnvRowFace[]) => void;
}

// 연결 상태는 env 에서 매번 역으로 읽는다(고급 env 편집과 어긋나지 않게).
// 아직 env 에 쓰지 않은 것(백엔드를 고르기 전 변수 칩, CORS 변수 이름)만 이 컴포넌트가 들고 있다.
const ConnectionSection = ({ env, siblings, detected, onChangeEnv }: ConnectionSectionFace): ReactElement => {
  const id = useId();
  const names = siblings.map((sibling) => sibling.name);
  const api = readApiConnection(env, names);
  const cors = readCorsConnection(env, names);
  const visible = visibleConnections(detected?.kind ?? null, api, cors);

  const [pendingApiKeys, setPendingApiKeys] = useState<string[] | null>(null);
  const [pendingCorsKey, setPendingCorsKey] = useState<string | null>(null);
  const [corsKeyText, setCorsKeyText] = useState<string | null>(null);
  const [pendingPath, setPendingPath] = useState("");
  const [pathText, setPathText] = useState<string | null>(null);

  const apiKeys = api.backend ? api.keys : (pendingApiKeys ?? detected?.apiEnvKeys ?? []);
  const corsKey = cors.key ?? pendingCorsKey ?? detected?.corsEnvKeys[0] ?? DEFAULT_CORS_KEY;
  const corsKeyInvalid = corsKeyText !== null && !ENV_KEY_PATTERN.test(corsKeyText);
  // 백엔드를 고르기 전이나 "연결 안 함" 으로 바꾼 뒤에도 쓰던 경로는 기억한다
  const apiPath = api.backend ? api.path : pendingPath;
  const pathInvalid = pathText !== null && !API_PATH_PATTERN.test(pathText);

  const handleBackend = (value: string): void => {
    const backend = value || null;
    // "연결 안 함" 으로 바꿔도 칩은 남겨 두어 다시 고르기 쉽게 한다
    setPendingApiKeys(apiKeys);
    setPendingPath(apiPath);
    onChangeEnv(writeApiConnection(env, api, backend, apiKeys, apiPath));
  };

  const handleAddKey = (key: string): void => {
    setPendingApiKeys([...apiKeys, key]);
    if (api.backend) onChangeEnv(setEnvVar(env, key, apiRef(api.backend, apiPath)));
  };

  const handleRemoveKey = (key: string): void => {
    setPendingApiKeys(apiKeys.filter((k) => k !== key));
    if (api.backend) onChangeEnv(removeEnvVars(env, [key]));
  };

  const handleToggleFrontend = (name: string): void => {
    const checked = cors.frontends.includes(name);
    const next = names.filter((n) => (n === name ? !checked : cors.frontends.includes(n)));
    // 모두 해제해 env 에서 지워져도 쓰던 변수 이름은 기억한다
    setPendingCorsKey(corsKey);
    onChangeEnv(writeCorsConnection(env, corsKey, next));
  };

  // 경로도 입력을 마칠 때 반영한다(한 글자마다 env 값이 바뀌지 않게)
  const commitPath = (): void => {
    if (pathText === null || pathInvalid) return;
    if (api.backend && pathText !== api.path) {
      onChangeEnv(writeApiConnection(env, api, api.backend, api.keys, pathText));
    }
    setPendingPath(pathText);
    setPathText(null);
  };

  // 입력하는 도중의 이름으로 env 키가 바뀌지 않도록 입력을 마칠 때(포커스 이동·Enter) 반영한다
  const commitCorsKey = (): void => {
    if (corsKeyText === null || corsKeyInvalid) return;
    if (cors.key && corsKeyText !== cors.key) onChangeEnv(renameEnvVar(env, cors.key, corsKeyText));
    setPendingCorsKey(corsKeyText);
    setCorsKeyText(null);
  };

  const portOf = (name: string): string => `:${siblings.find((s) => s.name === name)?.port ?? "—"}`;

  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={SECTION_TITLE_CLASS}>
        {CONNECTION_TEXT.title}
      </h2>
      <div className={PANEL_CLASS}>
        {siblings.length === 0 ? (
          <p className="text-xs leading-5 text-zinc-500">{CONNECTION_TEXT.noSiblings}</p>
        ) : (
          <>
            {visible.api && (
              <div className="space-y-3">
                <div>
                  <label htmlFor={`${id}-api`} className={LABEL_CLASS}>
                    {CONNECTION_TEXT.apiLabel}
                  </label>
                  <select
                    id={`${id}-api`}
                    value={api.backend ?? ""}
                    onChange={(event) => handleBackend(event.target.value)}
                    disabled={apiKeys.length === 0}
                    aria-describedby={`${id}-api-help`}
                    className={cn(SELECT_CLASS, "w-64")}
                  >
                    <option value="">{CONNECTION_TEXT.apiNone}</option>
                    {names.map((name) => (
                      <option key={name} value={name}>
                        {`${name}  ${portOf(name)}`}
                      </option>
                    ))}
                  </select>
                  <p id={`${id}-api-help`} className={HELPER_CLASS}>
                    {apiKeys.length > 0 ? CONNECTION_TEXT.apiHelper : CONNECTION_TEXT.apiNeedKey}
                  </p>
                </div>
                <div>
                  <label htmlFor={`${id}-api-path`} className={LABEL_CLASS}>
                    {CONNECTION_TEXT.pathLabel}
                  </label>
                  <input
                    id={`${id}-api-path`}
                    type="text"
                    value={pathText ?? apiPath}
                    placeholder={CONNECTION_TEXT.pathPlaceholder}
                    onChange={(event) => setPathText(event.target.value.trim())}
                    onBlur={commitPath}
                    onKeyDown={(event) => event.key === "Enter" && commitPath()}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    aria-invalid={pathInvalid}
                    aria-describedby={`${id}-api-path-help`}
                    className={cn(INPUT_CLASS, MONO_CLASS, "w-40", pathInvalid && INPUT_ERROR_CLASS)}
                  />
                  <p id={`${id}-api-path-help`} className={pathInvalid ? ERROR_TEXT_CLASS : HELPER_CLASS}>
                    {pathInvalid ? CONNECTION_TEXT.pathInvalid : CONNECTION_TEXT.pathHelper}
                  </p>
                </div>
                <EnvKeyChips keys={apiKeys} onAdd={handleAddKey} onRemove={handleRemoveKey} />
              </div>
            )}

            {visible.cors && (
              <div className={cn("space-y-3", visible.api && "pt-4 border-t border-zinc-800")}>
                <fieldset>
                  <legend className={LABEL_CLASS}>{CONNECTION_TEXT.corsLabel}</legend>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {names.map((name) => (
                      <label key={name} className="inline-flex items-center gap-2 text-[13px] text-zinc-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cors.frontends.includes(name)}
                          onChange={() => handleToggleFrontend(name)}
                          className={CHECKBOX_CLASS}
                        />
                        {name}
                        <span className="font-mono text-[11px] text-zinc-500">{portOf(name)}</span>
                      </label>
                    ))}
                  </div>
                  <p className={HELPER_CLASS}>{CONNECTION_TEXT.corsHelper}</p>
                </fieldset>
                <div>
                  <label htmlFor={`${id}-cors-key`} className={LABEL_CLASS}>
                    {CONNECTION_TEXT.corsKeyLabel}
                  </label>
                  <input
                    id={`${id}-cors-key`}
                    type="text"
                    value={corsKeyText ?? corsKey}
                    onChange={(event) => setCorsKeyText(event.target.value.trim())}
                    onBlur={commitCorsKey}
                    onKeyDown={(event) => event.key === "Enter" && commitCorsKey()}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    aria-invalid={corsKeyInvalid}
                    aria-describedby={corsKeyInvalid ? `${id}-cors-error` : undefined}
                    className={cn(INPUT_CLASS, MONO_CLASS, "w-64", corsKeyInvalid && INPUT_ERROR_CLASS)}
                  />
                  {corsKeyInvalid && (
                    <p id={`${id}-cors-error`} className={ERROR_TEXT_CLASS}>
                      {VALIDATION_TEXT.envKeyInvalid}
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default ConnectionSection;
