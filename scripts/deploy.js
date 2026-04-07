const hre = require('hardhat');

function parseFeeBps(raw, fallback) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Valor BPS inválido: ${raw}`);
  }
  return n;
}

/**
 * @returns {string[]} exatamente 5 endereços checksummed
 */
function parseTeamWallets(raw) {
  if (!raw || String(raw).trim() === '') {
    throw new Error(
      'Defina TEAM_WALLETS no .env com 5 endereços 0x separados por vírgula (carteiras registradas no contrato).'
    );
  }
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length !== 5) {
    throw new Error('TEAM_WALLETS deve ter exatamente 5 endereços, separados por vírgula.');
  }
  const out = [];
  for (const p of parts) {
    if (!hre.ethers.isAddress(p)) {
      throw new Error(`Endereço inválido em TEAM_WALLETS: ${p}`);
    }
    out.push(hre.ethers.getAddress(p));
  }
  const set = new Set(out);
  if (set.size !== 5) {
    throw new Error('TEAM_WALLETS: os 5 endereços devem ser distintos entre si.');
  }
  return out;
}

/**
 * Cinco rótulos na mesma ordem de TEAM_WALLETS. Opcional: vazio = 5 strings vazias.
 * Separador: vírgula. Evite vírgula dentro do nome; use setWalletName depois se precisar.
 * @returns {[string,string,string,string,string]}
 */
function parseTeamWalletNames(raw) {
  if (!raw || String(raw).trim() === '') {
    return ['', '', '', '', ''];
  }
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim());
  if (parts.length !== 5) {
    throw new Error(
      'TEAM_WALLET_NAMES deve ter exatamente 5 nomes separados por vírgula (ou deixe vazio). Ex.: Tesouraria,MKT,Dev,Jurídico,Comunidade'
    );
  }
  for (const p of parts) {
    if (Buffer.byteLength(p, 'utf8') > 64) {
      throw new Error(`Nome excede 64 bytes UTF-8: ${p.slice(0, 20)}...`);
    }
  }
  return /** @type {[string,string,string,string,string]} */ ([
    parts[0],
    parts[1],
    parts[2],
    parts[3],
    parts[4],
  ]);
}

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk || pk === '') {
    throw new Error('Defina PRIVATE_KEY no .env na raiz deste projeto (dev-pul-bsc).');
  }

  const [deployer] = await hre.ethers.getSigners();
  const owner = deployer.address;
  const teamWallets = parseTeamWallets(process.env.TEAM_WALLETS);
  const walletNames = parseTeamWalletNames(process.env.TEAM_WALLET_NAMES);
  /** Uma carteira recebe 100% da taxa em DEVPUL; pode ser uma das TEAM_WALLETS. */
  const feeReceiverRaw = process.env.FEE_RECEIVER?.trim();
  const feeReceiver =
    feeReceiverRaw && feeReceiverRaw !== ''
      ? hre.ethers.getAddress(feeReceiverRaw)
      : owner;

  const initialFeeBps = parseFeeBps(process.env.INITIAL_FEE_BPS, 400);
  if (initialFeeBps > 400) {
    throw new Error('INITIAL_FEE_BPS não pode ser maior que 400 (4%).');
  }

  console.log('Deploy com:', owner);
  console.log('wallets[0..4]:', teamWallets);
  console.log('walletNames[0..4]:', walletNames);
  console.log('feeReceiver:', feeReceiver);
  console.log('teto da taxa: 400 bps (4%, fixo) | initialFeeBps:', initialFeeBps);

  const DevPul = await hre.ethers.getContractFactory('DevPul');
  const walletsTuple = /** @type {[string,string,string,string,string]} */ ([
    teamWallets[0],
    teamWallets[1],
    teamWallets[2],
    teamWallets[3],
    teamWallets[4],
  ]);
  const namesTuple = walletNames;
  const token = await DevPul.deploy(owner, walletsTuple, namesTuple, feeReceiver, initialFeeBps);
  await token.waitForDeployment();

  const addr = await token.getAddress();
  console.log('DevPul deployado em:', addr);
  console.log('Nome:', await token.name(), 'Símbolo:', await token.symbol());
  console.log('Supply:', hre.ethers.formatUnits(await token.totalSupply(), await token.decimals()));
  console.log('feeBps atual:', (await token.feeBps()).toString());

  // Registrar par DEX se fornecido (pode ser feito depois com setDexPair no BSCScan)
  const dexPairRaw = process.env.DEX_PAIR_ADDRESS?.trim();
  if (dexPairRaw && dexPairRaw !== '') {
    const dexPair = hre.ethers.getAddress(dexPairRaw);
    console.log('Registrando par DEX:', dexPair);
    const tx = await token.setDexPair(dexPair, true);
    await tx.wait();
    console.log('Par DEX registrado. Vendas na DEX isentas de taxa, compras com taxa de', initialFeeBps, 'bps.');
  } else {
    console.log('DEX_PAIR_ADDRESS não definido. Registre o par depois com setDexPair no BSCScan.');
    console.log('Par PancakeSwap V2 pode ser calculado em: https://pancakeswap.finance após adicionar liquidez.');
  }

  if (process.env.BSCSCAN_API_KEY) {
    console.log('Aguardando blocos antes da verificação...');
    await token.deploymentTransaction()?.wait(5);
    try {
      await hre.run('verify:verify', {
        address: addr,
        constructorArguments: [owner, walletsTuple, namesTuple, feeReceiver, initialFeeBps],
      });
      console.log('Verificado no BscScan testnet.');
    } catch (e) {
      console.warn('verify:', e?.message || e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
