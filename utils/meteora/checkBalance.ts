import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";

export async function getSPLTokenBalance(connection:Connection, tokenAccount:PublicKey, payerPubKey:PublicKey) {
    const address = getAssociatedTokenAddressSync(tokenAccount, payerPubKey);
    const info = await connection.getTokenAccountBalance(address);
    if (info.value.uiAmount == null) throw new Error("No balance found");
    return info.value.uiAmount;
  }