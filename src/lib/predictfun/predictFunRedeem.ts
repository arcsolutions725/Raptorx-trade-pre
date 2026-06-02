/**
 * On-chain Predict.fun position redemption using ethers v5.
 * Mirrors @predictdotfun/sdk OrderBuilder.redeemPositions (no SDK import — SDK requires ethers v6).
 * @see https://github.com/PredictDotFun/sdk#how-to-redeem-positions
 */
import { BigNumber, Contract, utils, type providers } from "ethers";
import {
  PREDICT_FUN_ADDRESSES_BY_CHAIN_ID,
  predictFunConditionalTokensAddress,
  type PredictFunChainId,
} from "@/lib/predictfun/orderEip712";
import type { PredictFunPositionRedeemParams } from "@/lib/predictfun/parsePredictFunRedeem";

const ZERO_HASH = `0x${"0".repeat(64)}` as const;
const EXECUTION_MODE = ZERO_HASH;

const KERNEL_EXTRA: Record<
  PredictFunChainId,
  {
    KERNEL: string;
    NEG_RISK_ADAPTER: string;
    YIELD_BEARING_NEG_RISK_ADAPTER: string;
  }
> = {
  56: {
    KERNEL: "0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D",
    NEG_RISK_ADAPTER: "0xc3Cf7c252f65E0d8D88537dF96569AE94a7F1A6E",
    YIELD_BEARING_NEG_RISK_ADAPTER: "0x41dCe1A4B8FB5e6327701750aF6231B7CD0B2A40",
  },
  97: {
    KERNEL: "0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D",
    NEG_RISK_ADAPTER: "0x285c1B939380B130D7EBd09467b93faD4BA623Ed",
    YIELD_BEARING_NEG_RISK_ADAPTER: "0xb74aea04bdeBE912Aa425bC9173F9668e6f11F99",
  },
};

const CTF_REDEEM_ABI = [
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)",
];

const NEG_RISK_REDEEM_ABI = [
  "function redeemPositions(bytes32 conditionId, uint256[] amounts)",
];

const KERNEL_EXECUTE_ABI = [
  "function execute(bytes32 execMode, bytes executionCalldata) payable",
];

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

function toBigNumber(wei: bigint): BigNumber {
  return BigNumber.from(wei.toString());
}

function negRiskAmounts(
  indexSet: 1 | 2,
  amountWei: bigint
): [BigNumber, BigNumber] {
  const amount = toBigNumber(amountWei);
  return indexSet === 1 ? [amount, BigNumber.from(0)] : [BigNumber.from(0), amount];
}

export async function redeemPredictFunPositions(
  signer: providers.JsonRpcSigner,
  chainId: PredictFunChainId,
  params: PredictFunPositionRedeemParams,
  predictAccount: string | null
): Promise<string> {
  const addresses = PREDICT_FUN_ADDRESSES_BY_CHAIN_ID[chainId];
  const extra = KERNEL_EXTRA[chainId];
  const { isNegRisk, isYieldBearing, conditionId, indexSet, amountWei } = params;

  if (isNegRisk) {
    const adapterAddress = isYieldBearing
      ? extra.YIELD_BEARING_NEG_RISK_ADAPTER
      : extra.NEG_RISK_ADAPTER;
    const iface = new utils.Interface(NEG_RISK_REDEEM_ABI);
    const amounts = negRiskAmounts(indexSet, amountWei);
    const innerCalldata = iface.encodeFunctionData("redeemPositions", [
      conditionId,
      amounts,
    ]);

    if (predictAccount) {
      const kernel = new Contract(predictAccount, KERNEL_EXECUTE_ABI, signer);
      const payload = encodeKernelExecutePayload(adapterAddress, innerCalldata);
      const tx = await kernel.execute(EXECUTION_MODE, payload);
      const receipt = await tx.wait(1);
      if (receipt?.status !== 1) throw new Error("Redeem transaction failed");
      return receipt.transactionHash as string;
    }

    const adapter = new Contract(adapterAddress, NEG_RISK_REDEEM_ABI, signer);
    const tx = await adapter.redeemPositions(conditionId, amounts);
    const receipt = await tx.wait(1);
    if (receipt?.status !== 1) throw new Error("Redeem transaction failed");
    return receipt.transactionHash as string;
  }

  const ctfAddress = predictFunConditionalTokensAddress(chainId, {
    isNegRisk: false,
    isYieldBearing,
  });
  const indexSets = [BigNumber.from(indexSet)];
  const iface = new utils.Interface(CTF_REDEEM_ABI);
  const innerCalldata = iface.encodeFunctionData("redeemPositions", [
    addresses.USDT,
    ZERO_HASH,
    conditionId,
    indexSets,
  ]);

  if (predictAccount) {
    const kernel = new Contract(predictAccount, KERNEL_EXECUTE_ABI, signer);
    const payload = encodeKernelExecutePayload(ctfAddress, innerCalldata);
    const tx = await kernel.execute(EXECUTION_MODE, payload);
    const receipt = await tx.wait(1);
    if (receipt?.status !== 1) throw new Error("Redeem transaction failed");
    return receipt.transactionHash as string;
  }

  const ctf = new Contract(ctfAddress, CTF_REDEEM_ABI, signer);
  const tx = await ctf.redeemPositions(
    addresses.USDT,
    ZERO_HASH,
    conditionId,
    indexSets
  );
  const receipt = await tx.wait(1);
  if (receipt?.status !== 1) throw new Error("Redeem transaction failed");
  return receipt.transactionHash as string;
}
