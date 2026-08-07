import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransferReview } from "./transfer-review";
import type { ReviewItem } from "@/lib/offline/bundle";

function item(
  id: string,
  status: ReviewItem["status"],
  overrides: Partial<ReviewItem> = {}
): ReviewItem {
  return {
    entity: {
      type: "ballot",
      id,
      label: `Ballot ${id}`,
      payload: { winner: "Team A" },
      updated_at: 1_700_000_000_000,
    },
    mine:
      status === "new"
        ? null
        : { payload: { winner: "Team B" }, updated_at: 1_700_000_500_000 },
    status,
    ...overrides,
  };
}

const noop = () => {};

describe("what is selected by default", () => {
  test("new and newer items are pre-selected", () => {
    render(
      <TransferReview
        items={[item("a", "new"), item("b", "newer")]}
        onApply={noop}
        onCancel={noop}
      />
    );

    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
  });

  test("items older than mine are not pre-selected", () => {
    render(
      <TransferReview
        items={[item("a", "new"), item("b", "older")]}
        onApply={noop}
        onCancel={noop}
      />
    );

    expect(screen.getByText("1 of 2 selected")).toBeInTheDocument();
  });

  test("identical items are not pre-selected", () => {
    render(<TransferReview items={[item("a", "identical")]} onApply={noop} onCancel={noop} />);

    expect(screen.getByText("0 of 1 selected")).toBeInTheDocument();
  });
});

describe("choosing per item", () => {
  test("nothing is applied until Apply is pressed", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();

    render(<TransferReview items={[item("a", "new")]} onApply={onApply} onCancel={noop} />);

    await user.click(screen.getByLabelText("Accept Ballot a"));

    expect(onApply).not.toHaveBeenCalled();
  });

  test("only accepted items are handed over", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();

    render(
      <TransferReview
        items={[item("a", "new"), item("b", "new")]}
        onApply={onApply}
        onCancel={noop}
      />
    );

    await user.click(screen.getByLabelText("Accept Ballot b"));
    await user.click(screen.getByRole("button", { name: /Apply 1/ }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].map((entry: ReviewItem) => entry.entity.id)).toEqual(["a"]);
  });

  test("a declined item can be taken back on", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();

    render(<TransferReview items={[item("a", "older")]} onApply={onApply} onCancel={noop} />);

    await user.click(screen.getByLabelText("Accept Ballot a"));
    await user.click(screen.getByRole("button", { name: /Apply 1/ }));

    expect(onApply.mock.calls[0][0]).toHaveLength(1);
  });

  test("accept all selects everything, including older items", async () => {
    const user = userEvent.setup();

    render(
      <TransferReview
        items={[item("a", "older"), item("b", "identical")]}
        onApply={noop}
        onCancel={noop}
      />
    );

    await user.click(screen.getByRole("button", { name: "Accept all" }));

    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
  });

  test("decline all clears the selection and blocks Apply", async () => {
    const user = userEvent.setup();

    render(<TransferReview items={[item("a", "new")]} onApply={noop} onCancel={noop} />);

    await user.click(screen.getByRole("button", { name: "Decline all" }));

    expect(screen.getByRole("button", { name: /Apply 0/ })).toBeDisabled();
  });
});

describe("warning before overwriting newer work", () => {
  test("selecting an older item warns", async () => {
    const user = userEvent.setup();

    render(<TransferReview items={[item("a", "older")]} onApply={noop} onCancel={noop} />);

    await user.click(screen.getByLabelText("Accept Ballot a"));

    expect(screen.getByText(/would replace something newer/i)).toBeInTheDocument();
  });

  test("no warning when nothing older is selected", () => {
    render(<TransferReview items={[item("a", "new")]} onApply={noop} onCancel={noop} />);

    expect(screen.queryByText(/would replace something newer/i)).not.toBeInTheDocument();
  });
});

describe("grouping", () => {
  test("items are grouped by kind with a count", () => {
    render(
      <TransferReview
        items={[
          item("a", "new"),
          {
            ...item("p1", "new"),
            entity: {
              type: "pairing",
              id: "p1",
              label: "Round 1",
              payload: {},
              updated_at: 1,
            },
          },
        ]}
        onApply={noop}
        onCancel={noop}
      />
    );

    expect(screen.getByText("Ballots")).toBeInTheDocument();
    expect(screen.getByText("Pairings")).toBeInTheDocument();
  });

  test("a group can be taken or dropped as a whole", async () => {
    const user = userEvent.setup();

    render(
      <TransferReview
        items={[item("a", "new"), item("b", "new")]}
        onApply={noop}
        onCancel={noop}
      />
    );

    const group = screen.getByText("Ballots").closest("section")!;
    await user.click(within(group).getByRole("button", { name: "None" }));

    expect(screen.getByText("0 of 2 selected")).toBeInTheDocument();

    await user.click(within(group).getByRole("button", { name: "All" }));

    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
  });
});

describe("comparing mine and theirs", () => {
  test("the comparison is hidden until asked for", async () => {
    const user = userEvent.setup();

    render(<TransferReview items={[item("a", "newer")]} onApply={noop} onCancel={noop} />);

    expect(screen.queryByText("Yours")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Show comparison"));

    expect(screen.getByText("Yours")).toBeInTheDocument();
    expect(screen.getByText("Theirs")).toBeInTheDocument();
  });

  test("a new item shows that this device has nothing", async () => {
    const user = userEvent.setup();

    render(<TransferReview items={[item("a", "new")]} onApply={noop} onCancel={noop} />);

    await user.click(screen.getByLabelText("Show comparison"));

    expect(screen.getByText("Not on this device")).toBeInTheDocument();
  });
});

describe("cancelling", () => {
  test("cancel applies nothing", async () => {
    const onCancel = vi.fn();
    const onApply = vi.fn();
    const user = userEvent.setup();

    render(<TransferReview items={[item("a", "new")]} onApply={onApply} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  test("buttons are disabled while applying", () => {
    render(
      <TransferReview items={[item("a", "new")]} onApply={noop} onCancel={noop} applying />
    );

    expect(screen.getByRole("button", { name: "Applying…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
