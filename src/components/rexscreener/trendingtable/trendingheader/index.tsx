import Image from "next/image";

export function TrendingTableHeader() {
  return (
    <div className="w-full flex flex-col items-center justify-center">
      <div className="flex flex-row items-center justify-start gap-2 w-[95%] pt-5 lg:pt-0 py-2">
        <div className="flex gap-5 items-center pr-2">
          <Image
            src={"/images/trending-logo.png"}
            alt="trending-logo"
            width={100}
            height={100}
            className="w-[60px] h-[60px] md:w-[85px] md:h-[85px]"
          />
        </div>
        <div className="flex justify-center items-center w-full ">
          <h6 className="!text-[14px] md:!text-[18px] lg:!text-[20px] pr-2">
            <span className="text-[#ffc000]">Trade with</span> AI simplified
            data.
          </h6>
          <h6 className="text-[#ffc000] md:!text-[18px] !text-[14px] lg:!text-[20px] pr-1">
            Powered by
          </h6>
          <Image
            src={"/images/solana.png"}
            alt="solana-symbol"
            width={30}
            height={30}
            className="ml-2 w-[20px] h-[20px] lg:w-[30px] lg:h-[30px]"
          />
          <h6 className="!text-[14px] md:!text-[18px] lg:!text-[20px]">
            Solana.
          </h6>
        </div>
      </div>
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
