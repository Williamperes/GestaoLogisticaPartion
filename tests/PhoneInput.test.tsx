// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PhoneInput } from "@/components/ui/PhoneInput";

describe("PhoneInput", () => {
  it("formata o defaultValue na montagem", () => {
    render(<PhoneInput name="phone" defaultValue="11999887766" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("(11) 99988-7766");
  });

  it("não define value quando não há defaultValue", () => {
    render(<PhoneInput name="phone" placeholder="Telefone" />);
    const input = screen.getByPlaceholderText("Telefone") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("formata enquanto o usuário digita", async () => {
    const user = userEvent.setup();
    render(<PhoneInput name="phone" placeholder="Telefone" />);
    const input = screen.getByPlaceholderText("Telefone") as HTMLInputElement;

    await user.type(input, "11999887766");
    expect(input.value).toBe("(11) 99988-7766");
  });

  it("repassa o atributo name para envio em form", () => {
    render(<PhoneInput name="telefone" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("name", "telefone");
  });
});
