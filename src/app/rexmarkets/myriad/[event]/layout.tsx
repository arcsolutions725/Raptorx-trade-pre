import type { Metadata } from "next";

type Props = {
  params: Promise<{ event: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { event: raw } = await params;
  let slug = raw?.trim() ?? "market";
  try {
    slug = decodeURIComponent(slug);
  } catch {
    /* */
  }

  return {
    title: `${slug} | Myriad — RaptorX`,
    description: `View Myriad prediction market ${slug}: order book, price history, top holders, and activity on RaptorX.`,
  };
}

export default function MyriadEventLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
