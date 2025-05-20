import { ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { PumpFunSDK } from "./src/pumpfun";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { connection, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT } from "../../config";
import { AnchorProvider } from "@coral-xyz/anchor";

const commitment = "confirmed"

let sdk = new PumpFunSDK(new AnchorProvider(connection, new NodeWallet(new Keypair()), { commitment }));

export const pumpfunSwap = async (wallet: Keypair, tokenMint: PublicKey, amount: number, sells: number[]) => {
    try {
        console.log("PumpFun Swap Start");
        const solBalance = await connection.getBalance(wallet.publicKey);
        if (solBalance < amount * Math.pow(10, 9) + 8 * Math.pow(10, 6)) {
            console.log("Sol balance is not enough.")
            throw new Error("Sol balance is not enough.")
        }
        let signatures: string[] = [];
        let buySolAmount = Math.floor(amount * Math.pow(10, 9));
        console.log(`Balance: ${solBalance / 10 ** 9} BuyAmount: ${buySolAmount}`);
        const transaction = new Transaction();
        const updateCpIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_00_000 });
        const updateCuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 });

        const { buyTokenAmount, buyIx } = await sdk.getBuyInstructionsBySolAmount(wallet.publicKey, tokenMint, BigInt(buySolAmount), 0);
        console.log("buyIx", buyIx, "buyTokenAmount", buyTokenAmount);
        
        transaction.add(updateCpIx, updateCuIx, ...buyIx);
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
        for (let index = 1; index < sells.length; index++) {
            console.log("sells[index]", sells[index]);
            const element = sells[index];
            const sellTokenAmount = BigInt(Math.floor(Number(buyTokenAmount) * element / 100));
            const sellIx = await sdk.getSellInstructionsByTokenAmount(
                wallet.publicKey,
                tokenMint,
                sellTokenAmount,
                BigInt(500),
                "finalized"
            )
            const transaction = new Transaction().add(updateCuIx, updateCpIx, sellIx);
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
        console.log("Error in pumpfunSwap", error);
        throw new Error("Error in pumpfunSwap");
    }

}