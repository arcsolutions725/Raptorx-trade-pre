"use client";

import { useEffect, useRef } from "react";
import { AcctModal, AcctModalHead } from "@/components/ui/modal/accountUi";

interface TermsOfServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TermsOfServiceModal({
  isOpen,
  onClose,
}: TermsOfServiceModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Page scroll is locked by the modal shell (AcctModal); a click on the scrim closes, as before.

  if (!isOpen) return null;

  const sections = [
    {
      id: "acceptance",
      title: "1. ACCEPTANCE OF TERMS",
      paragraphs: [
        'By accessing or using the RaptorX platform, API, or the Claw reasoning model (collectively, the "Services"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not access or use the Services. RaptorX reserves the right to modify these Terms at any time, and continued use constitutes acceptance of those changes.',
      ],
    },
    {
      id: "nature-of-services",
      title: "2. NATURE OF THE SERVICES",
      paragraphs: [
        "RaptorX provides an intelligence and execution engine designed to ingest real-time on-chain and off-chain signals and facilitate automated or manual execution within third-party prediction markets and decentralized finance (DeFi) protocols.",
        'The Services utilize proprietary artificial intelligence and reasoning models ("Claw"), which are inherently probabilistic; we do not guarantee absolute accuracy, reliability, or inference speed under all market conditions. RaptorX acts solely as an execution layer and does not host, operate, or control the underlying markets, blockchains, or smart contracts where your trades are executed.',
      ],
    },
    {
      id: "no-advice",
      title: "3. NO FINANCIAL OR INVESTMENT ADVICE",
      paragraphs: [
        "RAPTORX IS NOT A BROKER, FINANCIAL ADVISOR, OR INVESTMENT FUND.",
        "The signals, data infrastructure, and AI-driven reasoning provided by RaptorX are for informational and execution purposes only and do not constitute financial, legal, tax, or investment advice. You remain solely responsible for deciding whether to execute any transaction based on RaptorX's intelligence.",
      ],
    },
    {
      id: "risk",
      title: "4. ASSUMPTION OF RISK",
      paragraphs: [
        "By using the Services, you expressly acknowledge and assume risks including, but not limited to, market volatility (you can lose your entire principal), execution and latency risk arising from network congestion or third-party APIs, and smart contract risk on underlying decentralized protocols.",
        "RaptorX is not liable for slippage, missed opportunities, or funds lost due to exploits, hacks, or vulnerabilities in third-party smart contracts or blockchain networks.",
      ],
    },
    {
      id: "compliance",
      title: "5. REGULATORY COMPLIANCE & GEOGRAPHIC RESTRICTIONS",
      paragraphs: [
        "You are solely responsible for ensuring that your use of the Services, including participation in prediction markets, complies with the laws and regulations of your jurisdiction.",
        "You represent and warrant that you are not accessing the Services from any jurisdiction where interaction with prediction markets or digital assets is prohibited by law. We may geoblock, restrict, or terminate access to the Services at any time to comply with sanctions, regulatory directives, or legal risk.",
      ],
    },
    {
      id: "ip",
      title: "6. INTELLECTUAL PROPERTY",
      paragraphs: [
        "All rights, title, and interest in and to the Services, including the Claw reasoning model, data ingestion pipelines, code, and the RaptorX brand, are the exclusive property of RaptorX and its licensors.",
        "You are granted a limited, non-exclusive, non-transferable license to use the Services for their intended purpose only. You may not reverse-engineer, decompile, or attempt to extract the source code or model weights of Claw.",
      ],
    },
    {
      id: "liability",
      title: "7. LIMITATION OF LIABILITY",
      paragraphs: [
        "To the maximum extent permitted by law, RAPTORX, its founders, directors, or affiliates shall not be liable in any event for any indirect, incidental, special, consequential, or punitive damages (including but not limited to loss of profits, loss of data, or loss of digital assets) arising in connection with your use of the Service, even if RAPTORX was notified in advance of the possibility of such damages.",
      ],
    },
    {
      id: "indemnification",
      title: "8. INDEMNIFICATION",
      paragraphs: [
        "You agree to indemnify, defend, and hold harmless RaptorX from and against any claims, disputes, demands, liabilities, damages, losses, and costs and expenses (including reasonable legal and accounting fees) arising out of or in any way connected with your access to or use of the Services or your violation of these Terms.",
      ],
    },
    {
      id: "governing-law",
      title: "9. GOVERNING LAW AND DISPUTE RESOLUTION",
      paragraphs: [
        "These Terms shall be governed by and construed in accordance with the laws of the governing jurisdiction selected by RaptorX.",
        "Any dispute arising out of or relating to these Terms or the breach thereof shall be finally resolved by binding arbitration administered by the applicable arbitration body under its commercial arbitration rules.",
      ],
    },
  ];

  return (
    <AcctModal
      labelledBy="tos-title"
      variant="plain"
      wide
      modalRef={modalRef}
      zIndex={9999}
      onScrimClick={onClose}
    >
      <AcctModalHead
        id="tos-title"
        title="RaptorX terms of service"
        onClose={onClose}
        closeLabel="Close terms of service"
      />
      <div className="acct-modal__body">
        <div className="tos">
          {sections.map((section) => (
            <section key={section.id} aria-labelledby={`tos-${section.id}`}>
              <h3 id={`tos-${section.id}`}>{section.title}</h3>
              {section.paragraphs.map((text, idx) => (
                <p
                  key={idx}
                  className={
                    section.id === "no-advice" && idx === 0
                      ? "tos__caps"
                      : undefined
                  }
                >
                  {text}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </AcctModal>
  );
}
