import QRCode from "qrcode";

interface QrCodeDisplayProps {
  value: string;
  size?: number;
  className?: string;
}

export async function QrCodeDisplay({ value, size = 128, className }: QrCodeDisplayProps) {
  const svg = await QRCode.toString(value, {
    type: "svg",
    margin: 1,
    width: size,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return (
    <div
      aria-label={`QR code: ${value}`}
      className={className}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
