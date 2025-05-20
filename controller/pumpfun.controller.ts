import { Request, Response } from "express";
import expressAsyncHandler from "express-async-handler";
import wallets from "../wallets.json";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { pumpfunSwap } from "../lib/pumpfun/pumpfun";

interface Body {
    tokenMint: string,
    amount: number,
    walletNum: number,
    sells: Array<number>;
}

export const swap = async (req: Request, res: Response) => {
    try {
        console.log("PumpFun Swap Start");
        const { tokenMint, amount, walletNum, sells }: Body = req.body;
        console.log("body", req.body)
        const wallet = Keypair.fromSecretKey(bs58.decode(wallets[walletNum]))
        console.log("Executor Wallet Address:", wallet.publicKey.toBase58())

        // const result = await pumpfunSwap(wallet, new PublicKey(tokenMint), amount, sells);
        const result = await pumpfunSwap(wallet, new PublicKey(tokenMint), amount, [30, 70]);

        res.status(200).json({ success: true, msg: "succesfully swapped", tx: result })
    } catch (error) {
        res.status(500).json({ success: false, msg: error})
    }
}