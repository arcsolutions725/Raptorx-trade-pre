export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full h-full overflow-y-auto" style={{ minHeight: "100%", height: "100%" }}>
      {children}
    </div>
  );
}
