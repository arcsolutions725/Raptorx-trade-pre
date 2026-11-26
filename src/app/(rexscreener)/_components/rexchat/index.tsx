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
  /** Bring up the panel's swap (What's New "Trade" card); `full` shows the Exchange on its own. */
  onOpenExchange?: (opts?: { full?: boolean }) => void;
  /** Minimize control in the report pane head. */
  onMinimize?: () => void;
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
  onOpenExchange,
  onMinimize,
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
    <div className="flex h-full w-full min-h-0 flex-1 overflow-x-hidden">
      {isSidebarOpen && (
        <div className="h-full w-80 shrink-0">
          <ChatSidebar
            userId={userId}
            currentReportId={selectedReportId || undefined}
            onSelectReport={handleSelectReport}
            reportType={reportType}
          />
        </div>
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
            onOpenExchange={onOpenExchange}
            onMinimize={onMinimize}
          />
        ) : (
          <div className="sb-body">
            <div className="empty">
              <p>Generate a report to start chatting</p>
              {reports.length > 0 && isSidebarOpen && (
                <p className="rx-small">Or select a report from the history</p>
              )}
              {!isSidebarOpen && reports.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="rx-btn rx-btn--secondary rx-btn--s"
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
