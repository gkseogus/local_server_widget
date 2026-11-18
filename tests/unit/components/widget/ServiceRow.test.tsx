import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ServiceRow from "@/components/widget/ServiceRow";
import { OPEN_LOG_ERROR } from "@/contents/serviceDetail";
import { SERVICE_ROW_LABELS } from "@/contents/serviceRow";
import { MESSAGES, STATUS_LABELS } from "@/contents/widget";
import { useServices } from "@/hooks/useServices";
import type { ServiceFace } from "@/types/service";
import { makeService, makeSnapshot, mockCommands, renderWithClient } from "@tests/helpers/fixtures";

const ID = "acme/backend";
const URL = "http://localhost:8002";

const renderRow = (service: ServiceFace): void => {
  renderWithClient(
    <ul>
      <ServiceRow service={service} />
    </ul>,
  );
};

// 서비스 목록 쿼리를 활성 상태로 두어 무효화 후 재조회를 관찰한다
const ServicesProbe = (): ReactElement => {
  useServices();
  return <></>;
};

const never = (): Promise<never> => new Promise(() => {});

describe("ServiceRow", () => {
  it("꺼진 서비스는 스위치가 꺼져 있고 누르면 start_service 를 호출한다", async () => {
    const calls = mockCommands({});
    renderRow(makeService({ status: "off" }));
    expect(screen.getByText(":8002")).toBeInTheDocument();
    expect(screen.getByText(STATUS_LABELS.off)).toBeInTheDocument();
    const toggle = screen.getByRole("switch", { name: ID });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    await waitFor(() => expect(calls).toContainEqual({ cmd: "start_service", args: { id: ID } }));
  });

  it("실행 중인 서비스는 스위치가 켜져 있고 누르면 stop_service 를 호출한다", async () => {
    const calls = mockCommands({});
    renderRow(makeService({ status: "on" }));
    const toggle = screen.getByRole("switch", { name: ID });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await userEvent.click(toggle);
    await waitFor(() => expect(calls).toContainEqual({ cmd: "stop_service", args: { id: ID } }));
  });

  it("켜기에 성공하면 서비스 목록을 다시 불러온다", async () => {
    const calls = mockCommands({ get_services: () => makeSnapshot() });
    const fetchCount = (): number => calls.filter((call) => call.cmd === "get_services").length;
    renderWithClient(
      <>
        <ServicesProbe />
        <ul>
          <ServiceRow service={makeService({ status: "off" })} />
        </ul>
      </>,
    );
    await waitFor(() => expect(fetchCount()).toBe(1));
    await userEvent.click(screen.getByRole("switch", { name: ID }));
    await waitFor(() => expect(fetchCount()).toBe(2));
  });

  it("남의 프로세스와 포트 충돌이면 스위치를 잠그고 안내 문구를 보여준다", () => {
    mockCommands({});
    renderRow(makeService({ status: "conflict", origin: "external" }));
    const toggle = screen.getByRole("switch", { name: ID });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(MESSAGES.conflictHint)).toBeInTheDocument();
  });

  it("위젯이 띄운 프로세스와 충돌이면 스위치가 켜진 채 활성이고 누르면 끈다", async () => {
    const calls = mockCommands({});
    renderRow(makeService({ status: "conflict", origin: "widget" }));
    const toggle = screen.getByRole("switch", { name: ID });
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(MESSAGES.conflictHint)).toBeInTheDocument();
    await userEvent.click(toggle);
    await waitFor(() => expect(calls).toContainEqual({ cmd: "stop_service", args: { id: ID } }));
  });

  it.each([
    { status: "off" as const, cmd: "start_service" },
    { status: "on" as const, cmd: "stop_service" },
  ])("$cmd 요청이 끝나기 전에는 스위치를 잠근다", async ({ status, cmd }) => {
    mockCommands({ [cmd]: never });
    renderRow(makeService({ status }));
    const toggle = screen.getByRole("switch", { name: ID });
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeDisabled());
  });

  it("시작 실패면 실패 문구와 로그 열기 버튼을 보여주고 open_log 를 호출한다", async () => {
    const calls = mockCommands({});
    renderRow(makeService({ status: "failed" }));
    expect(screen.getByText(STATUS_LABELS.failed)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: MESSAGES.openLog }));
    await waitFor(() => expect(calls).toContainEqual({ cmd: "open_log", args: { id: ID } }));
  });

  it.each([
    { status: "off" as const, cmd: "start_service", rustError: "uvicorn 실행 파일을 찾지 못했습니다." },
    { status: "on" as const, cmd: "stop_service", rustError: "프로세스를 종료하지 못했습니다." },
  ])("$cmd 가 실패하면 Rust 오류 문구를 그대로 alert 로 보여준다", async ({ status, cmd, rustError }) => {
    mockCommands({
      [cmd]: () => {
        throw rustError;
      },
    });
    renderRow(makeService({ status }));
    await userEvent.click(screen.getByRole("switch", { name: ID }));
    expect(await screen.findByRole("alert")).toHaveTextContent(rustError);
  });

  it.each([
    { status: "off" as const, cmd: "start_service", fallback: MESSAGES.startError },
    { status: "on" as const, cmd: "stop_service", fallback: MESSAGES.stopError },
  ])("$cmd 오류 문자열이 비어 있으면 기본 문구로 대체한다", async ({ status, cmd, fallback }) => {
    mockCommands({
      [cmd]: () => {
        throw "";
      },
    });
    renderRow(makeService({ status }));
    await userEvent.click(screen.getByRole("switch", { name: ID }));
    expect(await screen.findByRole("alert")).toHaveTextContent(fallback);
  });

  it("실행 중일 때만 URL 버튼으로 주소를 연다", async () => {
    const calls = mockCommands({});
    renderRow(makeService({ status: "on" }));
    await userEvent.click(screen.getByRole("button", { name: URL }));
    await waitFor(() =>
      expect(calls).toContainEqual({ cmd: "plugin:opener|open_url", args: expect.objectContaining({ url: URL }) }),
    );
  });

  it("꺼진 서비스의 URL 버튼은 비활성이라 열지 않는다", async () => {
    const calls = mockCommands({});
    renderRow(makeService({ status: "off" }));
    const urlButton = screen.getByRole("button", { name: URL });
    expect(urlButton).toBeDisabled();
    await userEvent.click(urlButton);
    expect(calls.some((call) => call.cmd === "plugin:opener|open_url")).toBe(false);
  });

  it.each([
    { status: "on" as const, cmd: "plugin:opener|open_url", name: URL, message: SERVICE_ROW_LABELS.openUrlError },
    { status: "failed" as const, cmd: "open_log", name: MESSAGES.openLog, message: OPEN_LOG_ERROR },
  ])("$cmd 가 실패하면 짧은 오류 문구를 alert 로 보여준다", async ({ status, cmd, name, message }) => {
    mockCommands({
      [cmd]: () => {
        throw "os error 2";
      },
    });
    renderRow(makeService({ status }));
    await userEvent.click(screen.getByRole("button", { name }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("상세 보기 버튼으로 상세 정보를 펼치고 접는다", async () => {
    mockCommands({});
    const service = makeService({ status: "on" });
    renderRow(service);
    const chevron = screen.getByRole("button", { name: SERVICE_ROW_LABELS.detail });
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(service.command)).not.toBeInTheDocument();

    await userEvent.click(chevron);
    expect(chevron).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(service.command)).toBeInTheDocument();

    await userEvent.click(chevron);
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(service.command)).not.toBeInTheDocument();
  });
});
