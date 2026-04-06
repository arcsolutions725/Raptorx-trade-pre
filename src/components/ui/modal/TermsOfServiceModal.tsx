"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

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

  // Lock background scroll
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  if (!isOpen || typeof document === "undefined") return null;

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

  const body = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0"
        aria-hidden="true"
        onClick={handleBackdropClick}
      />
      <div
        ref={modalRef}
        className="relative bg-[#0D0D0D] border border-[#303030] max-w-3xl w-full max-h-[90vh] rounded-2xl shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#303030]">
          <h2 className="text-[#ffc000] text-lg! sm:text-2xl! font-semibold">
            RaptorX Terms of Service
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-300 hover:text-[#ffc000] transition-colors text-2xl leading-none"
            aria-label="Close terms of service"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto text-[13px] sm:text-sm leading-relaxed text-gray-100 space-y-6 custom-sidebar-scrollbar">
          {sections.map((section) => (
            <section key={section.id} className="space-y-2">
              <h4 className="font-semibold text-[16px]! sm:text-base! text-white">
                {section.title}
              </h4>
              {section.paragraphs.map((text, idx) => (
                <p
                  key={idx}
                  className={
                    section.id === "no-advice" && idx === 0
                      ? "uppercase text-[11px] font-semibold! sm:text-xs text-[#A0A0A0]"
                      : "text-[#A0A0A0] font-normal!"
                  }
                >
                  {text}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}

