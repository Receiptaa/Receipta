import { describe, it, expect } from 'vitest';
import { validateStellarPublicKey } from './page';

describe('validateStellarPublicKey', () => {
  it('rejects empty or whitespace keys', () => {
    expect(validateStellarPublicKey('')).toBe('Stellar public key is required.');
    expect(validateStellarPublicKey('   ')).toBe('Stellar public key is required.');
  });

  it('rejects keys that do not start with G', () => {
    expect(validateStellarPublicKey('SB2D24Z7OQY4M62F7GBYHGI7BBD6G4K2HZZG7F2Z52Q2U4O57Q44A7Z43')).toBe(
      'Stellar public key must start with "G".'
    );
  });

  it('rejects keys that are not 56 characters long', () => {
    expect(validateStellarPublicKey('G123')).toBe(
      'Stellar public key must be exactly 56 characters long.'
    );
    expect(validateStellarPublicKey('G'.repeat(57))).toBe(
      'Stellar public key must be exactly 56 characters long.'
    );
  });

  it('rejects invalid checksum or non-base32 keys of length 56', () => {
    const invalidKey = 'G' + 'A'.repeat(55);
    expect(validateStellarPublicKey(invalidKey)).toBe(
      'Invalid Stellar public key format or checksum.'
    );
  });

  it('accepts genuine valid Stellar ed25519 public keys', () => {
    const validKey = 'GCKEBVN7S2UNBUVHHD4Z7LB25LJAAPLQS4VL2YG5WHIIWEUALVNBKH4Z';
    expect(validateStellarPublicKey(validKey)).toBe('');
  });
});
