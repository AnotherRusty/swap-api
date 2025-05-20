import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  getMint,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import {
  Keypair,
  Connection,
  PublicKey,
  SystemProgram,
  VersionedTransaction,
  TransactionMessage,
  Commitment,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import base58 from "bs58";
import { getSwapTx } from "./amm";
import axios from "axios";
import { connection } from "../../config";
import { PoolKeys } from "./getPoolKeys";
import {
  ApiPoolInfoV4,
  Liquidity,
  LIQUIDITY_STATE_LAYOUT_V4,
  Percent,
  Token,
  TokenAccount,
  TokenAmount,
} from "@raydium-io/raydium-sdk";
import { getBuyTx } from "./swapOnlyAmm";
import BN from "bn.js";

const JITO_FEE = 0.0001;
export const executeJitoTx = async (
  transactions: VersionedTransaction[],
  commitment: Commitment
) => {
  try {
    let latestBlockhash = await connection.getLatestBlockhash();

    const jitoTxsignature = base58.encode(transactions[0].signatures[0]);

    // Serialize the transactions once here
    const serializedTransactions: string[] = [];
    for (let i = 0; i < transactions.length; i++) {
      const serializedTransaction = base58.encode(transactions[i].serialize());
      serializedTransactions.push(serializedTransaction);
    }

    const endpoints = [
      // 'https://mainnet.block-engine.jito.wtf/api/v1/bundles',
      // 'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles',
      // 'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',
      "https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles",
      "https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles",
    ];

    const requests = endpoints.map((url) =>
      axios.post(url, {
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [serializedTransactions],
      })
    );

    console.log("Sending transactions to endpoints...");

    const results = await Promise.all(requests.map((p) => p.catch((e) => e)));

    const successfulResults = results.filter(
      (result) => !(result instanceof Error)
    );

    if (successfulResults.length > 0) {
      console.log("Waiting for response");
      const confirmation = await connection.confirmTransaction(
        {
          signature: jitoTxsignature,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          blockhash: latestBlockhash.blockhash,
        },
        commitment
      );

      if (confirmation.value.err) {
        console.log("Confirmtaion error");
        return null;
      } else {
        return jitoTxsignature;
      }
    } else {
      console.log(`No successful responses received for jito`);
    }
    return null;
  } catch (error) {
    console.log("Error during transaction execution", error);
    return null;
  }
};

const jitoFeeIx = (wallet: Keypair) => {
  const tipAccounts = [
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  ];
  const jitoFeeWallet = new PublicKey(
    tipAccounts[Math.floor(tipAccounts.length * Math.random())]
  );

  return SystemProgram.transfer({
    fromPubkey: wallet.publicKey,
    toPubkey: jitoFeeWallet,
    lamports: Math.floor(JITO_FEE * 10 ** 9),
  });
};

const swapExactOut = async (
  wallet: Keypair,
  tokenMint: PublicKey,
  amountOut: TokenAmount,
  poolId: PublicKey
) => {
  let solBalance: number = 0;
  try {
    solBalance = await connection.getBalance(wallet.publicKey);
  } catch (error) {
    console.log("Error getting balance of wallet");
    return null;
  }
  if (solBalance == 0) {
    return null;
  }

  const swapSide = "out";
  const buyTx = await getSwapTx(
    connection,
    wallet,
    NATIVE_MINT,
    tokenMint,
    amountOut,
    poolId.toBase58(),
    swapSide
  );
  if (buyTx == null) {
    console.log(`Error getting buy transaction`);
    return null;
  }
  return buyTx;
};

const swapExactIn = async (
  wallet: Keypair,
  tokenMint: PublicKey,
  amountOut: TokenAmount,
  poolId: PublicKey
) => {
  let solBalance: number = 0;
  try {
    solBalance = await connection.getBalance(wallet.publicKey);
  } catch (error) {
    console.log("Error getting balance of wallet");
    return null;
  }
  if (solBalance == 0) {
    return null;
  }

  const swapSide = "in";
  const sellTx = await getSwapTx(
    connection,
    wallet,
    NATIVE_MINT,
    tokenMint,
    amountOut,
    poolId.toBase58(),
    swapSide
  );
  if (sellTx == null) {
    console.log(`Error getting buy transaction`);
    return null;
  }
  return sellTx;
};

export const ammBundleSwap = async (
  wallet: Keypair,
  tokenMint: PublicKey,
  poolId: PublicKey,
  amount: number,
  sells: Array<number>
) => {
  const poolKeys = await PoolKeys.fetchPoolKeyInfo(connection, poolId);
  const tokenAta = getAssociatedTokenAddressSync(tokenMint, wallet.publicKey);
  const tokenAtaInfo = await connection.getAccountInfo(tokenAta);
  if (!tokenAtaInfo) {
    const transaction = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        tokenAta,
        wallet.publicKey,
        tokenMint
      )
    );
    const latestBlockhash = await connection.getLatestBlockhash();

    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.sign(wallet);
    const sig = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      { commitment: "confirmed" }
    );
    console.log("Ata Creation", sig);
  }

  const transactions: VersionedTransaction[] = [];
  const latestBlockhash = await connection.getLatestBlockhash();
  const jitoFeeTx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [jitoFeeIx(wallet)],
    }).compileToV0Message()
  );
  jitoFeeTx.sign([wallet]);
  transactions.push(jitoFeeTx);

  const quoteInfo = await getMint(connection, tokenMint);
  if (quoteInfo == null) {
    return null;
  }

  const quoteDecimal = quoteInfo.decimals;
  const inputToken = new Token(TOKEN_PROGRAM_ID, NATIVE_MINT, 9);
  const outputToken = new Token(TOKEN_PROGRAM_ID, tokenMint, quoteDecimal);

  const inputTokenAmount = new TokenAmount(
    inputToken,
    Math.floor(amount * 10 ** 9)
  );
  const outputTokenAmount = new TokenAmount(
    outputToken,
    Math.floor(amount * 10 ** quoteDecimal)
  );
  const slippage = new Percent(100, 100);
  let poolInfo;
  try {
    console.log({poolKeys})
    poolInfo = await Liquidity.fetchInfo({ connection: connection, poolKeys });
    console.log("Pool information", { poolInfo });
  } catch (error) {
    console.log("==================>",error);
  }
  const { amountOut, minAmountOut } = Liquidity.computeAmountOut({
    poolKeys: poolKeys,
    poolInfo: poolInfo!,
    amountIn: inputTokenAmount,
    currencyOut: outputToken,
    slippage: slippage,
  });

  const buyTx = await getSwapTx(
    connection,
    wallet,
    NATIVE_MINT,
    tokenMint,
    amountOut as TokenAmount,
    poolId.toBase58(),
    "out"
  );

  if (buyTx) transactions.push(buyTx);

  console.log({ sells });
  const sellTxPromises = sells.map(async (sell: number) => {
    const numerator: any = Math.floor(
      ((amountOut.numerator as any) / 100) * sell
    );
    const amount = new TokenAmount(outputToken, numerator);
    return await getSwapTx(
      connection,
      wallet,
      NATIVE_MINT,
      tokenMint,
      amount as TokenAmount,
      poolKeys.id.toBase58(),
      "in"
    );
  });

  // Await all Promises and filter out nulls/undefined
  const resolvedSellTxs = (await Promise.all(sellTxPromises)).filter(
    (tx) => tx != null
  );

  // If there are valid transactions, add them
  if (resolvedSellTxs.length) {
    transactions.push(...resolvedSellTxs);
  }

  transactions.map(async (tx, index) => {
    console.log(
      index,
      await connection.simulateTransaction(tx, { sigVerify: true })
    );
  });

  const confirmResult = await executeJitoTx(transactions, "confirmed");
  return confirmResult;
};
