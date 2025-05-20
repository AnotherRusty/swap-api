import assert from "assert";

import {
  jsonInfo2PoolKeys,
  Liquidity,
  LiquidityPoolKeys,
  Percent,
  Token,
  TokenAmount,
  ApiPoolInfoV4,
  LIQUIDITY_STATE_LAYOUT_V4,
  MARKET_STATE_LAYOUT_V3,
  Market,
  SPL_MINT_LAYOUT,
  SPL_ACCOUNT_LAYOUT,
  TokenAccount,
  SwapSide,
} from "@raydium-io/raydium-sdk";

import {
  PublicKey,
  Keypair,
  Connection,
  VersionedTransaction,
  TransactionMessage,
} from "@solana/web3.js";

import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getMint,
} from "@solana/spl-token";
import { getBuyTxWithJupiter } from "./swapOnlyAmm";

type WalletTokenAccounts = Awaited<ReturnType<typeof getWalletTokenAccount>>;
type TestTxInfo = {
  baseToken: Token;
  quoteToken: Token;
  targetPool: string;
  amount: TokenAmount;
  slippage: Percent;
  walletTokenAccounts: WalletTokenAccounts;
  wallet: Keypair;
  swapSide: SwapSide;
};

export async function getWalletTokenAccount(
  connection: Connection,
  wallet: PublicKey
): Promise<TokenAccount[]> {
  const walletTokenAccount = await connection.getTokenAccountsByOwner(wallet, {
    programId: TOKEN_PROGRAM_ID,
  });
  return walletTokenAccount.value.map((i: any) => ({
    pubkey: i.pubkey,
    programId: i.account.owner,
    accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
  }));
}

async function swapOnlyAmm(connection: Connection, input: TestTxInfo) {
  // -------- pre-action: get pool info --------
  const targetPoolInfo = await formatAmmKeysById(connection, input.targetPool);
  assert(targetPoolInfo, "cannot find the target pool");
  const poolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys;

  // -------- step 1: coumpute amount out --------
  const { amountOut, minAmountOut } = Liquidity.computeAmountOut({
    poolKeys: poolKeys,
    poolInfo: await Liquidity.fetchInfo({ connection, poolKeys }),
    amountIn: input.amount,
    currencyOut: input.quoteToken,
    slippage: input.slippage,
  });

  const { amountIn, maxAmountIn } = Liquidity.computeAmountIn({
    poolKeys: poolKeys,
    poolInfo: await Liquidity.fetchInfo({ connection, poolKeys }),
    amountOut: input.amount,
    currencyIn: input.quoteToken,
    slippage: input.slippage,
  });
  const baseAccount = await getAssociatedTokenAddress(
    input.baseToken.mint,
    input.wallet.publicKey,
    true,
    TOKEN_PROGRAM_ID
  );
  const quoteAccount = await getAssociatedTokenAddress(
    input.quoteToken.mint,
    input.wallet.publicKey,
    true,
    TOKEN_PROGRAM_ID
  );
  const userKeys = {
    tokenAccountIn: input.swapSide == "out" ? baseAccount : quoteAccount,
    tokenAccountOut: input.swapSide == "out" ? quoteAccount : baseAccount,
    owner: input.wallet.publicKey,
  };

  const { innerTransaction: swapOutTransaction } =
    Liquidity.makeSwapFixedOutInstruction(
      {
        poolKeys,
        userKeys,
        maxAmountIn: maxAmountIn.numerator,
        amountOut: input.amount.numerator,
      },
      4
    );

  const { innerTransaction: swapInTransaction } =
    Liquidity.makeSwapFixedInInstruction(
      {
        poolKeys,
        userKeys,
        amountIn: input.amount.numerator,
        minAmountOut: minAmountOut.numerator,
      },
      4
    );

  if (input.swapSide == "out") {
    return swapOutTransaction;
  } else return swapInTransaction;
}

export async function formatAmmKeysById(
  connection: Connection,
  id: string
): Promise<ApiPoolInfoV4> {
  const account = await connection.getAccountInfo(new PublicKey(id));
  if (account === null) throw Error(" get id info error ");
  const info = LIQUIDITY_STATE_LAYOUT_V4.decode(account.data);

  const marketId = info.marketId;
  const marketAccount = await connection.getAccountInfo(marketId);
  if (marketAccount === null) throw Error(" get market info error");
  const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);

  const lpMint = info.lpMint;
  const lpMintAccount = await connection.getAccountInfo(lpMint);
  if (lpMintAccount === null) throw Error(" get lp mint info error");
  const lpMintInfo = SPL_MINT_LAYOUT.decode(lpMintAccount.data);

  return {
    id,
    baseMint: info.baseMint.toString(),
    quoteMint: info.quoteMint.toString(),
    lpMint: info.lpMint.toString(),
    baseDecimals: info.baseDecimal.toNumber(),
    quoteDecimals: info.quoteDecimal.toNumber(),
    lpDecimals: lpMintInfo.decimals,
    version: 4,
    programId: account.owner.toString(),
    authority: Liquidity.getAssociatedAuthority({
      programId: account.owner,
    }).publicKey.toString(),
    openOrders: info.openOrders.toString(),
    targetOrders: info.targetOrders.toString(),
    baseVault: info.baseVault.toString(),
    quoteVault: info.quoteVault.toString(),
    withdrawQueue: info.withdrawQueue.toString(),
    lpVault: info.lpVault.toString(),
    marketVersion: 3,
    marketProgramId: info.marketProgramId.toString(),
    marketId: info.marketId.toString(),
    marketAuthority: Market.getAssociatedAuthority({
      programId: info.marketProgramId,
      marketId: info.marketId,
    }).publicKey.toString(),
    marketBaseVault: marketInfo.baseVault.toString(),
    marketQuoteVault: marketInfo.quoteVault.toString(),
    marketBids: marketInfo.bids.toString(),
    marketAsks: marketInfo.asks.toString(),
    marketEventQueue: marketInfo.eventQueue.toString(),
    lookupTableAccount: PublicKey.default.toString(),
  };
}

export async function getSwapTx(
  connection: Connection,
  wallet: Keypair,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  amount: TokenAmount,
  targetPool: string,
  swapSide: SwapSide
) {
  const quoteInfo = await getMint(connection, quoteMint);
  const baseInfo = await getMint(connection, baseMint);
  if (!quoteInfo || !baseInfo) {
    return null;
  }
  const quoteDecimals = quoteInfo.decimals;
  const baseDecimals = baseInfo.decimals;

  const baseToken = new Token(TOKEN_PROGRAM_ID, baseMint, baseDecimals);
  const quoteToken = new Token(TOKEN_PROGRAM_ID, quoteMint, quoteDecimals);

  const slippage = new Percent(100, 100);
  const walletTokenAccounts = await getWalletTokenAccount(
    connection,
    wallet.publicKey
  );

  const transaction = await swapOnlyAmm(connection, {
    baseToken,
    quoteToken,
    targetPool,
    amount,
    slippage,
    walletTokenAccounts,
    wallet: wallet,
    swapSide,
  });
  getBuyTxWithJupiter(wallet, baseToken.mint, Number(amount.numerator));

  const latestBlockhash = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: transaction.instructions,
  }).compileToV0Message([]);

  const tx = new VersionedTransaction(msg);
  tx.sign([wallet]);

  return tx;
}
