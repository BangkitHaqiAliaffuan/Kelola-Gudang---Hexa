import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BarcodeCameraDialog } from "./barcode-camera-dialog";

const { mockStart, mockStop, mockClear, MockHtml5Qrcode } = vi.hoisted(() => {
  const mockStart = vi.fn(
    async (
      _config: unknown,
      _options: unknown,
      _onSuccess: (text: string) => void,
      _onFailure?: () => void,
    ) => undefined,
  );
  const mockStop = vi.fn(async () => undefined);
  const mockClear = vi.fn(async () => undefined);
  const MockHtml5Qrcode = vi.fn(function (this: unknown) {
    return { start: mockStart, stop: mockStop, clear: mockClear };
  });
  return { mockStart, mockStop, mockClear, MockHtml5Qrcode };
});

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: MockHtml5Qrcode,
  Html5QrcodeSupportedFormats: {
    QR_CODE: 0,
    CODE_128: 1,
    CODE_39: 2,
    CODE_93: 3,
    EAN_13: 4,
    EAN_8: 5,
    UPC_A: 6,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BarcodeCameraDialog", () => {
  it("tidak menyentuh kamera saat tertutup", () => {
    render(<BarcodeCameraDialog open={false} onOpenChange={() => {}} onDecode={() => {}} />);
    expect(MockHtml5Qrcode).not.toHaveBeenCalled();
  });

  it("membuka kamera dengan readerId dan menutup setelah decode", async () => {
    const onDecode = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <BarcodeCameraDialog
        open
        onOpenChange={onOpenChange}
        onDecode={onDecode}
        readerId="test-reader"
      />,
    );

    await waitFor(() =>
      expect(MockHtml5Qrcode).toHaveBeenCalledWith("test-reader", expect.anything()),
    );
    expect(mockStart).toHaveBeenCalled();
    expect(await screen.findByText(/Arahkan kamera ke barcode/i)).toBeDefined();

    // Simulasikan hasil decode dari kamera.
    const onSuccess = mockStart.mock.calls[0]![2] as (text: string) => void;
    onSuccess("8991234567890");

    expect(onDecode).toHaveBeenCalledWith("8991234567890");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("mengabaikan decode kosong dan ganda", async () => {
    const onDecode = vi.fn();
    render(<BarcodeCameraDialog open onOpenChange={() => {}} onDecode={onDecode} />);

    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    const onSuccess = mockStart.mock.calls[0]![2] as (text: string) => void;
    onSuccess("   ");
    onSuccess("8991234567890");
    onSuccess("8991234567890");

    expect(onDecode).toHaveBeenCalledTimes(1);
    expect(onDecode).toHaveBeenCalledWith("8991234567890");
  });

  it("tombol Tutup menutup dialog", async () => {
    const onOpenChange = vi.fn();
    render(<BarcodeCameraDialog open onOpenChange={onOpenChange} onDecode={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
