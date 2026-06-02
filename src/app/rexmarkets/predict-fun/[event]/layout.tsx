import type { Metadata } from "next";

type Props = { params: Promise<{ event: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { event } = await params;
  let slug = event?.trim() || "market";
  try {
    slug = decodeURIComponent(slug);
  } catch {
    /* */
  }
  return {
    title: `${slug} | Predict.fun | Rex Predictions`,
    description: `View Predict.fun market ${slug}: price chart, order book, and activity on RaptorX.`,
  };
}

export default function PredictFunEventLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
