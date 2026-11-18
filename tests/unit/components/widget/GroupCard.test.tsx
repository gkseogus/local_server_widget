import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GroupCard from "@/components/widget/GroupCard";
import { MESSAGES } from "@/contents/widget";
import type { GroupFace, ServiceStatusType } from "@/types/service";
import { makeGroup, makeService, mockCommands, renderWithClient, type IpcCallFace } from "@tests/helpers/fixtures";

const GROUP_SWITCH = { name: "acme 전체" };

const makeAcme = (statuses: Record<string, ServiceStatusType>): GroupFace =>
  makeGroup(
    "acme",
    Object.entries(statuses).map(([name, status], index) => makeService({ name, status, port: 8000 + index })),
  );

const idsOf = (calls: IpcCallFace[], cmd: string): unknown[] =>
  calls.filter((call) => call.cmd === cmd).map((call) => call.args.id);

describe("GroupCard", () => {
  it("그룹 이름, 실행 개수, 서비스마다 한 줄을 보여준다", () => {
    renderWithClient(
      <GroupCard group={makeAcme({ api: "on", web: "starting", admin: "off", worker: "conflict", batch: "failed" })} />,
    );
    expect(screen.getByRole("heading", { name: "acme" })).toBeInTheDocument();
    expect(screen.getByText("2/5")).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(5);
  });

  it("전체 켜기는 꺼짐·실패 서비스만 켜고, 진행 중에는 스위치를 잠근다", async () => {
    // 응답을 끝내지 않아 mutation 이 pending 으로 남는다.
    const calls = mockCommands({ start_service: () => new Promise<void>(() => {}) });
    renderWithClient(<GroupCard group={makeAcme({ api: "on", admin: "off", batch: "failed", worker: "conflict" })} />);
    const toggle = screen.getByRole("switch", GROUP_SWITCH);
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await userEvent.click(toggle);

    await waitFor(() => expect(idsOf(calls, "start_service")).toEqual(["acme/admin", "acme/batch"]));
    expect(idsOf(calls, "stop_service")).toEqual([]);
    expect(toggle).toBeDisabled();
  });

  it("전체 끄기는 실행 중·시작 중 서비스만 끈다", async () => {
    const calls = mockCommands({});
    renderWithClient(<GroupCard group={makeAcme({ api: "on", web: "starting", worker: "conflict" })} />);
    const toggle = screen.getByRole("switch", GROUP_SWITCH);
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await userEvent.click(toggle);

    await waitFor(() => expect(idsOf(calls, "stop_service")).toEqual(["acme/api", "acme/web"]));
    expect(idsOf(calls, "start_service")).toEqual([]);
  });

  it("위젯이 띄운 포트 충돌 서비스는 실행 중으로 세고 전체 끄기 대상에 넣는다", async () => {
    const calls = mockCommands({});
    renderWithClient(
      <GroupCard
        group={makeGroup("acme", [
          makeService({ name: "api", status: "on", port: 8000 }),
          makeService({ name: "web", status: "conflict", origin: "widget", port: 8001 }),
          makeService({ name: "worker", status: "conflict", port: 8002 }),
        ])}
      />,
    );
    expect(screen.getByText("2/3")).toBeInTheDocument();
    const toggle = screen.getByRole("switch", GROUP_SWITCH);
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await userEvent.click(toggle);

    await waitFor(() => expect(idsOf(calls, "stop_service")).toEqual(["acme/api", "acme/web"]));
  });

  it.each([
    { status: "off" as const, cmd: "start_service", thrown: "포트 8000 을 다른 프로세스가 쓰고 있습니다", shown: "포트 8000 을 다른 프로세스가 쓰고 있습니다" },
    { status: "off" as const, cmd: "start_service", thrown: "", shown: MESSAGES.startError },
    { status: "on" as const, cmd: "stop_service", thrown: "", shown: MESSAGES.stopError },
  ])("$cmd 가 '$thrown' 로 실패하면 '$shown' 을 보여준다", async ({ status, cmd, thrown, shown }) => {
    mockCommands({
      [cmd]: () => {
        throw thrown;
      },
    });
    renderWithClient(<GroupCard group={makeAcme({ api: status })} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", GROUP_SWITCH));

    expect(await screen.findByRole("alert")).toHaveTextContent(shown);
  });

  it("남의 프로세스와 포트 충돌한 서비스뿐이면 그룹 스위치를 끈 채 잠근다", () => {
    renderWithClient(<GroupCard group={makeAcme({ api: "conflict", web: "conflict" })} />);
    const toggle = screen.getByRole("switch", GROUP_SWITCH);
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });
});
