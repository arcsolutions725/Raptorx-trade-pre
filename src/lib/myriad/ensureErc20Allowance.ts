import { BigNumber, Contract, constants, utils } from "ethers";
import type { providers } from "ethers";

const ERC20_MIN_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

/** Convert human collateral (e.g. 1.5 USD1) to wei using token decimals. */
export function myriadHumanCollateralToWei(human: number, decimals: number): BigNumber {
  if (!Number.isFinite(human) || human <= 0) return BigNumber.from(0);
  const d = Math.min(18, Math.max(0, Math.floor(decimals)));
  return utils.parseUnits(human.toFixed(d), d);
}

/**
 * If allowance for `spender` is below `minAmountWei`, submit `approve(spender, MaxUint256)` and wait.
 * Myriad AMM buys pull collateral via transferFrom on the market’s ERC20 (e.g. USD1).
 */
export async function ensureErc20AllowanceForSpender(
  signer: providers.JsonRpcSigner,
  tokenAddress: string,
  spender: string,
  minAmountWei: BigNumber
): Promise<void> {
  if (!utils.isAddress(tokenAddress) || !utils.isAddress(spender)) return;
  if (minAmountWei.lte(0)) return;

  const erc20 = new Contract(tokenAddress, ERC20_MIN_ABI, signer);
  const owner = await signer.getAddress();
  const current: BigNumber = await erc20.allowance(owner, spender);
  if (current.gte(minAmountWei)) return;

  const tx = await erc20.approve(spender, constants.MaxUint256);
  await tx.wait(1);
}
