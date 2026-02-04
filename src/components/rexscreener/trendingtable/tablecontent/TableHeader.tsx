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
    <div className="sticky top-0 z-20 grid [grid-template-columns:minmax(300px,1.5fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)] sm:[grid-template-columns:minmax(400px,2fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)] bg-black text-white font-semibold shadow-sm">
      {/* Token — sticky only on sm+ */}
      <div 
        className="sm:sticky sm:left-0 sm:z-30 flex items-center px-3 py-2 whitespace-nowrap truncate bg-black sm:shadow-[2px_0_4px_rgba(0,0,0,0.3)] sm:isolation-auto"
        style={{ isolation: 'isolate' } as React.CSSProperties}
      >
        <span className="text-[12px] text-white/60 font-normal">Token (Click coin for charting)</span>
      </div>

      {/* Mcap — sticky only on sm+ */}
      <div 
        className="sm:sticky sm:left-[400px] sm:z-30 flex items-center justify-center px-3 py-2 whitespace-nowrap truncate bg-black sm:shadow-[2px_0_4px_rgba(0,0,0,0.3)] sm:isolation-auto"
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

      {/* AI Report — sticky only on sm+ */}
      <div 
        className="sm:sticky sm:left-[540px] sm:z-30 flex items-center justify-center px-3 py-2 whitespace-nowrap truncate bg-black sm:shadow-[2px_0_4px_rgba(0,0,0,0.3)] sm:isolation-auto"
        style={{ isolation: 'isolate' } as React.CSSProperties}
      >
        <span className="text-[12px] text-white/60 font-normal">AI Report</span>
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

      {/* Last Generated On */}
      <div className="flex items-center px-3 py-2 whitespace-nowrap truncate relative z-0 bg-black">
        <span className="text-[12px] text-white/60 font-normal">Last Generated On</span>
      </div>
    </div>
  );
}
