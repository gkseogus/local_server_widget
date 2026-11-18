import { useState, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GroupEditor from "@/components/settings/GroupEditor";
import { CONFIRM_TEXT } from "@/contents/form";
import { GROUP_TEXT, VALIDATION_TEXT } from "@/contents/settings";
import { toDraft } from "@/lib/settingsDraft";
import { validateDraft } from "@/lib/settingsValidation";
import type { DraftFace, SelectionFace } from "@/types/settings";
import { makeAcmeConfig } from "@tests/helpers/fixtures";

interface HarnessFace {
  initial: DraftFace;
  onSelect: (selection: SelectionFace) => void;
  onAddService: () => void;
  onRemove: () => void;
}

const Harness = ({ initial, onSelect, onAddService, onRemove }: HarnessFace): ReactElement => {
  const [draft, setDraft] = useState(initial);
  return (
    <GroupEditor
      draft={draft}
      groupIndex={0}
      issues={validateDraft(draft)}
      isBusy={false}
      onChange={setDraft}
      onSelect={onSelect}
      onAddService={onAddService}
      onRemove={onRemove}
    />
  );
};

const renderEditor = (initial: DraftFace = toDraft(makeAcmeConfig())): Omit<HarnessFace, "initial"> => {
  const callbacks = { onSelect: vi.fn(), onAddService: vi.fn(), onRemove: vi.fn() };
  render(<Harness initial={initial} {...callbacks} />);
  return callbacks;
};

describe("GroupEditor", () => {
  it("이름을 바꾸면 제목이 따라오고, 비우면 오류를 보여 준다", async () => {
    renderEditor();
    const name = screen.getByLabelText(GROUP_TEXT.nameLabel);

    await userEvent.type(name, "_v2");
    expect(screen.getByRole("heading", { level: 1, name: "acme_v2" })).toBeInTheDocument();

    await userEvent.clear(name);
    expect(name).toHaveAccessibleDescription(VALIDATION_TEXT.nameEmpty);
  });

  it("소속 서버를 누르면 그 서버로, 서버 추가는 폴더 선택부터 시작한다", async () => {
    const { onSelect, onAddService } = renderEditor();

    await userEvent.click(screen.getByRole("button", { name: /frontend/ }));
    await userEvent.click(screen.getByRole("button", { name: GROUP_TEXT.addServer }));

    expect(onSelect).toHaveBeenCalledWith({ group: 0, service: 1 });
    expect(onAddService).toHaveBeenCalledOnce();
  });

  it("서버가 없으면 안내를 보여 준다", () => {
    renderEditor({ groups: [{ name: "empty", services: [] }] });
    expect(screen.getByText(GROUP_TEXT.noServices)).toBeInTheDocument();
  });

  it("프로젝트 삭제는 첫 클릭으로 지우지 않고, 확인을 눌러야 지운다", async () => {
    const { onRemove } = renderEditor();

    await userEvent.click(screen.getByRole("button", { name: GROUP_TEXT.delete }));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText(GROUP_TEXT.deletePrompt)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: CONFIRM_TEXT.confirm }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
