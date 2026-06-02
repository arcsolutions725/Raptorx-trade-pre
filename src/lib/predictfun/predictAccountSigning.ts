import { utils, type providers } from "ethers";
import type { PredictFunChainId } from "@/lib/predictfun/orderEip712";

const ECDSA_VALIDATOR = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57";

const KERNEL_DOMAIN_BY_CHAIN: Record<
  PredictFunChainId,
  { name: string; version: string; chainId: number }
> = {
  56: { name: "Kernel", version: "0.3.1", chainId: 56 },
  97: { name: "Kernel", version: "0.3.1", chainId: 97 },
};

function hashKernelMessage(messageHash: string): string {
  const codec = new utils.AbiCoder();
  const kernelTypeHash = utils.keccak256(
    utils.hexlify(utils.toUtf8Bytes("Kernel(bytes32 hash)"))
  );
  return utils.keccak256(
    codec.encode(["bytes32", "bytes32"], [kernelTypeHash, messageHash])
  );
}

function eip712WrapHash(
  messageHash: string,
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  }
): string {
  const domainSeparator = utils._TypedDataEncoder.hashDomain(domain);
  const finalMessageHash = hashKernelMessage(messageHash);
  return utils.keccak256(
    utils.concat(["0x1901", domainSeparator, finalMessageHash])
  );
}

/** Auth message signature for Predict.fun smart-wallet (Predict Account) users. */
export async function signPredictFunAccountAuthMessage(
  signer: providers.JsonRpcSigner,
  predictAccount: string,
  chainId: PredictFunChainId,
  message: string
): Promise<string> {
  const kernelDomain = KERNEL_DOMAIN_BY_CHAIN[chainId];
  const messageHash = utils.hashMessage(message);
  const digest = eip712WrapHash(messageHash, {
    ...kernelDomain,
    verifyingContract: utils.getAddress(predictAccount),
  });
  const digestBytes = utils.arrayify(digest);
  const signedMessage = await signer.signMessage(digestBytes);
  return utils.hexConcat(["0x01", ECDSA_VALIDATOR, signedMessage]);
}

/** Order typed-data signature for Predict Account (raw EIP-712 hash). */
export async function signPredictFunAccountOrderHash(
  signer: providers.JsonRpcSigner,
  predictAccount: string,
  chainId: PredictFunChainId,
  typedDataHash: string
): Promise<string> {
  const kernelDomain = KERNEL_DOMAIN_BY_CHAIN[chainId];
  const digest = eip712WrapHash(typedDataHash, {
    ...kernelDomain,
    verifyingContract: utils.getAddress(predictAccount),
  });
  const digestBytes = utils.arrayify(digest);
  const signedMessage = await signer.signMessage(digestBytes);
  return utils.hexConcat(["0x01", ECDSA_VALIDATOR, signedMessage]);
}

export function isPredictFunPredictAccount(
  walletAddress: string,
  predictAccountAddress: string | null | undefined
): boolean {
  if (!predictAccountAddress) return false;
  try {
    return (
      utils.getAddress(walletAddress).toLowerCase() !==
      utils.getAddress(predictAccountAddress).toLowerCase()
    );
  } catch {
    return false;
  }
}
