require('dotenv').config({ quiet: true });
require('@nomicfoundation/hardhat-toolbox');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC || 'https://data-seed-prebsc-1-s1.binance.org:8545/',
      chainId: 97,
      accounts: process.env.PRIVATE_KEY ? [normalizePk(process.env.PRIVATE_KEY)] : [],
    },
    bsc: {
      url: process.env.BSC_MAINNET_RPC || 'https://bsc-dataseed.binance.org/',
      chainId: 56,
      accounts: process.env.PRIVATE_KEY ? [normalizePk(process.env.PRIVATE_KEY)] : [],
    },
  },
  // Uma única chave da Etherscan.io (API v2 unificada) — funciona para BSC testnet (chain 97).
  // Não use objeto por rede; isso força API v1 e gera o aviso de depreciação.
  etherscan: {
    apiKey: process.env.BSCSCAN_API_KEY || '',
  },
};

function normalizePk(key) {
  const k = String(key).trim();
  return k.startsWith('0x') ? k : `0x${k}`;
}
