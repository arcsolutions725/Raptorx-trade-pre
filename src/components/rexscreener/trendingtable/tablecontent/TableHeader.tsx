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
    return <ChevronsUpDown className="w-4 h-4 text-white/50" />;
  };

  return (
    <div className="sticky top-0 z-20 grid [grid-template-columns:260px_120px_120px_120px_120px_120px_100px_200px] sm:[grid-template-columns:360px_120px_120px_120px_120px_120px_100px_200px] bg-[#7F7F7F] text-white font-semibold border-b border-white/10 shadow-sm">
      {/* Token — sticky only on sm+ */}
      <div className="sm:sticky sm:left-0 sm:z-30 flex items-center px-3 py-2 whitespace-nowrap truncate border-r border-white/30 bg-[#7F7F7F]">
        <span className="!font-semibold">Token (Click coin for charting)</span>
      </div>

      {/* Mcap — sticky only on sm+ */}
      <div className="sm:sticky sm:left-[360px] sm:z-30 flex items-center justify-center px-3 py-2 whitespace-nowrap truncate border-r border-white/30 bg-[#7F7F7F]">
        <button
          onClick={() => onSort("marketCap")}
          className="flex items-center gap-1 px-2 py-1 rounded"
        >
          <span className="!font-semibold">Mcap</span>
          {getSortIcon("marketCap")}
        </button>
      </div>

      {/* AI Report — sticky only on sm+ */}
      <div className="sm:sticky sm:left-[480px] sm:z-30 flex items-center justify-center px-3 py-2 whitespace-nowrap truncate border-r border-white/30 bg-[#7F7F7F]">
        <span className="!font-semibold">AI Report</span>
      </div>

      {/* Vol */}
      <div className="flex items-center justify-center px-3 py-2 whitespace-nowrap truncate border-r border-white/30">
        <button
          onClick={() => onSort("volume")}
          className="flex items-center gap-1 px-2 py-1 rounded"
          title="Sort by Vol"
        >
          <span className="!font-semibold">Vol</span>
          {getSortIcon("volume")}
        </button>
      </div>

      {/* Price */}
      <div className="flex items-center justify-center px-3 py-2 whitespace-nowrap truncate border-r border-white/30">
        <button
          onClick={() => onSort("price")}
          className="flex items-center gap-1 px-2 py-1 rounded"
          title="Sort by Price"
        >
          <span className="!font-semibold">Price</span>
          {getSortIcon("price")}
        </button>
      </div>

      {/* Liquidity — now sortable */}
      <div className="flex items-center justify-center px-3 py-2 whitespace-nowrap truncate border-r border-white/30">
        <button
          onClick={() => onSort("liquidity")}
          className="flex items-center gap-1 px-2 py-1 rounded"
          title="Sort by Liquidity"
        >
          <span className="!font-semibold">Liquidity</span>
          {getSortIcon("liquidity")}
        </button>
      </div>

      {/* Age */}
      <div className="flex items-center justify-center px-3 py-2 whitespace-nowrap truncate border-r border-white/30">
        <button
          onClick={() => onSort("age")}
          className="flex items-center gap-1 px-2 py-1 rounded"
          title="Sort by Age"
        >
          <span className="!font-semibold">Age</span>
          {getSortIcon("age")}
        </button>
      </div>

      {/* Last Generated On */}
      <div className="flex items-center px-3 py-2 whitespace-nowrap truncate">
        <span className="!font-semibold">Last Generated On</span>
      </div>
    </div>
  );
}
