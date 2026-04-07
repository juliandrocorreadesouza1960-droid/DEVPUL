const { expect } = require('chai');
const { ethers } = require('hardhat');

const EMPTY_WALLET_NAMES = ['', '', '', '', ''];

describe('DevPul', function () {
  async function deploy() {
    const signers = await ethers.getSigners();
    const owner = signers[0];
    const w = [signers[1], signers[2], signers[3], signers[4], signers[5]];
    const alice = signers[6];
    const bob = signers[7];
    const wallets = w.map((s) => s.address);
    const feeRecv = w[2]; // terceira carteira recebe a taxa
    const DevPul = await ethers.getContractFactory('DevPul');
    const token = await DevPul.deploy(owner.address, wallets, EMPTY_WALLET_NAMES, feeRecv.address, 400);
    await token.waitForDeployment();
    return { token, owner, wallets: w, feeRecv, alice, bob };
  }

  it('minta 10 bi para o owner', async function () {
    const { token, owner } = await deploy();
    const dec = await token.decimals();
    const supply = ethers.parseUnits('10000000000', dec);
    expect(await token.balanceOf(owner.address)).to.equal(supply);
  });

  it('owner isento: transferência para alice sem taxa', async function () {
    const { token, owner, alice, feeRecv } = await deploy();
    const dec = await token.decimals();
    const amt = ethers.parseUnits('5000', dec);
    const feeBefore = await token.balanceOf(feeRecv.address);
    await token.transfer(alice.address, amt);
    expect(await token.balanceOf(alice.address)).to.equal(amt);
    expect(await token.balanceOf(feeRecv.address)).to.equal(feeBefore);
  });

  it('4% de taxa entre alice e bob (nenhum isento)', async function () {
    const { token, owner, feeRecv, alice, bob } = await deploy();
    const dec = await token.decimals();
    const amt = ethers.parseUnits('100000', dec);
    await token.transfer(alice.address, amt);

    const feeBefore = await token.balanceOf(feeRecv.address);
    await token.connect(alice).transfer(bob.address, amt);
    const fee = (amt * 400n) / 10_000n;
    expect(await token.balanceOf(feeRecv.address) - feeBefore).to.equal(fee);
    expect(await token.balanceOf(bob.address)).to.equal(amt - fee);
  });

  it('carteira em wallets isenta: transferência sem taxa', async function () {
    const { token, owner, wallets, feeRecv, alice } = await deploy();
    const dec = await token.decimals();
    const amt = ethers.parseUnits('100000', dec);
    await token.transfer(wallets[0].address, amt);
    const feeBefore = await token.balanceOf(feeRecv.address);
    await token.connect(wallets[0]).transfer(alice.address, amt);
    expect(await token.balanceOf(feeRecv.address)).to.equal(feeBefore);
    expect(await token.balanceOf(alice.address)).to.equal(amt);
  });

  it('owner pode zerar a taxa com setFeeBps(0)', async function () {
    const { token, owner, feeRecv, alice, bob } = await deploy();
    const dec = await token.decimals();
    const amt = ethers.parseUnits('100000', dec);
    await token.transfer(alice.address, amt);
    await token.setFeeBps(0);

    const feeBefore = await token.balanceOf(feeRecv.address);
    await token.connect(alice).transfer(bob.address, amt);
    expect(await token.balanceOf(feeRecv.address)).to.equal(feeBefore);
    expect(await token.balanceOf(bob.address)).to.equal(amt);
  });

  it('setFeeBps acima de 4% reverte', async function () {
    const { token, owner } = await deploy();
    await expect(token.setFeeBps(401)).to.be.revertedWith('DevPul: fee above max');
  });

  it('constructor com taxa inicial > 4% reverte', async function () {
    const signers = await ethers.getSigners();
    const owner = signers[0];
    const wallets = signers.slice(1, 6).map((s) => s.address);
    const feeRecv = signers[2].address;
    const DevPul = await ethers.getContractFactory('DevPul');
    await expect(
      DevPul.deploy(owner.address, wallets, EMPTY_WALLET_NAMES, feeRecv, 401)
    ).to.be.revertedWith('DevPul: initial fee > max');
  });

  it('constructor com wallet duplicada reverte', async function () {
    const signers = await ethers.getSigners();
    const owner = signers[0];
    const a = signers[1].address;
    const wallets = [a, signers[2].address, signers[3].address, signers[4].address, a];
    const DevPul = await ethers.getContractFactory('DevPul');
    await expect(
      DevPul.deploy(owner.address, wallets, EMPTY_WALLET_NAMES, signers[5].address, 400)
    ).to.be.revertedWith('DevPul: duplicate wallet');
  });

  it('walletNames no deploy e setWalletName', async function () {
    const signers = await ethers.getSigners();
    const owner = signers[0];
    const w = [signers[1], signers[2], signers[3], signers[4], signers[5]];
    const wallets = w.map((s) => s.address);
    const feeRecv = w[2];
    const names = ['Tesouraria', 'MKT', 'Dev', 'Juridico', 'Comunidade'];
    const DevPul = await ethers.getContractFactory('DevPul');
    const token = await DevPul.deploy(owner.address, wallets, names, feeRecv.address, 400);
    await token.waitForDeployment();
    expect(await token.walletNames(0)).to.equal('Tesouraria');
    expect(await token.walletNames(4)).to.equal('Comunidade');
    await token.setWalletName(0, 'Treasury');
    expect(await token.walletNames(0)).to.equal('Treasury');
  });

  it('setWalletName com mais de 64 bytes reverte', async function () {
    const { token, owner } = await deploy();
    const long = 'a'.repeat(65);
    await expect(token.setWalletName(0, long)).to.be.revertedWith('DevPul: name too long');
  });

  it('estrangeiro não pode setFeeBps', async function () {
    const { token, alice } = await deploy();
    await expect(token.connect(alice).setFeeBps(0)).to.be.revertedWithCustomError(
      token,
      'OwnableUnauthorizedAccount'
    );
  });
});
