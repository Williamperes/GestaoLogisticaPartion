// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { QrCodeDisplay } from "@/components/inventory/QrCodeDisplay";

describe("QrCodeDisplay", () => {
  it("gera um SVG e expõe o valor via aria-label", async () => {
    // Server component assíncrono: resolvemos o elemento e então renderizamos.
    const el = await QrCodeDisplay({ value: "PTN-UN-ABC123", size: 64 });
    const { container } = render(el);

    const wrapper = container.querySelector("[aria-label]");
    expect(wrapper).toHaveAttribute("aria-label", "QR code: PTN-UN-ABC123");
    expect(wrapper?.querySelector("svg")).toBeTruthy();
  });

  it("usa o tamanho informado no style", async () => {
    const el = await QrCodeDisplay({ value: "X", size: 200 });
    const { container } = render(el);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe("200px");
    expect(wrapper.style.height).toBe("200px");
  });
});
