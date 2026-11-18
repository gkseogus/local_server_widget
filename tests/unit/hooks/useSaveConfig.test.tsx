import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useConfig } from "@/hooks/useConfig";
import { useSaveConfig } from "@/hooks/useSaveConfig";
import { useServices } from "@/hooks/useServices";
import type { ConfigFace } from "@/types/config";
import {
  makeConfigSnapshot,
  makeAcmeConfig,
  makeSnapshot,
  mockCommands,
  renderWithClient,
  type IpcCallFace,
} from "@tests/helpers/fixtures";

const NEXT: ConfigFace = { groups: [] };

const Probe = (): ReactElement => {
  const config = useConfig();
  useServices();
  const save = useSaveConfig();
  return (
    <>
      <p>groups:{config.data?.config.groups.length ?? "loading"}</p>
      <p>revision:{config.data?.revision}</p>
      {save.isError && <p role="alert">{save.error}</p>}
      <button type="button" onClick={() => save.mutate({ config: NEXT, revision: "rev-1" })}>
        save
      </button>
    </>
  );
};

const count = (calls: IpcCallFace[], cmd: string): number => calls.filter((call) => call.cmd === cmd).length;

describe("useSaveConfig", () => {
  it("revision 과 함께 저장하고, 돌려받은 revision 을 캐시에 넣은 뒤 설정과 서버 상태를 모두 다시 읽는다", async () => {
    let stored = makeConfigSnapshot();
    const calls = mockCommands({
      get_config: () => stored,
      get_services: () => makeSnapshot([]),
      save_config: (args) => {
        stored = makeConfigSnapshot(args.config as ConfigFace, "rev-2");
        return stored.revision;
      },
    });
    renderWithClient(<Probe />);
    expect(await screen.findByText("groups:1")).toBeInTheDocument();
    expect(screen.getByText("revision:rev-1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "save" }));

    expect(await screen.findByText("groups:0")).toBeInTheDocument();
    expect(screen.getByText("revision:rev-2")).toBeInTheDocument();
    expect(calls).toContainEqual({ cmd: "save_config", args: { config: NEXT, revision: "rev-1" } });
    await waitFor(() => expect(count(calls, "get_config")).toBe(2));
    await waitFor(() => expect(count(calls, "get_services")).toBe(2));
  });

  it("Rust 오류 문자열을 그대로 error 로 노출하고 다시 읽지 않는다", async () => {
    const calls = mockCommands({
      get_config: () => makeConfigSnapshot(makeAcmeConfig()),
      get_services: () => makeSnapshot([]),
      save_config: () => {
        throw "acme/backend: 포트 중복";
      },
    });
    renderWithClient(<Probe />);
    expect(await screen.findByText("groups:1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("acme/backend: 포트 중복");
    expect(count(calls, "get_config")).toBe(1);
  });
});
