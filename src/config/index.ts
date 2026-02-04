import { Configuration } from "kalshi-typescript";

export const kalshiConfig = new Configuration({
  apiKey: process.env.KALSHI_API_KEY,
  privateKeyPem: process.env.KALSHI_PRIVATE_KEY,
});
