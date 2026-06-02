"use client";

import { useEffect, useState } from "react";
import ChatSidebar from "./ChatSidebar";
import ChatInterface from "./ChatInterface";
import { useReports } from "@/hooks/useReports";

interface RexChatProps {
  userId: string;
  selectedReportId?: string | null;
  onReportChange?: (reportId: string | null) => void;
  showSidebar?: boolean;
  onBack?: () => void;
  reportType?: "crypto" | "market" | "all";
  onViewHistory?: () => void;
  /** Close control in ChatInterface top bar (when parent hides floating close). */
  onCloseSidebar?: () => void;
}

export function RexChat({
  userId,
  selectedReportId: initialReportId = null,
  onReportChange,
  showSidebar = false,
  onBack,
  reportType = "all",
  onViewHistory,
  onCloseSidebar,
}: RexChatProps) {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(
    initialReportId
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(showSidebar);

  useEffect(() => {
    if (initialReportId) setSelectedReportId(initialReportId);
  }, [initialReportId]);

  const { data: reports = [] } = useReports(userId, reportType);

  const handleSelectReport = (rid: string) => {
    setSelectedReportId(rid);
    onReportChange?.(rid);
  };

  const handleBack = () => {
    setSelectedReportId(null);
    onReportChange?.(null);
    onBack?.(); // bubble up if parent wants to do more
  };

  return (
    <div className="flex h-full w-full max-w-360 mx-auto overflow-x-hidden min-h-0">
      {isSidebarOpen && (
        <ChatSidebar
          userId={userId}
          currentReportId={selectedReportId || undefined}
          onSelectReport={handleSelectReport}
          reportType={reportType}
        />
      )}
      {/* Ensure the chat area can shrink without overflowing */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {selectedReportId ? (
          <ChatInterface
            userId={userId}
            reportId={selectedReportId}
            onBack={handleBack}
            onViewHistory={onViewHistory}
            reportHistoryCount={reports.length}
            onCloseSidebar={onCloseSidebar}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-white/60 mb-4">
                Generate a report to start chatting
              </p>
              {reports.length > 0 && isSidebarOpen && (
                <p className="text-white/40 text-sm">
                  Or select a report from the history
                </p>
              )}
              {!isSidebarOpen && reports.length > 0 && (
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="mt-4 px-4 py-2 bg-[#ffc000] text-black font-semibold rounded-lg hover:bg-[#00b050] transition"
                >
                  Open History ({reports.length})
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
