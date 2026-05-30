export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background p-4">
      {children}
    </div>
  );
}
