import { Contract, utils } from "ethers";
import type { providers } from "ethers";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import { myriadBscPublicClient } from "@/lib/myriad/bscPublicClient";

const ERC1155_MIN_ABI = [
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address account, address operator) view returns (bool)",
];

const isApprovedForAllAbi = [
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ type: "bool", name: "" }],
  },
] as const;

/**
 * AMM sells: PredictionMarket pulls ERC1155 outcome shares — operator must be approved on BSC.
 * Reads `isApprovedForAll` via BSC RPC (wallet’s ethers provider may still be pinned to Polygon).
 */
export async function ensureErc1155OperatorForMarket(
  signer: providers.JsonRpcSigner,
  conditionalTokens: string,
  operator: string
): Promise<void> {
  if (!utils.isAddress(conditionalTokens) || !utils.isAddress(operator)) return;

  const owner = await signer.getAddress();
  const data = encodeFunctionData({
    abi: isApprovedForAllAbi,
    functionName: "isApprovedForAll",
    args: [owner as `0x${string}`, operator as `0x${string}`],
  });
  const { data: callData } = await myriadBscPublicClient.call({
    to: conditionalTokens as `0x${string}`,
    data: data as `0x${string}`,
  });
  if (callData && callData !== "0x") {
    const approved = decodeFunctionResult({
      abi: isApprovedForAllAbi,
      functionName: "isApprovedForAll",
      data: callData,
    }) as boolean;
    if (approved) return;
  }

  const c = new Contract(conditionalTokens, ERC1155_MIN_ABI, signer);
  const tx = await c.setApprovalForAll(operator, true);
  await tx.wait(1);
}
