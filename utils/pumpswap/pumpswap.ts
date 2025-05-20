import { ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import PumpSwapSDK from "./PumpSwapSDK";
import { PROTOCOL_FEE_RECIPIENT_MAINNET, isMainnet } from "./constants";
import { connection } from "../../config";
import { BN } from "bn.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as spl from "@solana/spl-token";
import { getTokenProgramId } from "./utils";
import { PumpAmmSdk, Direction } from "@pump-fun/pump-swap-sdk";

const pumpAmmSDK = new PumpAmmSdk(connection);

export const pumpSwap = async (wallet: Keypair, tokenMint: PublicKey, amount: number, sells: number[]) => {
    try {
        console.log("PumpSwap Start");
        console.log("sells-->", sells[0])
        const pumpSwap = new PumpSwapSDK(isMainnet ? "mainnet" : "devnet", "confirmed");
        const pool = await pumpSwap.getPumpSwapPool(tokenMint);
        if (!pool) {
            console.log("Pool not found");
            throw new Error("Pool not found");
        }
        console.log("Pool", pool);
        // Get the token program ID for the non-WSOL token
        const tokenProgramId = await getTokenProgramId(tokenMint);
        console.log("TokenProgramId", tokenProgramId.toBase58());
        // Get the token ATA with the correct program ID
        const TokenATA = await spl.getAssociatedTokenAddress(
            tokenMint,
            wallet.publicKey,
            false,
            tokenProgramId,
            spl.ASSOCIATED_TOKEN_PROGRAM_ID
        );
        console.log("TokenATA", TokenATA.toBase58());
        const QuoteATA = await spl.getAssociatedTokenAddress(
            NATIVE_MINT,
            wallet.publicKey,
            false,
            tokenProgramId,
            spl.ASSOCIATED_TOKEN_PROGRAM_ID
        );
        // Create ATA instructions with correct program IDs
        const createTokenBaseAta =
            spl.createAssociatedTokenAccountIdempotentInstruction(
                wallet.publicKey,
                TokenATA,
                wallet.publicKey,
                tokenMint,
                tokenProgramId,
                spl.ASSOCIATED_TOKEN_PROGRAM_ID
            );
        const createTokenQuoteAta =
            spl.createAssociatedTokenAccountIdempotentInstruction(
                wallet.publicKey,
                QuoteATA,
                wallet.publicKey,
                NATIVE_MINT,
                tokenProgramId,
                spl.ASSOCIATED_TOKEN_PROGRAM_ID
            );

        const quote_amt = new BN(amount * LAMPORTS_PER_SOL);
        const base_amt = await pumpAmmSDK.swapAutocompleteBaseFromQuote(
            pool,
            quote_amt,
            2.0,
            "quoteToBase" as Direction,
        )
        console.log("base_amt", base_amt.toString());
        const buyIx = await pumpAmmSDK.swapBaseInstructions(
            pool,
            base_amt,
            2.0,
            "quoteToBase" as Direction,
            wallet.publicKey,
            PROTOCOL_FEE_RECIPIENT_MAINNET,
            TokenATA,
            QuoteATA,
        );
        console.log("buyIx numbers-->", buyIx.length);
        console.log("buyIx", buyIx);

        let signatures: string[] = [];

        const transaction = new Transaction();
        const updateCpIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 });
        const updateCuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 });
        transaction.add(updateCuIx, updateCpIx, createTokenBaseAta, createTokenQuoteAta, buyIx[2]);
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
        console.log("PumpSwap Success", signature);
        signatures.push(signature);
        for (let index = 0; index < sells.length; index++) {
            console.log("sells[index]", sells[index]);
            const element = sells[index];
            const sellAmount = Math.floor(Number(base_amt) * element / 100);
            const sellIx = await pumpAmmSDK.swapBaseInstructions(
                pool,
                new BN(sellAmount),
                2.0,
                "baseToQuote" as Direction,
                wallet.publicKey,
                PROTOCOL_FEE_RECIPIENT_MAINNET,
                TokenATA,
                QuoteATA,
            );
            console.log("sellIx", sellIx, sellIx.length);
            const transaction = new Transaction();

            transaction.add(updateCuIx, updateCpIx, sellIx[0]);

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
            console.log("PumpSwap Success", signature);
            signatures.push(signature);
        }
        // Transfer enough SOL to wrap as WSOL

        return signatures;
    } catch (error) {
        console.log("Error in pumpSwap", error);
        throw new Error("Error in pumpSwap");
    }
}