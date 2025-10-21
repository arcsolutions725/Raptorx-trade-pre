import Image from "next/image";

export function TrendingTableHeader() {
  return (
    <div className="w-full flex flex-col items-center justify-center">
      {/* Header content - ensure all elements stay in one line on mobile */}
      <div className="flex flex-row items-center justify-start gap-1 sm:gap-2 w-[95%] pt-5 lg:pt-0 py-2 min-w-0">
        {/* Logo and beta - keep compact on mobile */}
        <div className="flex items-end flex-shrink-0">
          <Image
            src={"/images/trending-logo.png"}
            alt="trending-logo"
            width={100}
            height={100}
            className="w-[50px] h-[50px] sm:w-[60px] sm:h-[60px] md:w-[85px] md:h-[85px]"
          />

          <Image
            src={"/images/beta.png"}
            alt="Beta version"
            width={28}
            height={28}
            className="pb-2"
          />
        </div>

        {/* Text content - allow text to be responsive but stay in one line */}
        <div className="flex justify-center items-center w-full min-w-0 overflow-hidden">
          {/* Condensed text layout for mobile */}
          <div className="flex items-center gap-1 text-[12px] xs:text-[12px] sm:text-[14px] md:text-[18px] lg:text-[20px] whitespace-nowrap pr-[13.5%]">
            <span className="text-[#ffc000] font-medium">Hunt with</span>
            <span className="text-white">AI simplified data.</span>
            {/* <span className="text-[#ffc000]">Powered by</span>
            <Image
              src={"/images/solana.png"}
              alt="solana-symbol"
              width={30}
              height={30}
              className="w-[16px] h-[16px] sm:w-[20px] sm:h-[20px] lg:w-[30px] lg:h-[30px] mx-1"
            />
            <span className="text-white">Solana.</span> */}
          </div>
        </div>
      </div>

      {/* Banner section */}
      <div className="w-full flex items-center justify-center py-5 bg-[#1D1D22]">
        <Image
          src={"/images/trending-banner.png"}
          alt="trending-banner"
          width={160}
          height={160}
          className="w-[100px] h-[45px] lg:w-[160px] lg:h-[61px]"
        />
      </div>
    </div>
  );
}
