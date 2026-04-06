import { Metadata } from "next";

type Props = {
  params: Promise<{ event: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { event: eventSlug } = await params;

  return {
    title: `Limitless Market - ${eventSlug} | RaptorX`,
    description: `View Limitless prediction market details for ${eventSlug}`,
  };
}

export default function LimitlessEventLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
