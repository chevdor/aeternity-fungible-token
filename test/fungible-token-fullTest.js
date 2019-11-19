/*
 * ISC License (ISC)
 * Copyright (c) 2018 aeternity developers
 *
 *  Permission to use, copy, modify, and/or distribute this software for any
 *  purpose with or without fee is hereby granted, provided that the above
 *  copyright notice and this permission notice appear in all copies.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 *  REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 *  AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 *  INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 *  LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 *  OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 *  PERFORMANCE OF THIS SOFTWARE.
 */
const Ae = require('@aeternity/aepp-sdk').Universal;
const Crypto = require('@aeternity/aepp-sdk').Crypto;
const Bytes = require('@aeternity/aepp-sdk/es/utils/bytes');
var blake2b = require('blake2b');

const config = {
    host: 'http://localhost:3001/',
    internalHost: 'http://localhost:3001/internal/',
    compilerUrl: 'http://localhost:3080'
};

describe('Fungible Token Full Contract', () => {

    let ownerKeypair, otherKeypair, owner, otherClient, contract;

    before(async () => {
        ownerKeypair = wallets[0];
        owner = await Ae({
            url: config.host,
            internalUrl: config.internalHost,
            keypair: ownerKeypair,
            nativeMode: true,
            networkId: 'ae_devnet',
            compilerUrl: config.compilerUrl
        });

        otherKeypair = wallets[1];
        otherClient = await Ae({
            url: config.host,
            internalUrl: config.internalHost,
            keypair: otherKeypair,
            nativeMode: true,
            networkId: 'ae_devnet',
            compilerUrl: config.compilerUrl
        });
    });

    const hashTopic = topic => blake2b(32).update(Buffer.from(topic)).digest('hex');
    const topicHashFromResult = result => Bytes.toBytes(result.result.log[0].topics[0], true).toString('hex');

    beforeEach(async () => {
        let contractSource = utils.readFileRelative('./contracts/fungible-token-full.aes', 'utf-8');
        contract = await owner.getContractInstance(contractSource);
        const deploy = await contract.deploy(['AE Test Token', 0, 'AETT']);
        assert.equal(deploy.result.returnType, 'ok');
    });

    it('Fungible Token Contract: Return Extensions', async () => {
        const aex9Extensions = await contract.methods.aex9_extensions();
        assert.deepEqual(aex9Extensions.decodedResult, ["allowances", "mintable", "burnable", "swappable"]);
    });

    it('Deploying Fungible Token Contract: Meta Information', async () => {
        let contractSource = utils.readFileRelative('./contracts/fungible-token-full.aes', 'utf-8');
        let deployTestContract = await owner.getContractInstance(contractSource);

        const deploy = await deployTestContract.deploy(['AE Test Token', 0, 'AETT']);
        assert.equal(deploy.result.returnType, 'ok');
        const metaInfo = await deployTestContract.methods.meta_info();
        assert.deepEqual(metaInfo.decodedResult, {name: 'AE Test Token', symbol: 'AETT', decimals: 0});

        const deployDecimals = await deployTestContract.deploy(['AE Test Token', 10, 'AETT']);
        assert.equal(deployDecimals.result.returnType, 'ok');
        const metaInfoDecimals = await deployTestContract.methods.meta_info();
        assert.deepEqual(metaInfoDecimals.decodedResult, {name: 'AE Test Token', symbol: 'AETT', decimals: 10});

        const deployFail = await deployTestContract.deploy(['AE Test Token', -10, 'AETT']).catch(e => e);
        assert.include(deployFail.decodedError, "NON_NEGATIVE_VALUE_REQUIRED");
    });

    it('Fungible Token Contract: Mint Tokens', async () => {
        const mint = await contract.methods.mint(ownerKeypair.publicKey, 10);
        assert.equal(topicHashFromResult(mint), hashTopic('Mint'));
        assert.equal(Crypto.addressFromDecimal(mint.result.log[0].topics[1]), ownerKeypair.publicKey);
        assert.equal(mint.result.log[0].topics[2], 10);
        assert.equal(mint.result.returnType, 'ok');
        const totalSupply = await contract.methods.total_supply();
        assert.deepEqual(totalSupply.decodedResult, 10);
        const balance = await contract.methods.balance(ownerKeypair.publicKey);
        assert.equal(balance.decodedResult, 10);

        const mintFailAmount = await contract.methods.mint(ownerKeypair.publicKey, -10).catch(e => e);
        assert.include(mintFailAmount.decodedError, "NON_NEGATIVE_VALUE_REQUIRED");

        let contractSource = utils.readFileRelative('./contracts/fungible-token-full.aes', 'utf-8');
        let otherClientContract = await otherClient.getContractInstance(contractSource, {contractAddress: contract.deployInfo.address});
        const mintFailOwner = await otherClientContract.methods.mint(ownerKeypair.publicKey, 10).catch(e => e);
        assert.include(mintFailOwner.decodedError, 'ONLY_OWNER_CALL_ALLOWED');
    });

    it('Fungible Token Contract: Create Allowance', async () => {
        const create_allowance = await contract.methods.create_allowance(otherKeypair.publicKey, 10);
        assert.equal(topicHashFromResult(create_allowance), hashTopic('Allowance'));
        assert.equal(Crypto.addressFromDecimal(create_allowance.result.log[0].topics[1]), ownerKeypair.publicKey);
        assert.equal(Crypto.addressFromDecimal(create_allowance.result.log[0].topics[2]), otherKeypair.publicKey);
        assert.equal(create_allowance.result.log[0].topics[3], 10);
        assert.equal(create_allowance.result.returnType, 'ok');

        const allowanceFailAmount = await contract.methods.create_allowance(otherKeypair.publicKey, -10).catch(e => e);
        assert.include(allowanceFailAmount.decodedError, "NON_NEGATIVE_VALUE_REQUIRED");
    });

    it('Fungible Token Contract: Get Allowance', async () => {
        await contract.methods.create_allowance(otherKeypair.publicKey, 10);

        const get_allowance = await contract.methods.allowance({
            from_account: ownerKeypair.publicKey,
            for_account: otherKeypair.publicKey
        });
        assert.equal(get_allowance.decodedResult, 10);

        // TODO implement
        //const allowance_for_caller = await contract.methods.allowance_for_caller(otherKeypair.publicKey);
        //assert.equal(allowance_for_caller.decodedResult, 0);

        const allowances = await contract.methods.allowances();
        assert.deepEqual(allowances.decodedResult, [[{
            from_account: ownerKeypair.publicKey,
            for_account: otherKeypair.publicKey
        }, 10]]);
    });

    it('Fungible Token Contract: Increase Allowance', async () => {
        await contract.methods.create_allowance(otherKeypair.publicKey, 10);

        const get_allowance = await contract.methods.allowance({
            from_account: ownerKeypair.publicKey,
            for_account: otherKeypair.publicKey
        });
        assert.equal(get_allowance.decodedResult, 10);

        await contract.methods.change_allowance(otherKeypair.publicKey, 10);

        const get_allowance_after = await contract.methods.allowance({
            from_account: ownerKeypair.publicKey,
            for_account: otherKeypair.publicKey
        });
        assert.equal(get_allowance_after.decodedResult, 20);
    });

    it('Fungible Token Contract: Decrease Allowance', async () => {
        await contract.methods.create_allowance(otherKeypair.publicKey, 10);
        const get_allowance_before = await contract.methods.allowance({
            from_account: ownerKeypair.publicKey,
            for_account: otherKeypair.publicKey
        });
        assert.equal(get_allowance_before.decodedResult, 10);

        await contract.methods.change_allowance(otherKeypair.publicKey, -5);

        const get_allowance_after = await contract.methods.allowance({
            from_account: ownerKeypair.publicKey,
            for_account: otherKeypair.publicKey
        });
        assert.equal(get_allowance_after.decodedResult, 5);
    });

    it('Fungible Token Contract: Transfer Allowance', async () => {
        await contract.methods.create_allowance(otherKeypair.publicKey, 10);

        // TODO implement
        /*await contract.methods.transfer_allowance(ownerKeypair.publicKey, otherKeypair.publicKey, 5);
        const get_allowance_after = await contract.methods.allowance({
            from_account: ownerKeypair.publicKey,
            for_account: otherKeypair.publicKey
        });
        assert.equal(get_allowance_after.decodedResult, 5);

        const balances = await deployTestContract.methods.balances();
        assert.deepEqual(balances.decodedResult, [[ownerKeypair.publicKey, 5], [otherKeypair.publicKey, 5]]);*/
    });
    it('Fungible Token Contract: Transfer Allowance (should fail)', async () => {
        await contract.methods.create_allowance(otherKeypair.publicKey, 10);

        const allowanceFailAmount = await contract.methods.transfer_allowance(ownerKeypair.publicKey, otherKeypair.publicKey, 15).catch(e => e);
        assert.include(allowanceFailAmount.decodedError, "ALLOWANCE_NOT_EXISTENT");
        const get_allowance_after = await contract.methods.allowance({
            from_account: ownerKeypair.publicKey,
            for_account: otherKeypair.publicKey
        });
        assert.equal(get_allowance_after.decodedResult, 10);
    });

    it('Fungible Token Contract: Decrease Allowance below zero (should fail)', async () => {
        await contract.methods.create_allowance(otherKeypair.publicKey, 10);

        const get_allowance_before = await contract.methods.allowance({
            from_account: ownerKeypair.publicKey,
            for_account: otherKeypair.publicKey
        });
        assert.equal(get_allowance_before.decodedResult, 10);

        const change_allowance = await contract.methods.change_allowance(otherKeypair.publicKey, -11).catch(e => e);
        assert.include(change_allowance.decodedError, "NON_NEGATIVE_VALUE_REQUIRED");

        const get_allowance_after = await contract.methods.allowance({
            from_account: ownerKeypair.publicKey,
            for_account: otherKeypair.publicKey
        });
        assert.equal(get_allowance_after.decodedResult, 10);
    });

    it('Fungible Token Contract: Reset Allowance', async () => {
        await contract.methods.create_allowance(otherKeypair.publicKey, 10);

        const get_allowance_before = await contract.methods.allowance({
            from_account: ownerKeypair.publicKey,
            for_account: otherKeypair.publicKey
        });
        assert.equal(get_allowance_before.decodedResult, 10);

        await contract.methods.reset_allowance(otherKeypair.publicKey);

        const get_allowance_after = await contract.methods.allowance({
            from_account: ownerKeypair.publicKey,
            for_account: otherKeypair.publicKey
        });
        assert.equal(get_allowance_after.decodedResult, 0);
    });

    it('Fungible Token Contract: Swap', async () => {
        await contract.methods.mint(ownerKeypair.publicKey, 10);

        const total_supply = await contract.methods.total_supply();
        assert.equal(total_supply.decodedResult, 10);

        const swap = await contract.methods.swap();
        assert.equal(topicHashFromResult(swap), hashTopic('Swap'));
        assert.equal(Crypto.addressFromDecimal(swap.result.log[0].topics[1]), ownerKeypair.publicKey);
        assert.equal(swap.result.log[0].topics[2], 10);

        const check_swap = await contract.methods.check_swap(ownerKeypair.publicKey);
        assert.equal(check_swap.decodedResult, 10);
        const balance = await contract.methods.balance(ownerKeypair.publicKey);
        assert.equal(balance.decodedResult, 0);

        const total_supply_after = await contract.methods.total_supply();
        assert.equal(total_supply_after.decodedResult, 0);

        const swapped = await contract.methods.swapped();
        assert.deepEqual(swapped.decodedResult, [[ownerKeypair.publicKey, 10]]);
    });
});
