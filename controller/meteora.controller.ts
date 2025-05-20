import { Request, Response } from "express";
import wallets from "../wallets.json";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { meteoraSwap } from "../lib/meteora/meteoraSwap";

interface Body {
    tokenMint: string,
    amount: number,
    walletNum: number,
    sells: Array<number>,
    poolId: string,
}

export const swap = async (req: Request, res: Response) => {
    try {
        console.log("Meteora Swap Start");
        const { tokenMint, amount, walletNum, sells, poolId }: Body = req.body;
        console.log("body", req.body)
        const wallet = Keypair.fromSecretKey(bs58.decode(wallets[walletNum]))
        console.log("Executor Wallet Address:", wallet.publicKey.toBase58())
        const result = await meteoraSwap(wallet, tokenMint, amount, [30,70], poolId);

        res.status(200).json({ success: true, msg: "succesfully swapped", tx: result })
    } catch (error) {
        res.status(500).json({ success: false, msg: error})
    }
}