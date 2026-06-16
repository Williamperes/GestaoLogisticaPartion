// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("sonner", () => ({
  Toaster: (props: Record<string, unknown>) => {
    const React = require("react");
    return React.createElement("div", {
      "data-testid": "sonner-toaster",
      "data-position": props.position,
      "data-rich-colors": String(props.richColors),
      "data-close-button": String(props.closeButton),
    });
  },
}));

import { AppToaster } from "@/components/ui/toaster";

describe("AppToaster", () => {
  it("renderiza o Toaster do sonner", () => {
    const { getByTestId } = render(<AppToaster />);
    expect(getByTestId("sonner-toaster")).toBeInTheDocument();
  });

  it("passa position top-right", () => {
    const { getByTestId } = render(<AppToaster />);
    expect(getByTestId("sonner-toaster")).toHaveAttribute(
      "data-position",
      "top-right"
    );
  });

  it("habilita richColors e closeButton", () => {
    const { getByTestId } = render(<AppToaster />);
    const el = getByTestId("sonner-toaster");
    expect(el).toHaveAttribute("data-rich-colors", "true");
    expect(el).toHaveAttribute("data-close-button", "true");
  });
});
