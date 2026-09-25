/**
 * AUTO-GENERATED — do not edit by hand.
 * Run `npm run generate` to regenerate from the compiled contract WASM.
 *
 * Contract: mux-spending-policy
 */

import {
  Address,
  Contract,
  Keypair,
  nativeToScVal,
  scValToNative,
  SorobanRpc,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import type { SpendingPolicyLimit } from "../types";
import { pollTransaction } from "../horizon";

export interface MuxSpendingPolicyClientOptions {
  contractId: string;
  networkPassphrase: string;
  rpcUrl: string;
}

/**
 * Relayer fee sponsorship limits (issue #847).
 *
 * A relayer may only sponsor fees up to `perTxLimit` per transaction and
 * `perWindowLimit` within `windowLedgers`. The contract is the source of
 * truth: `check_sponsorship` is simulate-only and fails closed, so callers
 * cannot bypass policy by skipping the client-side check.
 */
export interface RelayerSponsorshipLimit {
  relayer: string;
  perTxLimit: bigint;
  perWindowLimit: bigint;
  windowLedgers: number;
  /** Ledger at which the current window started; 0 when unset. */
  windowStartLedger: number;
  /** Amount already sponsored in the current window. */
  windowSpent: bigint;
}

/** Stable error codes returned by the contract for sponsorship failures. */
export const RelayerSponsorshipErrorCode = {
  Unauthorized: 1,
  RelayerNotRegistered: 2,
  PerTxLimitExceeded: 3,
  WindowLimitExceeded: 4,
  InvalidLimit: 5,
  ReplayedRequest: 6,
} as const;

export type RelayerSponsorshipErrorCode =
  (typeof RelayerSponsorshipErrorCode)[keyof typeof RelayerSponsorshipErrorCode];

export class MuxSpendingPolicyClient {
  private contract: Contract;
  private server: SorobanRpc.Server;
  private networkPassphrase: string;

  constructor(opts: MuxSpendingPolicyClientOptions) {
    this.contract = new Contract(opts.contractId);
    this.server = new SorobanRpc.Server(opts.rpcUrl, { allowHttp: false });
    this.networkPassphrase = opts.networkPassphrase;
  }

  async initialize(sourceKeypair: Keypair, admin: Address): Promise<void> {
    const tx = await this.buildTx(sourceKeypair, "initialize", [
      nativeToScVal(admin.toString(), { type: "address" }),
    ]);
    await this.submit(tx, sourceKeypair);
  }

  async setPolicy(
    sourceKeypair: Keypair,
    account: Address,
    asset: Address,
    limit: bigint
  ): Promise<void> {
    const tx = await this.buildTx(sourceKeypair, "set_policy", [
      nativeToScVal(account.toString(), { type: "address" }),
      nativeToScVal(asset.toString(), { type: "address" }),
      nativeToScVal(limit, { type: "i128" }),
    ]);
    await this.submit(tx, sourceKeypair);
  }

  async getPolicy(
    sourceKeypair: Keypair,
    account: Address,
    asset: Address
  ): Promise<SpendingPolicyLimit> {
    const tx = await this.buildTx(sourceKeypair, "get_policy", [
      nativeToScVal(account.toString(), { type: "address" }),
      nativeToScVal(asset.toString(), { type: "address" }),
    ]);
    return this.simulateRead<SpendingPolicyLimit>(tx);
  }

  /** Simulate-only: returns void if within limit, throws if exceeded or policy not found. */
  async checkSpend(
    sourceKeypair: Keypair,
    account: Address,
    asset: Address,
    amount: bigint
  ): Promise<void> {
    const tx = await this.buildTx(sourceKeypair, "check_spend", [
      nativeToScVal(account.toString(), { type: "address" }),
      nativeToScVal(asset.toString(), { type: "address" }),
      nativeToScVal(amount, { type: "i128" }),
    ]);
    const result = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(result)) {
      throw new Error(`check_spend failed: ${result.error}`);
    }
  }

  /**
   * Admin/owner-only: set the relayer fee sponsorship limits for `relayer`.
   * Deny-by-default — the contract enforces that the caller is the admin or an
   * authorized delegate; clients cannot bypass this by calling directly.
   */
  async setRelayerSponsorshipLimit(
    sourceKeypair: Keypair,
    relayer: Address,
    perTxLimit: bigint,
    perWindowLimit: bigint,
    windowLedgers: number
  ): Promise<void> {
    if (perTxLimit < 0n || perWindowLimit < 0n || windowLedgers <= 0) {
      throw new Error(
        `Invalid sponsorship limit (code ${RelayerSponsorshipErrorCode.InvalidLimit})`
      );
    }
    const tx = await this.buildTx(sourceKeypair, "set_relayer_sponsorship_limit", [
      nativeToScVal(relayer.toString(), { type: "address" }),
      nativeToScVal(perTxLimit, { type: "i128" }),
      nativeToScVal(perWindowLimit, { type: "i128" }),
      nativeToScVal(windowLedgers, { type: "u32" }),
    ]);
    await this.submit(tx, sourceKeypair);
  }

  /** Read the current sponsorship limits and window usage for `relayer`. */
  async getRelayerSponsorshipLimit(
    sourceKeypair: Keypair,
    relayer: Address
  ): Promise<RelayerSponsorshipLimit> {
    const tx = await this.buildTx(sourceKeypair, "get_relayer_sponsorship_limit", [
      nativeToScVal(relayer.toString(), { type: "address" }),
    ]);
    return this.simulateRead<RelayerSponsorshipLimit>(tx);
  }

  /**
   * Simulate-only: verifies that `relayer` may sponsor `fee` for `requestId`.
   * Fails closed on any error (limit exceeded, unregistered relayer, replay,
   * or RPC outage) so callers never proceed on an unverified sponsorship.
   */
  async checkRelayerSponsorship(
    sourceKeypair: Keypair,
    relayer: Address,
    fee: bigint,
    requestId: string
  ): Promise<void> {
    const tx = await this.buildTx(sourceKeypair, "check_relayer_sponsorship", [
      nativeToScVal(relayer.toString(), { type: "address" }),
      nativeToScVal(fee, { type: "i128" }),
      nativeToScVal(requestId, { type: "string" }),
    ]);
    let result: SorobanRpc.Api.SimulateTransactionResponse;
    try {
      result = await this.server.simulateTransaction(tx);
    } catch (err) {
      // Dependency outage (RPC): fail closed on the money path.
      throw new Error(
        `check_relayer_sponsorship failed closed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    if (SorobanRpc.Api.isSimulationError(result)) {
      throw new Error(`check_relayer_sponsorship failed: ${result.error}`);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async buildTx(
    sourceKeypair: Keypair,
    method: string,
    args: xdr.ScVal[]
  ): Promise<Transaction> {
    const account = await this.server.getAccount(sourceKeypair.publicKey());
    return new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();
  }

  private async simulateRead<T>(tx: Transaction): Promise<T> {
    const result = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(result)) {
      throw new Error(`Simulation failed: ${result.error}`);
    }
    const retval = (result as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    if (!retval) throw new Error("No return value");
    return scValToNative(retval) as T;
  }

  private async submit(tx: Transaction, signer: Keypair): Promise<void> {
    const simResult = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulation failed: ${simResult.error}`);
    }
    const preparedTx = SorobanRpc.assembleTransaction(
      tx,
      simResult as SorobanRpc.Api.SimulateTransactionSuccessResponse
    ).build();
    preparedTx.sign(signer);
    const sendResult = await this.server.sendTransaction(preparedTx);
    if (sendResult.status === "ERROR") {
      throw new Error(`Transaction failed: ${JSON.stringify(sendResult.errorResult)}`);
    }
    await pollTransaction(this.server, sendResult.hash);
  }
}
