import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsApp from "@/SettingsApp";
import { LOADING_LABEL } from "@/contents/app";
import { CONFIRM_TEXT } from "@/contents/form";
import { EMPTY_TEXT, GROUP_TEXT, LOAD_TEXT, SAVE_TEXT, SERVICE_TEXT, SIDEBAR_TEXT } from "@/contents/settings";
import type { ConfigFace, ConfigSnapshotFace } from "@/types/config";
import {
  makeConfigSnapshot,
  makeAcmeConfig,
  makeProjectInfo,
  makeSnapshot,
  mockCommands,
  renderWithClient,
  type IpcCallFace,
} from "@tests/helpers/fixtures";

const callsOf = (calls: IpcCallFace[], cmd: string): IpcCallFace[] => calls.filter((call) => call.cmd === cmd);

const sidebar = (): HTMLElement => screen.getByRole("navigation", { name: SIDEBAR_TEXT.label });

const saveButton = (): HTMLElement => screen.getByRole("button", { name: SAVE_TEXT.save });

/** Rust 가 디스크의 파일이 편집을 시작한 뒤 바뀌었다며 저장을 거부할 때의 한 줄 */
const STALE_LINE = "설정 파일이 밖에서 바뀌었어요. 다시 불러온 뒤 고쳐 주세요.";

const setPort = async (value: string): Promise<void> => {
  const port = screen.getByLabelText(SERVICE_TEXT.portLabel);
  await userEvent.clear(port);
  await userEvent.type(port, value);
};

/**
 * acme 설정으로 열고 첫 서버(backend) 편집 화면이 뜰 때까지 기다린다.
 * file 은 디스크의 services.json 흉내다. Rust 처럼 save_config 는 revision 이 지금 파일과 같을 때만 쓰고 새 revision 을 돌려준다.
 * 테스트가 file 의 필드를 바꾸면 "밖에서 파일을 고친 것" 이 된다.
 */
const openAcme = async (
  handlers: Record<string, (args: Record<string, unknown>) => unknown> = {},
): Promise<{ calls: IpcCallFace[]; file: ConfigSnapshotFace }> => {
  const file = makeConfigSnapshot();
  let saves = 0;
  const calls = mockCommands({
    get_config: () => ({ ...file }),
    get_services: () => makeSnapshot([]),
    ...handlers,
    save_config: (args: Record<string, unknown>) => {
      handlers.save_config?.(args);
      if (args.revision !== file.revision) throw STALE_LINE;
      saves += 1;
      file.config = args.config as ConfigFace;
      file.revision = `saved-${saves}`;
      return file.revision;
    },
  });
  renderWithClient(<SettingsApp />);
  expect(await screen.findByRole("heading", { level: 1, name: "backend" })).toBeInTheDocument();
  return { calls, file };
};

/** 밖에서 backend 포트를 9000 으로 고친 파일 */
const editFileOutside = (file: ConfigSnapshotFace): void => {
  const config = makeAcmeConfig();
  config.groups[0].services[0].port = 9000;
  file.config = config;
  file.revision = "outside-1";
};

