// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DEVPUL
 * @notice BEP-20 (EVM) com taxa em transferências, ajustável pelo owner entre 0 e 4% (teto fixo no código).
 * @dev `maxFeeBps` = 400 (4%) para sempre. Supply único no deploy, sem mint.
 *      Taxa aplicada na COMPRA (par → usuário) e em transferências diretas entre carteiras.
 *      VENDA (usuário → par) é isenta de taxa para garantir compatibilidade com PancakeSwap
 *      SmartRouter, Trust Wallet e scanners de segurança (Blockaid).
 *      Registrar pares DEX com `setDexPair` após criar a pool.
 */
contract DevPul is ERC20, Ownable {
    uint256 public constant MAX_WALLET_NAME_BYTES = 64;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    /// @notice Teto máximo da taxa: 4% (400 bps), imutável.
    uint256 public constant maxFeeBps = 400;
    /// @notice Taxa atual (basis points). Owner pode alterar com `setFeeBps` entre 0 e `maxFeeBps`.
    uint256 public feeBps;

    /// @notice Cinco carteiras associadas ao projeto (registro on-chain). Endereços distintos.
    address[5] public wallets;

    /// @notice Rótulo por slot (mesmo índice que `wallets`). Até 64 bytes UTF-8 por nome.
    string[5] public walletNames;

    /// @notice Única carteira que recebe a taxa (sempre em DEVPUL).
    address public feeReceiver;

    /// @notice Endereços isentos de taxa nas duas direções (carteiras do time, feeReceiver, etc).
    mapping(address => bool) public isExcludedFromFees;

    /// @notice Pares DEX registrados. Quando `to` é um par DEX, a taxa NÃO é cobrada (venda).
    ///         Quando `from` é um par DEX e `to` não é isento, a taxa É cobrada (compra).
    mapping(address => bool) public isDexPair;

    event FeeBpsChanged(uint256 previousBps, uint256 newBps);
    event FeeReceiverChanged(address indexed previousReceiver, address indexed newReceiver);
    event WalletChanged(uint256 indexed index, address previousWallet, address newWallet);
    event WalletNameChanged(uint256 indexed index, string newName);
    event ExclusionFromFeesChanged(address indexed account, bool excluded);
    event DexPairChanged(address indexed pair, bool indexed registered);

    constructor(
        address initialOwner,
        address[5] memory _wallets,
        string[5] memory _walletNames,
        address _feeReceiver,
        uint256 initialFeeBps_
    ) ERC20("DEVPUL", "DEVPUL") Ownable(initialOwner) {
        require(initialOwner != address(0), "DevPul: owner zero");
        require(_feeReceiver != address(0), "DevPul: feeReceiver zero");
        require(initialFeeBps_ <= maxFeeBps, "DevPul: initial fee > max");

        for (uint256 i = 0; i < 5; i++) {
            require(_wallets[i] != address(0), "DevPul: wallet zero");
            require(bytes(_walletNames[i]).length <= MAX_WALLET_NAME_BYTES, "DevPul: name too long");
            for (uint256 j = i + 1; j < 5; j++) {
                require(_wallets[i] != _wallets[j], "DevPul: duplicate wallet");
            }
            wallets[i] = _wallets[i];
            walletNames[i] = _walletNames[i];
        }

        feeBps = initialFeeBps_;
        feeReceiver = _feeReceiver;

        isExcludedFromFees[address(this)] = true;
        isExcludedFromFees[initialOwner] = true;
        isExcludedFromFees[_feeReceiver] = true;
        for (uint256 i = 0; i < 5; i++) {
            isExcludedFromFees[_wallets[i]] = true;
        }

        uint256 supply = 10_000_000_000 * 10 ** decimals();
        _mint(initialOwner, supply);
    }

    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= maxFeeBps, "DevPul: fee above max");
        uint256 prev = feeBps;
        feeBps = newFeeBps;
        emit FeeBpsChanged(prev, newFeeBps);
    }

    function setFeeReceiver(address newReceiver) external onlyOwner {
        require(newReceiver != address(0), "DevPul: feeReceiver zero");
        address prev = feeReceiver;
        feeReceiver = newReceiver;
        isExcludedFromFees[newReceiver] = true;
        emit FeeReceiverChanged(prev, newReceiver);
    }

    function setWallet(uint256 index, address account) external onlyOwner {
        require(index < 5, "DevPul: wallet index");
        require(account != address(0), "DevPul: wallet zero");
        for (uint256 j = 0; j < 5; j++) {
            if (j != index) require(account != wallets[j], "DevPul: duplicate wallet");
        }
        address oldWallet = wallets[index];
        wallets[index] = account;
        if (oldWallet != feeReceiver && oldWallet != owner()) {
            isExcludedFromFees[oldWallet] = false;
        }
        isExcludedFromFees[account] = true;
        emit WalletChanged(index, oldWallet, account);
    }

    function setWalletName(uint256 index, string calldata newName) external onlyOwner {
        require(index < 5, "DevPul: wallet index");
        require(bytes(newName).length <= MAX_WALLET_NAME_BYTES, "DevPul: name too long");
        walletNames[index] = newName;
        emit WalletNameChanged(index, newName);
    }

    function setExcludedFromFees(address account, bool excluded) external onlyOwner {
        require(account != address(0), "DevPul: account zero");
        isExcludedFromFees[account] = excluded;
        emit ExclusionFromFeesChanged(account, excluded);
    }

    /// @notice Registra ou remove um par DEX.
    ///         Pares registrados ficam isentos como DESTINATÁRIOS (venda livre de taxa).
    ///         Como REMETENTES (compra), a taxa normal é aplicada ao comprador.
    function setDexPair(address pair, bool registered) external onlyOwner {
        require(pair != address(0), "DevPul: pair zero");
        isDexPair[pair] = registered;
        emit DexPairChanged(pair, registered);
    }

    function _update(address from, address to, uint256 value) internal virtual override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }

        // Venda (to = par DEX): sem taxa → K check do AMM passa normalmente
        // Compra (from = par DEX, to = usuário comum): taxa aplicada normalmente
        // Carteiras isentas: sem taxa nas duas direções
        bool takeFee = !isExcludedFromFees[from]
            && !isExcludedFromFees[to]
            && !isDexPair[to];

        if (!takeFee || value == 0) {
            super._update(from, to, value);
            return;
        }

        uint256 fee = (value * feeBps) / BPS_DENOMINATOR;
        if (fee == 0) {
            super._update(from, to, value);
            return;
        }

        uint256 sendAmount = value - fee;
        super._update(from, feeReceiver, fee);
        super._update(from, to, sendAmount);
    }
}
