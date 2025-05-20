import { Request, Response } from "express";
import expressAsyncHandler from "express-async-handler";
import { ammBundleSwap } from "../lib/raydium/raydium-swap";
import wallets from "../wallets.json";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

interface Body {
  tokenMint: string;
  poolId: string;
  amount: number;
  walletNum: number;
  sells: Array<number>;
}

export const swapAmm = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const { tokenMint, poolId, amount, walletNum, sells }: Body = req.body;
    if (sells.length > 3) {
      res.status(400).json({
        success: false,
        msg: "The the length of sells should below 3",
      });
    }

    const wallet = Keypair.fromSecretKey(bs58.decode(wallets[walletNum]));
    console.log("Executor Wallet Address:", wallet.publicKey.toBase58());

    const result = await ammBundleSwap(
      wallet,
      new PublicKey(tokenMint),
      new PublicKey(poolId),
      amount,
      sells
    );

    if (result)
      res.status(200).json({ success: true, msg: "succesfully swapped", tx: result });
    else res.status(500).json({ success: false, msg: "Swap failed" });
  }
);
