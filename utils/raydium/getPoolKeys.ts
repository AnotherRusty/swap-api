import {
  LIQUIDITY_STATE_LAYOUT_V4,
  Liquidity,
  LiquidityPoolKeysV4,
  MARKET_STATE_LAYOUT_V3,
  Market,
} from "@raydium-io/raydium-sdk";
import { Commitment, Connection, PublicKey } from "@solana/web3.js";

export class PoolKeys {
  static SOLANA_ADDRESS = "So11111111111111111111111111111111111111112";
  static RAYDIUM_POOL_V4_PROGRAM_ID =
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
  static OPENBOOK_ADDRESS = "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX";
  static SOL_DECIMALS = 9;

  static async getPoolData(connection: Connection, poolId: PublicKey) {
    try {
      // Fetch the pool info from Raydium
      const poolInfo = await connection.getAccountInfo(poolId);

      if (!poolInfo) {
        throw new Error("Pool not found");
      }

      console.log(poolInfo)

      // Decode the pool data
      const decoded = LIQUIDITY_STATE_LAYOUT_V4.decode(poolInfo.data);

      return decoded;
    } catch (error) {
      console.error("Error getting market ID:", error);
      throw error;
    }
  }
  static async fetchMarketId(
    connection: Connection,
    baseMint: PublicKey,
    quoteMint: PublicKey,
    commitment: Commitment
  ) {
    let accounts = await connection.getProgramAccounts(
      new PublicKey("srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX"),
      {
        commitment,
        filters: [
          { dataSize: MARKET_STATE_LAYOUT_V3.span },
          {
            memcmp: {
              offset: MARKET_STATE_LAYOUT_V3.offsetOf("baseMint"),
              bytes: baseMint.toBase58(),
            },
          },
          {
            memcmp: {
              offset: MARKET_STATE_LAYOUT_V3.offsetOf("quoteMint"),
              bytes: quoteMint.toBase58(),
            },
          },
        ],
      }
    );
    if (!accounts)
      accounts = await connection.getProgramAccounts(
        new PublicKey("srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX"),
        {
          commitment,
          filters: [
            { dataSize: MARKET_STATE_LAYOUT_V3.span },
            {
              memcmp: {
                offset: MARKET_STATE_LAYOUT_V3.offsetOf("quoteMint"),
                bytes: baseMint.toBase58(),
              },
            },
            {
              memcmp: {
                offset: MARKET_STATE_LAYOUT_V3.offsetOf("baseMint"),
                bytes: quoteMint.toBase58(),
              },
            },
          ],
        }
      );
    console.log({ accounts });
    return accounts.map(({ account }) =>
      MARKET_STATE_LAYOUT_V3.decode(account.data)
    )[0].ownAddress;
  }

  static async fetchMarketInfo(connection: Connection, marketId: PublicKey) {
    const marketAccountInfo = await connection.getAccountInfo(
      marketId,
      "processed"
    );
    if (!marketAccountInfo) {
      throw new Error(
        "Failed to fetch market info for market id " + marketId.toBase58()
      );
    }

    return MARKET_STATE_LAYOUT_V3.decode(marketAccountInfo.data);
  }

  static async generateV4PoolInfo(
    baseMint: PublicKey,
    quoteMint: PublicKey,
    marketID: PublicKey
  ) {
    const poolInfo = Liquidity.getAssociatedPoolKeys({
      version: 4,
      marketVersion: 3,
      baseMint: baseMint,
      quoteMint: quoteMint,
      baseDecimals: 0,
      quoteDecimals: this.SOL_DECIMALS,
      programId: new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"),
      marketId: marketID,
      marketProgramId: new PublicKey(
        "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX"
      ),
    });

    return { poolInfo };
  }

  static async fetchPoolKeyInfo(
    connection: Connection,
    poolId: PublicKey
  ): Promise<LiquidityPoolKeysV4> {
    const {
      marketId,
      baseMint,
      quoteMint,
      lpMint,
      baseDecimal,
      quoteDecimal,
      openOrders,
      targetOrders,
      baseVault,
      quoteVault,
      owner,
      withdrawQueue,
      lpVault,
      marketProgramId
    } = await this.getPoolData(connection, poolId);
    console.log("Market Id:", marketId.toBase58());

    const marketInfo = await this.fetchMarketInfo(connection, marketId);
    const lpMintInfo = (await connection.getParsedAccountInfo(
      lpMint,
      "confirmed"
    )) as MintInfo;

    return {
      id: poolId,
      baseMint: baseMint,
      quoteMint: quoteMint,
      lpMint: lpMint,
      baseDecimals: Number(baseDecimal),
      quoteDecimals: Number(quoteDecimal),
      lpDecimals: lpMintInfo.value.data.parsed.info.decimals,
      version: 4 as any,
      programId: new PublicKey(this.RAYDIUM_POOL_V4_PROGRAM_ID),
      authority: new PublicKey("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"),
      openOrders,
      targetOrders,
      baseVault,
      quoteVault,
      withdrawQueue,
      lpVault,
      marketVersion: 3 as any,
      marketProgramId,
      marketId,
      marketAuthority: Market.getAssociatedAuthority({
        programId: new PublicKey(this.OPENBOOK_ADDRESS),
        marketId,
      }).publicKey,
      marketBaseVault: marketInfo.baseVault,
      marketQuoteVault: marketInfo.quoteVault,
      marketBids: marketInfo.bids,
      marketAsks: marketInfo.asks,
      marketEventQueue: marketInfo.eventQueue,
      lookupTableAccount: PublicKey.default,
    };
  }
}

interface MintInfo {
  value: {
    data: {
      parsed: {
        info: {
          decimals: number;
        };
      };
    };
  };
}
