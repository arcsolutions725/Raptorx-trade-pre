import React from "react";

type TableHeaderProps = {
  showSourceColumn?: boolean;
};

export default function TableHeader({ showSourceColumn = false }: TableHeaderProps) {
  const gridColumns = showSourceColumn
    ? "[grid-template-columns:minmax(300px,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(100px,1fr)] sm:[grid-template-columns:minmax(400px,2.5fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(100px,1fr)]"
    : "[grid-template-columns:minmax(300px,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)] sm:[grid-template-columns:minmax(400px,2.5fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)]";
  
  return (
    <div className={`sticky top-0 z-20 grid ${gridColumns} bg-black text-white font-semibold shadow-sm`}>
      {/* Markets */}
      <div 
        className="sm:sticky sm:left-0 sm:z-30 flex items-center px-3 py-2 whitespace-nowrap truncate bg-black sm:shadow-[2px_0_4px_rgba(0,0,0,0.3)] sm:isolation-auto"
        style={{ isolation: 'isolate' } as React.CSSProperties}
      >
        <span className="text-[12px] text-white/60 font-normal">
          Markets (Click each market for live insights)
        </span>
      </div>

      {/* Choice I */}
      <div className="flex items-center justify-center px-3 py-2 whitespace-nowrap truncate relative z-0 bg-black">
        <span className="text-[12px] text-white/60 font-normal">Choice I</span>
      </div>

      {/* Choice II */}
      <div className="flex items-center justify-center px-3 py-2 whitespace-nowrap truncate relative z-0 bg-black">
        <span className="text-[12px] text-white/60 font-normal">Choice II</span>
      </div>

      {/* AI Report */}
      <div className="flex items-center justify-center px-3 py-2 whitespace-nowrap truncate relative z-0 bg-black">
        <span className="text-[12px] text-white/60 font-normal">AI Report</span>
      </div>

      {/* YES Price */}
      <div className="flex items-center justify-center px-3 py-2 whitespace-nowrap truncate relative z-0 bg-black">
        <span className="text-[12px] text-white/60 font-normal">YES Price</span>
      </div>

      {/* No Price */}
      <div className="flex items-center justify-center px-3 py-2 whitespace-nowrap truncate relative z-0 bg-black">
        <span className="text-[12px] text-white/60 font-normal">No Price</span>
      </div>

      {/* Vol(24h) */}
      <div className="flex items-center justify-center px-3 py-2 whitespace-nowrap truncate relative z-0 bg-black">
        <span className="text-[12px] text-white/60 font-normal">Vol(24h)</span>
      </div>

      {/* Source - only shown when showSourceColumn is true */}
      {showSourceColumn && (
        <div className="flex items-center justify-center px-3 py-2 whitespace-nowrap truncate relative z-0 bg-black">
          <span className="text-[12px] text-white/60 font-normal">Source</span>
        </div>
      )}
    </div>
  );
}
