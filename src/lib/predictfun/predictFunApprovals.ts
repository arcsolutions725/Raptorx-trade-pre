import { BigNumber, Contract, constants, utils, type providers } from "ethers";
import {
  PREDICT_FUN_ADDRESSES_BY_CHAIN_ID,
  predictFunConditionalTokensAddress,
  predictFunExchangeAddress,
  type PredictFunChainId,
  type PredictFunMarketFlags,
} from "@/lib/predictfun/orderEip712";

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
];

const ERC1155_ABI = [
  "function isApprovedForAll(address account, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
];

const KERNEL_EXECUTE_ABI = [
  "function execute(bytes32 execMode, bytes executionCalldata) payable",
];

const EXECUTION_MODE = `0x${"0".repeat(64)}` as const;

function encodeKernelExecutePayload(
  target: string,
  innerCalldata: string,
  value = 0
): string {
  return utils.hexConcat([
    utils.hexZeroPad(target, 32),
    utils.hexZeroPad(BigNumber.from(value).toHexString(), 32),
    innerCalldata,
  ]);
}

async function ensureErc20Allowance(
  signer: providers.JsonRpcSigner,
  owner: string,
  token: string,
  spender: string,
  needed: BigNumber,
  predictAccount: string | null
): Promise<void> {
  const tokenC = new Contract(token, ERC20_ABI, signer);
  const allowance: BigNumber = await tokenC.allowance(owner, spender);
  if (allowance.gte(needed)) return;

  const iface = new utils.Interface(ERC20_ABI);
  const inner = iface.encodeFunctionData("approve", [spender, constants.MaxUint256]);

  if (predictAccount && owner.toLowerCase() === predictAccount.toLowerCase()) {
    const kernel = new Contract(predictAccount, KERNEL_EXECUTE_ABI, signer);
    const payload = encodeKernelExecutePayload(token, inner);
    const tx = await kernel.execute(EXECUTION_MODE, payload);
    await tx.wait(1);
    return;
  }

  const tx = await tokenC.approve(spender, constants.MaxUint256);
  await tx.wait(1);
}

async function ensureErc1155Approval(
  signer: providers.JsonRpcSigner,
  owner: string,
  token: string,
  operator: string,
  predictAccount: string | null
): Promise<void> {
  const tokenC = new Contract(token, ERC1155_ABI, signer);
  const approved: boolean = await tokenC.isApprovedForAll(owner, operator);
  if (approved) return;

  const iface = new utils.Interface(ERC1155_ABI);
  const inner = iface.encodeFunctionData("setApprovalForAll", [operator, true]);

  if (predictAccount && owner.toLowerCase() === predictAccount.toLowerCase()) {
    const kernel = new Contract(predictAccount, KERNEL_EXECUTE_ABI, signer);
    const payload = encodeKernelExecutePayload(token, inner);
    const tx = await kernel.execute(EXECUTION_MODE, payload);
    await tx.wait(1);
    return;
  }

  const tx = await tokenC.setApprovalForAll(operator, true);
  await tx.wait(1);
}

/** USDT (buy) and conditional tokens (sell) approvals for maker address (EOA or Predict Account). */
export async function ensurePredictFunTradeApprovals(args: {
  signer: providers.JsonRpcSigner;
  chainId: PredictFunChainId;
  maker: string;
  marketFlags: PredictFunMarketFlags;
  side: "buy" | "sell";
  neededUsdtWei: BigNumber;
  predictAccount: string | null;
}): Promise<void> {
  const maker = utils.getAddress(args.maker);
  const exchange = predictFunExchangeAddress(args.chainId, args.marketFlags);
  const usdt = PREDICT_FUN_ADDRESSES_BY_CHAIN_ID[args.chainId].USDT;
  const ctf = predictFunConditionalTokensAddress(args.chainId, args.marketFlags);
  const predictAccount = args.predictAccount
    ? utils.getAddress(args.predictAccount)
    : null;

  if (args.side === "buy") {
    await ensureErc20Allowance(
      args.signer,
      maker,
      usdt,
      exchange,
      args.neededUsdtWei,
      predictAccount
    );
    return;
  }

  await ensureErc1155Approval(
    args.signer,
    maker,
    ctf,
    exchange,
    predictAccount
  );
}
