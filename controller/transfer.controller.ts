import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Request, Response } from "express";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { NATIVE_MINT, createAssociatedTokenAccountInstruction, createCloseAccountInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { connection } from "../config";

export const solTransfer = async (req: Request, res: Response) => {
    try {
        const { from, to } = req.body;
        if (!from || !to) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        const fromWallet = Keypair.fromSecretKey(bs58.decode(from));
        const toWallet = new PublicKey(to);

        const wsolFromAta = getAssociatedTokenAddressSync(NATIVE_MINT, fromWallet.publicKey);
        const wsolToAta = getAssociatedTokenAddressSync(NATIVE_MINT, toWallet);
        const wsolToAtaInfo = await connection.getAccountInfo(wsolToAta);

        const solBalance = await connection.getBalance(fromWallet.publicKey);
        const wsolBalance = ((await connection.getTokenAccountBalance(wsolFromAta)).value.amount);

        const units = 1_000_000
        const microLamports = 1_000_000

        const solAmount = solBalance - units - 5000;

        const tx = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitLimit({ units }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
        )
        if (!wsolToAtaInfo) {
            tx.add(createAssociatedTokenAccountInstruction(fromWallet.publicKey, wsolToAta, toWallet, NATIVE_MINT));
        }
        tx.add(createTransferCheckedInstruction(wsolFromAta, NATIVE_MINT, wsolToAta, fromWallet.publicKey, BigInt(wsolBalance), 9, [fromWallet]),
            createCloseAccountInstruction(wsolFromAta, fromWallet.publicKey, fromWallet.publicKey));
        tx.add(SystemProgram.transfer({
            fromPubkey: fromWallet.publicKey,
            toPubkey: toWallet,
            lamports: solAmount,
        }))

        tx.feePayer = fromWallet.publicKey
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
        console.log(await connection.simulateTransaction(tx))
        const sig = await sendAndConfirmTransaction(connection, tx, [fromWallet], { commitment: "confirmed" })
        console.log("Transaction signature: ", sig)

        return res.status(200).json({ message: "Gathering..." });
    } catch (error) {
        console.error("Error in gather controller:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}