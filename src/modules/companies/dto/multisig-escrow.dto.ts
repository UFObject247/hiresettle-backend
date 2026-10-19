import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ArrayMinSize,
} from 'class-validator';

export class CreateMultisigEscrowDto {
  @ApiProperty({
    description: 'Ordered list of signer user IDs that form the signing set',
    type: [String],
    example: ['user-uuid-1', 'user-uuid-2', 'user-uuid-3'],
  })
  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('4', { each: true })
  signerIds: string[];

  @ApiProperty({
    description:
      'Minimum number of signatures required to approve a transaction (must be ≤ signerIds.length)',
    example: 2,
  })
  @IsInt()
  @Min(1)
  threshold: number;
}

export class SubmitMultisigSignatureDto {
  @ApiProperty({ description: 'ID of the pending multisig transaction to sign' })
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @ApiProperty({ description: 'XDR-encoded transaction envelope signed by this signer' })
  @IsString()
  @IsNotEmpty()
  signedXdr: string;
}

export class MultisigEscrowResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: [String] })
  signerIds: string[];

  @ApiProperty()
  threshold: number;

  @ApiProperty()
  companyId: string;

  @ApiProperty()
  createdAt: Date;
}

export class MultisigTransactionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  escrowId: string;

  @ApiProperty()
  xdr: string;

  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'SUBMITTED', 'FAILED'] })
  status: 'PENDING' | 'APPROVED' | 'SUBMITTED' | 'FAILED';

  @ApiProperty({ type: [String], description: 'User IDs that have signed so far' })
  collectedSignerIds: string[];

  @ApiProperty()
  threshold: number;

  @ApiPropertyOptional()
  submittedAt?: Date;
}
