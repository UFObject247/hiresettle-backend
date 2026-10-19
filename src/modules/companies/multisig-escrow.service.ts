import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateMultisigEscrowDto } from './dto/multisig-escrow.dto';

/**
 * In-memory store for multisig escrow configurations and pending transactions.
 *
 * A production implementation would persist these in the database with proper
 * Prisma models. This service encapsulates all multisig logic so it can be
 * swapped out without touching calling code.
 */

interface MultisigEscrow {
  id: string;
  companyId: string;
  signerIds: string[];
  threshold: number;
  createdAt: Date;
}

interface PendingSignature {
  signerId: string;
  signedXdr: string;
  signedAt: Date;
}

interface MultisigTransaction {
  id: string;
  escrowId: string;
  xdr: string;
  status: 'PENDING' | 'APPROVED' | 'SUBMITTED' | 'FAILED';
  signatures: PendingSignature[];
  submittedAt?: Date;
}

@Injectable()
export class MultisigEscrowService {
  private readonly logger = new Logger(MultisigEscrowService.name);

  // In-memory stores (replace with Prisma once models are migrated).
  private readonly escrows = new Map<string, MultisigEscrow>();
  private readonly transactions = new Map<string, MultisigTransaction>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a multisig signer set for the given company (#495).
   *
   * Validates that:
   * - Each signer ID references an existing user.
   * - threshold ≤ signerIds.length.
   * - threshold ≥ 1.
   */
  async createEscrow(companyId: string, dto: CreateMultisigEscrowDto): Promise<MultisigEscrow> {
    if (dto.threshold > dto.signerIds.length) {
      throw new BadRequestException(
        `threshold (${dto.threshold}) cannot exceed the number of signers (${dto.signerIds.length})`,
      );
    }
    if (dto.threshold < 1) {
      throw new BadRequestException('threshold must be at least 1');
    }

    // Verify all signer IDs are real users.
    const users = await this.prisma.user.findMany({
      where: { id: { in: dto.signerIds } },
      select: { id: true },
    });
    const foundIds = new Set(users.map((u) => u.id));
    const missing = dto.signerIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`Unknown signer user IDs: ${missing.join(', ')}`);
    }

    const escrow: MultisigEscrow = {
      id: crypto.randomUUID(),
      companyId,
      signerIds: dto.signerIds,
      threshold: dto.threshold,
      createdAt: new Date(),
    };
    this.escrows.set(escrow.id, escrow);
    this.logger.log(
      `Multisig escrow ${escrow.id} created for company ${companyId} (threshold ${dto.threshold}/${dto.signerIds.length})`,
    );
    return escrow;
  }

  /**
   * Open a new pending multisig transaction for an escrow that requires
   * `threshold` signers before the transaction is submitted to the network.
   */
  createPendingTransaction(escrowId: string, unsignedXdr: string): MultisigTransaction {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new NotFoundException(`Multisig escrow ${escrowId} not found`);

    const tx: MultisigTransaction = {
      id: crypto.randomUUID(),
      escrowId,
      xdr: unsignedXdr,
      status: 'PENDING',
      signatures: [],
    };
    this.transactions.set(tx.id, tx);
    this.logger.log(
      `Pending multisig transaction ${tx.id} created under escrow ${escrowId}`,
    );
    return tx;
  }

  /**
   * Collect a signature from an authorised signer (#495).
   *
   * Once the number of collected signatures reaches the escrow threshold the
   * transaction status transitions to APPROVED and the caller is expected to
   * submit it to the Stellar network.
   */
  async collectSignature(
    transactionId: string,
    signerId: string,
    signedXdr: string,
  ): Promise<MultisigTransaction> {
    const tx = this.transactions.get(transactionId);
    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);
    if (tx.status !== 'PENDING') {
      throw new BadRequestException(
        `Transaction ${transactionId} is ${tx.status} and cannot accept new signatures`,
      );
    }

    const escrow = this.escrows.get(tx.escrowId);
    if (!escrow) throw new NotFoundException(`Multisig escrow ${tx.escrowId} not found`);

    if (!escrow.signerIds.includes(signerId)) {
      throw new BadRequestException(`User ${signerId} is not a signer for escrow ${tx.escrowId}`);
    }

    if (tx.signatures.some((s) => s.signerId === signerId)) {
      throw new BadRequestException(`User ${signerId} has already signed transaction ${transactionId}`);
    }

    tx.signatures.push({ signerId, signedXdr, signedAt: new Date() });
    this.logger.log(
      `Signature collected for transaction ${transactionId} from ${signerId} ` +
      `(${tx.signatures.length}/${escrow.threshold} required)`,
    );

    if (tx.signatures.length >= escrow.threshold) {
      tx.status = 'APPROVED';
      this.logger.log(
        `Transaction ${transactionId} reached threshold ${escrow.threshold} — status: APPROVED`,
      );
    }

    return tx;
  }

  /** Mark a transaction as SUBMITTED after it has been sent to the network. */
  markSubmitted(transactionId: string): MultisigTransaction {
    const tx = this.transactions.get(transactionId);
    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);
    if (tx.status !== 'APPROVED') {
      throw new BadRequestException(
        `Only APPROVED transactions can be submitted, but ${transactionId} is ${tx.status}`,
      );
    }
    tx.status = 'SUBMITTED';
    tx.submittedAt = new Date();
    return tx;
  }

  getEscrow(escrowId: string): MultisigEscrow {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new NotFoundException(`Multisig escrow ${escrowId} not found`);
    return escrow;
  }

  getTransaction(transactionId: string): MultisigTransaction {
    const tx = this.transactions.get(transactionId);
    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);
    return tx;
  }
}
