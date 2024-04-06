export function isValidL2Address(address: string): boolean {
  // Wallets like to omit leading zeroes, so we cannot check for a fixed length.
  // On the other hand, we don't want users to mistakenly enter an Ethereum address.
  return /^0x[0-9a-fA-F]{50,64}$/.test(address)
}