describe("SettingsApp — 불러오기", () => {
  it("설정을 받기 전에는 같은 자리를 잡은 스켈레톤을 보여 준다", () => {
    mockCommands({ get_config: () => new Promise<never>(() => {}) });
    renderWithClient(<SettingsApp />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent(LOADING_LABEL);
  });

  it("파일이 깨졌으면 쉬운 안내·원문과 함께 JSON 직접 편집·다시 시도를 준다", async () => {
    let config: ConfigFace | null = null;
    const calls = mockCommands({
      get_config: () => {
        if (config === null) throw "services.json 12행 5열: 쉼표가 빠졌습니다";
        return makeConfigSnapshot(config);
      },
    });
    renderWithClient(<SettingsApp />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(LOAD_TEXT.title);
    expect(within(alert).getByText("services.json 12행 5열: 쉼표가 빠졌습니다")).toBeInTheDocument();

    await userEvent.click(within(alert).getByRole("button", { name: LOAD_TEXT.openJson }));
    await waitFor(() => expect(callsOf(calls, "open_config")).toHaveLength(1));

    config = makeAcmeConfig();
    await userEvent.click(within(alert).getByRole("button", { name: LOAD_TEXT.retry }));
    expect(await screen.findByRole("heading", { level: 1, name: "backend" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("목록을 사이드바에 보여 주고 첫 서버를 연다", async () => {
    await openAcme();

    const nav = sidebar();
    expect(within(nav).getByRole("button", { name: "acme" })).toBeInTheDocument();
    for (const name of ["backend", "frontend", "admin"]) {
      expect(within(nav).getByRole("button", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    expect(within(nav).getByRole("button", { name: /^backend/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByText(SAVE_TEXT.saved)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });
});

describe("SettingsApp — 빈 상태", () => {
  it("폴더를 고르면 감지값으로 프로젝트와 서버를 만들고 그 서버 편집으로 간다", async () => {
    const calls = mockCommands({
      get_config: () => makeConfigSnapshot({ groups: [] }),
      pick_folder: () => "~/Desktop/shop_backend",
      detect_project: () => makeProjectInfo({ suggestedGroup: "shop" }),
    });
    renderWithClient(<SettingsApp />);

    await userEvent.click(await screen.findByRole("button", { name: EMPTY_TEXT.pick }));

    expect(await screen.findByRole("heading", { level: 1, name: "backend" })).toBeInTheDocument();
    expect(screen.getByLabelText(SERVICE_TEXT.folderLabel)).toHaveValue("~/Desktop/shop_backend");
    expect(screen.getByLabelText(SERVICE_TEXT.portLabel)).toHaveValue("8000");
    expect(within(sidebar()).getByRole("button", { name: "shop" })).toBeInTheDocument();
    expect(screen.getByText(`${SAVE_TEXT.dirtyPrefix} 1${SAVE_TEXT.dirtySuffix}`)).toBeInTheDocument();
    expect(callsOf(calls, "detect_project")[0].args).toEqual({ cwd: "~/Desktop/shop_backend" });
  });

  it("폴더 선택을 취소하면 빈 상태 그대로다", async () => {
    const calls = mockCommands({ get_config: () => makeConfigSnapshot({ groups: [] }), pick_folder: () => null });
    renderWithClient(<SettingsApp />);

    await userEvent.click(await screen.findByRole("button", { name: EMPTY_TEXT.pick }));

    await waitFor(() => expect(callsOf(calls, "pick_folder")).toHaveLength(1));
    expect(screen.getByRole("heading", { name: EMPTY_TEXT.title })).toBeInTheDocument();
    expect(callsOf(calls, "detect_project")).toHaveLength(0);
    expect(screen.getByText(SAVE_TEXT.saved)).toBeInTheDocument();
  });

  it("폴더 선택 창을 못 띄우면 알린다", async () => {
    mockCommands({
      get_config: () => makeConfigSnapshot({ groups: [] }),
      pick_folder: () => {
        throw "";
      },
    });
    renderWithClient(<SettingsApp />);

    await userEvent.click(await screen.findByRole("button", { name: EMPTY_TEXT.pick }));

    expect(await screen.findByRole("alert")).toHaveTextContent("폴더를 고르지 못했어요.");
  });
});

describe("SettingsApp — 저장", () => {
  it("저장하면 save_config 에 편집한 설정 전체와 불러온 revision 을 보내고, 토스트를 띄운 뒤 '저장됨' 으로 돌아온다", async () => {
    const { calls } = await openAcme();

    await setPort("8010");
    expect(screen.getByText(`${SAVE_TEXT.dirtyPrefix} 1${SAVE_TEXT.dirtySuffix}`)).toBeInTheDocument();

    await userEvent.click(saveButton());

    const expected = makeAcmeConfig();
    expected.groups[0].services[0].port = 8010;
    await waitFor(() =>
      expect(callsOf(calls, "save_config")).toEqual([{ cmd: "save_config", args: { config: expected, revision: "rev-1" } }]),
    );
    expect(await screen.findByText(SAVE_TEXT.toast)).toBeInTheDocument();
    expect(screen.getByText(SAVE_TEXT.saved)).toBeInTheDocument();
    expect(screen.getByLabelText(SERVICE_TEXT.portLabel)).toHaveValue("8010");
    // 설정과 위젯 목록(서버 상태)을 다시 읽는다
    await waitFor(() => expect(callsOf(calls, "get_config").length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(callsOf(calls, "get_services").length).toBeGreaterThanOrEqual(2));
  });

  it("다음 저장에는 앞 저장이 돌려준 revision 을 보낸다", async () => {
    const { calls } = await openAcme();
    await setPort("8010");
    await userEvent.click(saveButton());
    expect(await screen.findByText(SAVE_TEXT.toast)).toBeInTheDocument();

    await setPort("8011");
    await userEvent.click(saveButton());

    await waitFor(() => expect(callsOf(calls, "save_config").map((call) => call.args.revision)).toEqual(["rev-1", "saved-1"]));
    expect(await screen.findByText(SAVE_TEXT.saved)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("편집하는 동안 파일을 다시 읽어도 편집을 시작한 revision 을 보내, 밖에서 고친 파일을 덮지 않는다", async () => {
    const { calls, file } = await openAcme();
    await setPort("8010");

    // 밖에서 파일을 고친 뒤 창이 다시 보이면 설정을 다시 읽는다 (편집 화면은 그대로)
    editFileOutside(file);
    window.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(callsOf(calls, "get_config")).toHaveLength(2));
    expect(screen.getByLabelText(SERVICE_TEXT.portLabel)).toHaveValue("8010");

    await userEvent.click(saveButton());

    const alert = await screen.findByRole("alert");
    expect(callsOf(calls, "save_config").map((call) => call.args.revision)).toEqual(["rev-1"]);
    expect(within(alert).getAllByRole("listitem").map((item) => item.textContent)).toEqual([STALE_LINE]);
    expect(within(alert).getByRole("button", { name: SAVE_TEXT.reload })).toBeInTheDocument();
    expect(file.config.groups[0].services[0].port).toBe(9000);
  });

  it("저장이 실패하면 확인을 거친 뒤에만 파일에서 다시 불러오고, 편집을 버린 채 새 revision 으로 저장한다", async () => {
    const { calls, file } = await openAcme();
    editFileOutside(file);
    await setPort("8010");
    await userEvent.click(saveButton());
    const alert = await screen.findByRole("alert");

    // 첫 클릭은 묻기만 한다
    await userEvent.click(within(alert).getByRole("button", { name: SAVE_TEXT.reload }));
    expect(within(alert).getByRole("group", { name: SAVE_TEXT.reloadPrompt })).toBeInTheDocument();
    expect(callsOf(calls, "get_config")).toHaveLength(1);
    expect(screen.getByLabelText(SERVICE_TEXT.portLabel)).toHaveValue("8010");

    await userEvent.click(within(alert).getByRole("button", { name: SAVE_TEXT.reloadConfirm }));

    expect(await screen.findByDisplayValue("9000")).toBe(screen.getByLabelText(SERVICE_TEXT.portLabel));
    expect(callsOf(calls, "get_config")).toHaveLength(2);
    expect(screen.getByText(SAVE_TEXT.saved)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await setPort("9001");
    await userEvent.click(saveButton());
    expect(await screen.findByText(SAVE_TEXT.toast)).toBeInTheDocument();
    expect(callsOf(calls, "save_config").map((call) => call.args.revision)).toEqual(["rev-1", "outside-1"]);
    expect(file.config.groups[0].services[0].port).toBe(9001);
  });

  it("다시 불러올 때 파일을 읽지 못하면 불러오기 오류 화면으로 간다", async () => {
    let broken = false;
    await openAcme({
      get_config: () => {
        if (broken) throw "services.json 3행 1열: 쉼표가 빠졌습니다";
        return makeConfigSnapshot();
      },
      save_config: () => {
        throw "acme/backend: 폴더가 없습니다";
      },
    });
    await setPort("8010");
    await userEvent.click(saveButton());
    const alert = await screen.findByRole("alert");

    broken = true;
    await userEvent.click(within(alert).getByRole("button", { name: SAVE_TEXT.reload }));
    await userEvent.click(within(alert).getByRole("button", { name: SAVE_TEXT.reloadConfirm }));

    const loadError = await screen.findByRole("alert");
    expect(loadError).toHaveTextContent(LOAD_TEXT.title);
    expect(loadError).toHaveTextContent("services.json 3행 1열: 쉼표가 빠졌습니다");
    expect(within(loadError).getByRole("button", { name: LOAD_TEXT.retry })).toBeInTheDocument();
  });

  it("⌘S 로도 저장한다", async () => {
    const { calls } = await openAcme();
    await userEvent.clear(screen.getByLabelText(SERVICE_TEXT.portLabel));
    await userEvent.type(screen.getByLabelText(SERVICE_TEXT.portLabel), "8010");

    await userEvent.keyboard("{Meta>}s{/Meta}");

    await waitFor(() => expect(callsOf(calls, "save_config")).toHaveLength(1));
  });

  it("Rust 가 거부하면 문제를 줄마다 보여 주고 편집 내용은 남긴다", async () => {
    const lines = ["acme/backend: 폴더 ~/Desktop/nope 가 없습니다", "acme/frontend: 알 수 없는 템플릿 {api.url}"];
    await openAcme({
      save_config: () => {
        throw lines.join("\n");
      },
    });
    const folder = screen.getByLabelText(SERVICE_TEXT.folderLabel);
    await userEvent.clear(folder);
    await userEvent.type(folder, "~/Desktop/nope");

    await userEvent.click(saveButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(SAVE_TEXT.errorTitle);
    expect(within(alert).getAllByRole("listitem").map((item) => item.textContent)).toEqual(lines);
    // 오류 내용과 상관없이 다시 불러오기를 준다
    expect(within(alert).getByRole("button", { name: SAVE_TEXT.reload })).toBeInTheDocument();
    expect(folder).toHaveValue("~/Desktop/nope");
    expect(screen.getByText(`${SAVE_TEXT.dirtyPrefix} 1${SAVE_TEXT.dirtySuffix}`)).toBeInTheDocument();
  });

  it("포트가 겹치면 그 자리에 오류를 보이고 저장을 막으며, 오류 개수를 누르면 해당 서버로 간다", async () => {
    const { calls } = await openAcme();
    await userEvent.click(within(sidebar()).getByRole("button", { name: /^frontend/ }));
    const port = screen.getByLabelText(SERVICE_TEXT.portLabel);
    await userEvent.clear(port);
    await userEvent.type(port, "8002");

    expect(port).toHaveAccessibleDescription(/‘acme\/backend’ 서버와 포트가 겹쳐요/);
    expect(saveButton()).toBeDisabled();
    await userEvent.keyboard("{Meta>}s{/Meta}");
    expect(callsOf(calls, "save_config")).toHaveLength(0);

    // 양쪽 서버 모두 오류 → 2개. 다른 곳(프로젝트)에서 누르면 첫 오류 서버(backend)로
    await userEvent.click(within(sidebar()).getByRole("button", { name: "acme" }));
    await userEvent.click(screen.getByRole("button", { name: `${SAVE_TEXT.issuesPrefix} 2${SAVE_TEXT.issuesSuffix}` }));
    expect(screen.getByRole("heading", { level: 1, name: "backend" })).toBeInTheDocument();
    expect(screen.getByLabelText(SERVICE_TEXT.portLabel)).toHaveAccessibleDescription(/‘acme\/frontend’/);
  });

  it("서버 이름을 바꾸면 그 서버를 가리키던 서버에 오류 표시가 붙고 저장이 막힌다", async () => {
    await openAcme();
    await userEvent.type(screen.getByLabelText(SERVICE_TEXT.nameLabel), "2");

    expect(saveButton()).toBeDisabled();
    expect(within(sidebar()).getByRole("button", { name: /^frontend/ })).toHaveAccessibleName(/고칠 곳 있음/);
    expect(within(sidebar()).getByRole("button", { name: /^admin/ })).toHaveAccessibleName(/고칠 곳 있음/);
    expect(within(sidebar()).getByRole("button", { name: /^backend2/ })).not.toHaveAccessibleName(/고칠 곳 있음/);
  });

  it("되돌리기는 저장한 상태로 돌린다", async () => {
    await openAcme();
    await userEvent.type(screen.getByLabelText(SERVICE_TEXT.nameLabel), "_v2");
    expect(screen.getByRole("heading", { level: 1, name: "backend_v2" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: SAVE_TEXT.revert }));

    expect(screen.getByLabelText(SERVICE_TEXT.nameLabel)).toHaveValue("backend");
    expect(screen.getByText(SAVE_TEXT.saved)).toBeInTheDocument();
  });

  it("다른 항목으로 옮겨 다녀도 저장 안 한 변경은 남는다", async () => {
    await openAcme();
    await userEvent.type(screen.getByLabelText(SERVICE_TEXT.nameLabel), "2");
    await userEvent.click(within(sidebar()).getByRole("button", { name: /^admin/ }));
    await userEvent.click(within(sidebar()).getByRole("button", { name: /^backend2/ }));

    expect(screen.getByLabelText(SERVICE_TEXT.nameLabel)).toHaveValue("backend2");
  });
});

describe("SettingsApp — 삭제", () => {
  it("서버 삭제는 한 번 더 확인한 뒤에만 지우고 프로젝트 화면으로 간다", async () => {
    await openAcme();

    await userEvent.click(screen.getByRole("button", { name: SERVICE_TEXT.delete }));
    expect(within(sidebar()).getByRole("button", { name: /^backend/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: CONFIRM_TEXT.confirm }));

    expect(within(sidebar()).queryByRole("button", { name: /^backend/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "acme" })).toBeInTheDocument();
    expect(screen.getByText(`${SAVE_TEXT.dirtyPrefix} 1${SAVE_TEXT.dirtySuffix}`)).toBeInTheDocument();
  });

  it("프로젝트 삭제도 확인을 거치고, 마지막 프로젝트를 지우면 빈 상태가 된다", async () => {
    await openAcme();
    await userEvent.click(within(sidebar()).getByRole("button", { name: "acme" }));

    await userEvent.click(screen.getByRole("button", { name: GROUP_TEXT.delete }));
    await userEvent.click(screen.getByRole("button", { name: CONFIRM_TEXT.cancel }));
    expect(screen.getByRole("heading", { level: 1, name: "acme" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: GROUP_TEXT.delete }));
    await userEvent.click(screen.getByRole("button", { name: CONFIRM_TEXT.confirm }));

    expect(screen.getByRole("heading", { name: EMPTY_TEXT.title })).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });
});
