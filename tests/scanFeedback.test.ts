import { afterEach, describe, expect, it, vi } from "vitest";

import { scanFeedbackSuccess, scanFeedbackError } from "@/lib/scanFeedback";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scanFeedback — segurança em SSR (ambiente node)", () => {
  it("não lança sem window/navigator.vibrate", () => {
    // Ambiente node: sem window, e navigator (se existir) sem vibrate.
    expect(() => scanFeedbackSuccess()).not.toThrow();
    expect(() => scanFeedbackError()).not.toThrow();
  });
});

describe("scanFeedback — com APIs de browser disponíveis", () => {
  it("dispara navigator.vibrate no sucesso e no erro", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });

    scanFeedbackSuccess();
    expect(vibrate).toHaveBeenCalledWith(80);

    scanFeedbackError();
    expect(vibrate).toHaveBeenCalledWith([60, 40, 60]);
  });

  it("engole exceções do navigator.vibrate", () => {
    vi.stubGlobal("navigator", {
      vibrate: () => {
        throw new Error("denied");
      },
    });
    expect(() => scanFeedbackSuccess()).not.toThrow();
  });

  it("cria oscillator via AudioContext quando há window", () => {
    const oscillator = {
      frequency: { value: 0 },
      type: "",
      connect: vi.fn().mockReturnThis(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      gain: { value: 0 },
      connect: vi.fn().mockReturnThis(),
    };
    const createOscillator = vi.fn(() => oscillator);
    const createGain = vi.fn(() => gain);

    class FakeAudioContext {
      state = "running";
      currentTime = 0;
      destination = {};
      createOscillator = createOscillator;
      createGain = createGain;
      resume = vi.fn();
    }

    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    vi.stubGlobal("navigator", { vibrate: vi.fn() });

    scanFeedbackSuccess();

    expect(createOscillator).toHaveBeenCalled();
    expect(oscillator.start).toHaveBeenCalled();
    expect(oscillator.stop).toHaveBeenCalled();
    expect(oscillator.frequency.value).toBe(880);
  });
});
