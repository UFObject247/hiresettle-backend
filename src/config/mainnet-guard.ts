/**
 * Mainnet configuration guard (#498).
 *
 * When STELLAR_NETWORK=mainnet the application must refuse to start if any
 * critical configuration is missing or looks like a testnet/dev value.  This
 * prevents costly misconfiguration on the live network.
 *
 * Call `assertMainnetConfig()` early in bootstrap(), before the server starts
 * accepting requests.
 */

import { Logger } from '@nestjs/common';

const logger = new Logger('MainnetGuard');

/** Known testnet RPC / Horizon base URLs that must not be used on mainnet. */
const TESTNET_URL_FRAGMENTS = [
  'testnet',
  'futurenet',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
];

/** The only accepted network passphrase for Stellar mainnet (Public Network). */
const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

function isTestnetUrl(url: string | undefined): boolean {
  if (!url) return false;
  return TESTNET_URL_FRAGMENTS.some((fragment) =>
    url.toLowerCase().includes(fragment),
  );
}

/**
 * Validate that all mainnet-critical environment variables are present and
 * consistent.  Throws a descriptive error and exits the process on failure so
 * the container/process manager surfaces a clear reason for the refusal.
 */
export function assertMainnetConfig(env: NodeJS.ProcessEnv = process.env): void {
  const network = env.STELLAR_NETWORK;
  if (network !== 'mainnet') return; // nothing to check on testnet / futurenet

  const errors: string[] = [];

  // 1. Contract address must be set.
  const contractAddress =
    env.SOROBAN_CONTRACT_ADDRESS ?? env.HIRESETTLE_CONTRACT_ID;
  if (!contractAddress || contractAddress.trim() === '') {
    errors.push(
      'SOROBAN_CONTRACT_ADDRESS (or HIRESETTLE_CONTRACT_ID) must be set on mainnet',
    );
  }

  // 2. RPC URL must not point to testnet/futurenet endpoints.
  const rpcUrl = env.STELLAR_RPC_URL;
  if (rpcUrl && isTestnetUrl(rpcUrl)) {
    errors.push(
      `STELLAR_RPC_URL "${rpcUrl}" looks like a testnet/dev endpoint — set the mainnet RPC URL`,
    );
  }

  // 3. Horizon URL must not point to testnet/futurenet endpoints.
  const horizonUrl = env.STELLAR_HORIZON_URL;
  if (horizonUrl && isTestnetUrl(horizonUrl)) {
    errors.push(
      `STELLAR_HORIZON_URL "${horizonUrl}" looks like a testnet/dev endpoint — set the mainnet Horizon URL`,
    );
  }

  // 4. JWT secret must be present and strong (≥32 chars).
  const jwtSecret = env.JWT_SECRET ?? '';
  if (jwtSecret.length < 32) {
    errors.push(
      'JWT_SECRET must be at least 32 characters on mainnet',
    );
  }

  // 5. SMTP credentials must be set (emails required for production flows).
  if (!env.SMTP_HOST || env.SMTP_HOST.trim() === '') {
    errors.push('SMTP_HOST must be set on mainnet');
  }
  if (!env.SMTP_USER || env.SMTP_USER.trim() === '') {
    errors.push('SMTP_USER must be set on mainnet');
  }
  if (!env.SMTP_PASS || env.SMTP_PASS.trim() === '') {
    errors.push('SMTP_PASS must be set on mainnet');
  }

  // 6. DATABASE_URL must not reference localhost without explicit override.
  const databaseUrl = env.DATABASE_URL ?? '';
  if (
    (databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')) &&
    env.ALLOW_LOCAL_DB_ON_MAINNET !== 'true'
  ) {
    errors.push(
      'DATABASE_URL appears to point to localhost — use a production database URL on mainnet ' +
      '(set ALLOW_LOCAL_DB_ON_MAINNET=true only for intentional local testing)',
    );
  }

  if (errors.length > 0) {
    const message =
      '\n\n' +
      '╔══════════════════════════════════════════════════════════════╗\n' +
      '║          MAINNET CONFIGURATION VALIDATION FAILED             ║\n' +
      '╚══════════════════════════════════════════════════════════════╝\n\n' +
      'The following problems were detected for STELLAR_NETWORK=mainnet:\n\n' +
      errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n') +
      '\n\nFix the configuration and restart the application.\n';

    logger.error(message);
    // Exit immediately so the process supervisor reports a startup failure.
    process.exit(1);
  }

  logger.log(
    `Mainnet configuration validated — ${errors.length === 0 ? 'all checks passed' : ''}`,
  );
}
