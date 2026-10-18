import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { MultisigEscrowService } from './multisig-escrow.service';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, MultisigEscrowService],
  exports: [CompaniesService, MultisigEscrowService],
})
export class CompaniesModule {}
