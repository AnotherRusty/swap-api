import { Connection, PublicKey } from "@solana/web3.js";

export const RPC_ENDPOINT = process.env.RPC_ENDPOINT || "";
export const RPC_WEBSOCKET_ENDPOINT = process.env.RPC_WEBSOCKET_ENDPOINT || "";
export const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment: "confirmed"
});

export const GLOBAL_MINT = new PublicKey(process.env.GLOBAL_MINT || "");
export const jito_fee: any = process.env.JITO_FEE; // 0.00009 SOL
