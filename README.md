# DEVPUL — contrato de teste (BSC / BEP-20)

Token **Dev Pul** (`DEVPUL`): supply **fixo 10.000.000.000** (10 bi, 18 decimais), **sem mint** após o deploy, **taxa 4%** em transferências quando **nem o remetente nem o destinatário** estão na lista de isenção.

A taxa é paga **em DEVPUL** para `feeReceiver`. Troca para BNB é **manual** na DEX.

## Requisitos

- Node.js 18+
- Carteira com **tBNB** na BSC Testnet ([faucet](https://testnet.bnbchain.org/faucet-smart))

## Instalação e testes (local)

Repositório à parte do app Pulso — pasta raiz deste projeto.

```bash
cd dev-pul-bsc
npm install
npm test
```

## Deploy na BSC Testnet

1. Copia `.env.example` para `.env` na raiz deste projeto e preenche `PRIVATE_KEY` e `TEAM_WALLETS` (5 endereços `0x` distintos, separados por vírgula — ficam registrados on-chain em `wallets[0..4]`).
2. Opcional: `TEAM_WALLET_NAMES` — cinco rótulos na mesma ordem (ex.: `Tesouraria,MKT,Dev,...`), até 64 bytes cada; ficam em `walletNames[0..4]` e o owner pode mudar depois com `setWalletName`.
3. Opcional: `BSCSCAN_API_KEY` para verificação no explorer; `FEE_RECEIVER` é a **única** carteira que recebe a taxa em DEVPUL (pode ser uma das cinco; se vazio, usa o deployer).
4. Compilar e enviar:

```bash
npm run compile
npm run deploy:testnet
```

## Deploy na BSC Mainnet (“real”)

Usa **BNB real** (taxas de gás). O contrato é **imutável** no endereço novo: confere `TEAM_WALLETS`, `FEE_RECEIVER` e `TEAM_WALLET_NAMES` antes de correr o comando.

1. **Carteira só para produção:** idealmente uma chave **nova**, nunca partilhada nem usada em testnet exposta. A conta precisa de **BNB** na BSC (chain 56) para o gás.
2. No `.env`, com a mesma estrutura da testnet: `PRIVATE_KEY`, `TEAM_WALLETS` (as 5 carteiras **reais** que controlas), `FEE_RECEIVER` se a taxa não for para o deployer, opcional `TEAM_WALLET_NAMES`, `BSCSCAN_API_KEY` para verificação em [bscscan.com](https://bscscan.com).
3. Opcional: `BSC_MAINNET_RPC` (RPC próprio recomendado em produção; senão usa um endpoint público padrão).
4. Compilar e enviar:

```bash
npm run compile
npm run deploy:mainnet
```

**Isto não substitui auditoria nem parecer jurídico** sobre token com taxa e listagem em DEX.

## Pancake / taxa em compra e venda

- Na **compra** (pair → tua carteira) e na **venda** (tua carteira → pair), o contrato aplica a taxa **desde que** origem e destino não estejam isentos.
- Em **vendas**, a pool pode receber **menos** tokens do que o “amount” nominal da chamada. A interface da Pancake costuma usar funções **SupportingFeeOnTransferTokens** para isso; se um swap falhar, testa pela UI oficial ou pelo router correto.
- Depois de criar o par, podes **isentar** temporariamente router/pair para debug (só com `setExcludedFromFees`) — isso altera o que paga taxa; usa só para testes controlados.

## Endereços úteis (Testnet — conferir na [doc Pancake](https://developer.pancakeswap.finance/contracts/v2/addresses))

| Contrato   | Endereço (exemplo testnet) |
|-----------|----------------------------|
| Router V2 | `0xD99D1c33F9fC3444f8101754aBC46c52416550D1` |
| Factory   | `0x6725F303b657a9451d8BA641348b6761A6CC7a17` |
| WBNB      | `0xae13d989daCF0fDeFf460AC112a837C89baA7cd` |

Sempre confere se a Pancake/BNB Chain não mudou endereços na tua rede.

### PancakeSwap V2 — BSC Mainnet (referência; confere na [doc oficial](https://developer.pancakeswap.finance/contracts/v2/addresses))

| Contrato   | Endereço (mainnet comum) |
|-----------|---------------------------|
| Router V2 | `0x10ED43C718714eb63d5aA57B78B54704E256024E` |
| Factory   | `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73` |
| WBNB      | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` |

## Aviso

Isto é **contrato de teste / experiência**. Não é consultoria jurídica nem auditoria de segurança. Para mainnet e liquidez real, audite o código e alinhe com advogado.
