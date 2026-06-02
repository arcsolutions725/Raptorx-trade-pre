import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

// ⬅️ Add "liquidity"
export type SortField = "marketCap" | "volume" | "price" | "age" | "liquidity";
export type SortDirection = "asc" | "desc" | null;

interface TableHeaderProps {
  sortField: SortField | null;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}

export function TableHeader({
  sortField,
  sortDirection,
  onSort,
}: TableHeaderProps) {
  const getSortIcon = (field: SortField) => {
    if (sortField === field) {
      return sortDirection === "asc" ? (
        <ChevronUp className="w-4 h-4 text-white" />
      ) : (
        <ChevronDown className="w-4 h-4 text-white" />
      );
    }
    return <ChevronsUpDown className="w-4 h-4 text-white/60" />;
  };

  return (
    <div className="min-w-301.5 sm:min-w-379 grid grid-cols-[minmax(200px,1.5fr)_minmax(40px,1fr)_minmax(160px,1fr)_minmax(96px,0.8fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(100px,1fr)_minmax(70px,1fr)] sm:grid-cols-[minmax(400px,2fr)_minmax(200px,1fr)_minmax(140px,1fr)_minmax(108px,0.75fr)_minmax(200px,1fr)_minmax(200px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)] border-b border-white/10 bg-black/95 backdrop-blur-sm text-white font-semibold shadow-sm">
      {/* Token — sticky only on sm+ */}
      <div 
        className="sm:sticky sm:left-0 sm:z-30 flex items-center px-3 py-2 whitespace-nowrap truncate bg-black sm:shadow-[2px_0_4px_rgba(0,0,0,0.3)] sm:isolation-auto"
        style={{ isolation: 'isolate' } as React.CSSProperties}
      >
        <span className="text-[12px] text-white/60 font-normal">Token (Click coin for charting)</span>
      </div>

      {/* AI Report — sticky only on sm+ */}
      <div 
        className="sm:sticky sm:left-100 sm:z-30 flex items-center justify-center px-3 pr-9 py-2 whitespace-nowrap truncate bg-black sm:shadow-[2px_0_4px_rgba(0,0,0,0.3)] sm:isolation-auto"
        style={{ isolation: 'isolate' } as React.CSSProperties}
      >
        <span className="text-[12px] text-white/60 font-normal w-[70px] h-[29.56px] flex items-center justify-center">AI Report</span>
      </div>

      {/* Mcap — sticky only on sm+ */}
      <div 
        className="sm:sticky sm:left-135 sm:z-30 flex items-center justify-center px-3 py-2 whitespace-nowrap truncate bg-black sm:shadow-[2px_0_4px_rgba(0,0,0,0.3)] sm:isolation-auto"
        style={{ isolation: 'isolate' } as React.CSSProperties}
      >
        <button
          onClick={() => onSort("marketCap")}
          className="flex items-center gap-1 px-2 py-1 rounded"
        >
          <span className="text-[12px] text-white/60 font-normal">Mcap</span>
          {getSortIcon("marketCap")}
        </button>
      </div>

      {/* 24h chart — after Mcap */}
      <div className="flex min-h-[48px] items-center justify-end self-stretch px-2 py-2 sm:min-h-[52px] whitespace-nowrap relative z-0 bg-black">
        <span
          className="text-[12px] text-white/60 font-normal text-right leading-tight"
          title="24h price change (USD); line is hourly from Birdeye"
        >
          24h %
        </span>
      </div>

      {/* Vol */}
      <div className="flex items-center justify-center px-3 py-2 whitespace-nowrap truncate relative z-0 bg-black">
        <button
          onClick={() => onSort("volume")}
          className="flex items-center gap-1 px-2 py-1 rounded"
          title="Sort by Vol"
        >
          <span className="text-[12px] text-white/60 font-normal">Vol</span>
          {getSortIcon("volume")}
        </button>
      </div>

      {/* Price */}
      <div className="flex items-center justify-center px-3 py-2 whitespace-nowrap truncate relative z-0 bg-black">
        <button
          onClick={() => onSort("price")}
          className="flex items-center gap-1 px-2 py-1 rounded"
          title="Sort by Price"
        >
          <span className="text-[12px] text-white/60 font-normal">Price</span>
          {getSortIcon("price")}
        </button>
      </div>

      {/* Liquidity — now sortable */}
      <div className="flex items-center justify-center px-3 py-2 whitespace-nowrap truncate relative z-0 bg-black">
        <button
          onClick={() => onSort("liquidity")}
          className="flex items-center gap-1 px-2 py-1 rounded"
          title="Sort by Liquidity"
        >
          <span className="text-[12px] text-white/60 font-normal">Liquidity</span>
          {getSortIcon("liquidity")}
        </button>
      </div>

      {/* Age */}
      <div className="flex items-center justify-center px-3 py-2 whitespace-nowrap truncate relative z-0 bg-black">
        <button
          onClick={() => onSort("age")}
          className="flex items-center gap-1 px-2 py-1 rounded"
          title="Sort by Age"
        >
          <span className="text-[12px] text-white/60 font-normal">Age</span>
          {getSortIcon("age")}
        </button>
      </div>
    </div>
  );
}
