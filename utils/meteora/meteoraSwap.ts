import { ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { swap } from "./swap";
import * as spl from "@solana/spl-token";
import { getTokenProgramId } from "../pumpswap/utils";
import { connection } from "../../config";
import { getSPLTokenBalance } from "./checkBalance";
import { sleep } from "../pumpfun/src/util";

export const meteoraSwap = async (wallet: Keypair, tokenMint: string, amount: number, sells: number[], poolId: string) => {
    try {
        console.log("Meteora Swap Start");
        const tokenProgramId = await getTokenProgramId(new PublicKey(tokenMint));

        // Create the associated token account if it doesn't exist
        const TokenATA = await spl.getAssociatedTokenAddress(
            new PublicKey(tokenMint),
            wallet.publicKey,
            false,
            tokenProgramId,
            spl.ASSOCIATED_TOKEN_PROGRAM_ID
        );
        const QuoteATA = await spl.getAssociatedTokenAddress(
            spl.NATIVE_MINT,
            wallet.publicKey,
            false,
            tokenProgramId,
            spl.ASSOCIATED_TOKEN_PROGRAM_ID
        );
        const createTokenBaseAta =
            spl.createAssociatedTokenAccountIdempotentInstruction(
                wallet.publicKey,
                TokenATA,
                wallet.publicKey,
                new PublicKey(tokenMint),
                tokenProgramId,
                spl.ASSOCIATED_TOKEN_PROGRAM_ID
            );
        const createTokenQuoteAta =
            spl.createAssociatedTokenAccountIdempotentInstruction(
                wallet.publicKey,
                QuoteATA,
                wallet.publicKey,
                spl.NATIVE_MINT,
                tokenProgramId,
                spl.ASSOCIATED_TOKEN_PROGRAM_ID
            );
        
        let signatures: string[] = [];
        const transaction = new Transaction();
        const updateCpIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 });
        const updateCuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 });
        const buyIx = await swap(wallet, "buy", tokenMint, poolId, amount, 2.0);
        console.log("buyIx-->", buyIx);
        transaction.add(updateCpIx, updateCuIx, createTokenBaseAta,createTokenQuoteAta, buyIx[buyIx.length-2]);
        transaction.feePayer = wallet.publicKey;

        const blockhash = await connection.getLatestBlockhash();
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        transaction.sign(wallet);
        const sTx = transaction.serialize();
        console.log("Simulation-->", await connection.simulateTransaction(transaction))
        const signature = await connection.sendRawTransaction(
            sTx,
            {
                preflightCommitment: 'confirmed',
                skipPreflight: false
            }
        );
        const res = await connection.confirmTransaction({
            signature,
            blockhash: blockhash.blockhash,
            lastValidBlockHeight: blockhash.lastValidBlockHeight
        })
        console.log("signature", signature)
        signatures.push(signature);
        await sleep(1000);
        const amountOut = await getSPLTokenBalance(
            connection,
            new PublicKey(tokenMint),
            wallet.publicKey
        )
        for (let index = 0; index < sells.length; index++) {
            const element = sells[index];
            const sellIx = await swap(wallet, "sell", tokenMint, poolId, amountOut, element);
            console.log("sellIx-->", sellIx);
            const transaction = new Transaction().add(updateCpIx, updateCuIx ,sellIx[1]);
            transaction.feePayer = wallet.publicKey;
            const blockhash = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash.blockhash;
            transaction.sign(wallet);
            const sTx = transaction.serialize();
            console.log(await connection.simulateTransaction(transaction))
            const signature = await connection.sendRawTransaction(
                sTx,
                {
                    preflightCommitment: 'confirmed',
                    skipPreflight: false
                }
            );
            const res = await connection.confirmTransaction({
                signature,
                blockhash: blockhash.blockhash,
                lastValidBlockHeight: blockhash.lastValidBlockHeight
            })
            signatures.push(signature);
        }
        return signatures;
    } catch (error) {
        console.log("Error in meteoraSwap:", error);
        throw new Error("Meteora Swap failed");
    }
}