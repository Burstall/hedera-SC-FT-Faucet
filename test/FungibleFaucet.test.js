const {
	Client,
	AccountId,
	PrivateKey,
	ContractCreateFlow,
	ContractFunctionParameters,
	ContractCallQuery,
	Hbar,
	ContractExecuteTransaction,
	AccountCreateTransaction,
	HbarUnit,
	AccountInfoQuery,
	// eslint-disable-next-line no-unused-vars
	TransactionReceipt,
	TransferTransaction,
	// eslint-disable-next-line no-unused-vars
	TokenId,
	ContractInfoQuery,
	// eslint-disable-next-line no-unused-vars
	ContractId,
	// eslint-disable-next-line no-unused-vars
	TransactionRecord,
	TokenAssociateTransaction,
	TokenMintTransaction,
	TokenSupplyType,
	TokenType,
	TokenCreateTransaction,
	NftId,
	AccountAllowanceApproveTransaction,
} = require('@hashgraph/sdk');
const fs = require('fs');
const Web3 = require('web3');
const web3 = new Web3();
const { expect } = require('chai');
const { describe, it, after } = require('mocha');

require('dotenv').config();

// Get operator from .env file
const operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const contractName = process.env.CONTRACT_NAME ?? null;
const env = process.env.ENVIRONMENT ?? null;

const addressRegex = /(\d+\.\d+\.[1-9]\d+)/i;

// reused variable
let contractId;
let contractAddress;
let abi;
let alicePK, aliceId;
let bobPK, bobId;
let tokenId, nftTokenId;
let client;

describe('Deployment: ', function() {
	it('Should deploy the contract and setup conditions', async function() {
		if (contractName === undefined || contractName == null) {
			console.log('Environment required, please specify CONTRACT_NAME for ABI in the .env file');
			process.exit(1);
		}
		if (operatorKey === undefined || operatorKey == null || operatorId === undefined || operatorId == null) {
			console.log('Environment required, please specify PRIVATE_KEY & ACCOUNT_ID in the .env file');
			process.exit(1);
		}

		console.log('\n-Using ENIVRONMENT:', env);

		if (env.toUpperCase() == 'TEST') {
			client = Client.forTestnet();
			console.log('testing in *TESTNET*');
		}
		else if (env.toUpperCase() == 'MAIN') {
			client = Client.forMainnet();
			console.log('testing in *MAINNET*');
		}
		else {
			console.log('ERROR: Must specify either MAIN or TEST as environment in .env file');
			return;
		}

		client.setOperator(operatorId, operatorKey);

		// create Alice account
		alicePK = PrivateKey.generateED25519();
		aliceId = await accountCreator(alicePK, 10);
		console.log('Alice account ID:', aliceId.toString(), '\nkey:', alicePK.toString());

		client.setOperator(aliceId, alicePK);
		// mint an FT from Alice Account
		await mintFT(alicePK);

		// deploy the contract
		client.setOperator(operatorId, operatorKey);
		// mint the NFTs
		await mintNFT();
		// supply the minted FT
		console.log('\n-Using Operator:', operatorId.toString());

		// associate the FT to operator
		let result = await associateTokenToAccount(operatorId, operatorKey, tokenId);
		expect(result).to.be.equal('SUCCESS');

		const json = JSON.parse(fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`));

		// import ABI
		abi = json.abi;

		const contractBytecode = json.bytecode;
		const gasLimit = 1200000;

		console.log('\n- Deploying contract...', contractName, '\n\tgas@', gasLimit);

		await contractDeployFcn(contractBytecode, gasLimit);

		expect(contractId.toString().match(addressRegex).length == 2).to.be.true;

		console.log(`Contract created with ID: ${contractId} / ${contractAddress}`);

		console.log('\n-Testing:', contractName);

		// set allowance for the contract for the FT
		await setFungibleAllowance(contractId, aliceId, 5000);

		// create Bob account
		bobPK = PrivateKey.generateED25519();
		bobId = await accountCreator(bobPK, 10);
		console.log('Bob account ID:', bobId.toString(), '\nkey:', bobPK.toString());

		// associate the token for Bob
		client.setOperator(bobId, bobPK);
		result = await associateTokenToAccount(bobId, bobPK, tokenId);
		expect(result).to.be.equal('SUCCESS');

		result = await associateTokenToAccount(bobId, bobPK, nftTokenId);
		expect(result).to.be.equal('SUCCESS');

		// send an NFT to Bob
		await sendNFT(bobId, 1);
	});

});

describe('Access Checks: ', function() {
	it('Alice cant call sensitive methods', async function() {

		// add boost
		// remove boost
		// reset serial timestamp
		expect.fail(0, 1, 'Not implemented');
	});

	it('Alice can use getters', async function() {
		expect.fail(0, 1, 'Not implemented');
	});

});

describe('Interaction: ', function() {
	it('Bob draws faucet for single NFT held', async function() {
		expect.fail(0, 1, 'Not implemented');
	});

	it('Operator draws faucet for multiple NFTs held', async function() {
		expect.fail(0, 1, 'Not implemented');
	});

	it('Operator fails to pull faucet a second time for same NFTs', async function() {
		expect.fail(0, 1, 'Not implemented');
	});

	it('Operator gets partial success pulling faucet with one unclaimed and one claimed', async function() {
		expect.fail(0, 1, 'Not implemented');
	});

	it('Alice fails to pull faucet if no NFTs held', async function() {
		expect.fail(0, 1, 'Not implemented');
	});

	it('Bob claims faucet for single NFT held across mutliple time periods', async function() {
		expect.fail(0, 1, 'Not implemented');
	});

	it('Operator draws faucet for multiple NFTs across multiple time periods', async function() {
		expect.fail(0, 1, 'Not implemented');
	});

	it('Bob claims faucet for single NFT held > max accrual length', async function() {
		expect.fail(0, 1, 'Not implemented');
	});

	it('Operator draws faucet for multiple NFTs > max accrual length', async function() {
		expect.fail(0, 1, 'Not implemented');
	});

	it('Operator adds boost serials for Bob and one of their own', async function() {
		expect.fail(0, 1, 'Not implemented');
	});

	it('Bob claims faucet for boosted single serial', async function() {
		expect.fail(0, 1, 'Not implemented');
	});

	it('Operator draws faucet for multiple NFTs (partially boosted)', async function() {
		expect.fail(0, 1, 'Not implemented');
	});

	it('Operator removes boost serials', async function() {
		expect.fail(0, 1, 'Not implemented');
	});

	it('Operator can reset serial timestamp', async function() {
		expect.fail(0, 1, 'Not implemented');
	});

	after('Retrieve any hbar spent', async function() {
		const [, aliceHbarBal] = await getAccountBalance(aliceId);
		let result = await hbarTransferFcn(aliceId, alicePK, operatorId, aliceHbarBal.toBigNumber().minus(0.01));
		console.log('Clean-up -> Retrieve hbar from Alice');
		expect(result == 'SUCCESS').to.be.true;


		const [, bobHbarBal] = await getAccountBalance(bobId);
		result = await hbarTransferFcn(bobId, bobPK, operatorId, bobHbarBal.toBigNumber().minus(0.01));
		console.log('Clean-up -> Retrieve hbar from Alice');
		expect(result == 'SUCCESS').to.be.true;
	});
});

/**
 * Helper function to send serial 1 of the minted NFT to Alic for testing
 * @param {AccountId} receiverId
 * @param {Number} serial
*/
async function sendNFT(receiverId, serial) {
	const nft = new NftId(nftTokenId, serial);
	const transferTx = await new TransferTransaction()
		.addNftTransfer(nft, operatorId, receiverId)
		.setTransactionMemo('TokenStaker test NFT transfer')
		.freezeWith(client)
		.execute(client);

	const transferRx = await transferTx.getReceipt(client);
	return transferRx.status.toString();
}

/**
 * Helper function to mint an NFT and a serial on to that token
 * Using royaltyies to test the (potentially) more complicate case
 */
async function mintNFT() {
	const supplyKey = PrivateKey.generateED25519();

	const tokenCreateTx = new TokenCreateTransaction()
		.setTokenType(TokenType.NonFungibleUnique)
		.setTokenName('FTT_NFT' + aliceId.toString())
		.setTokenSymbol('FTT_NFT')
		.setInitialSupply(0)
		.setMaxSupply(10)
		.setSupplyType(TokenSupplyType.Finite)
		.setTreasuryAccountId(AccountId.fromString(operatorId))
		.setAutoRenewAccountId(AccountId.fromString(operatorId))
		.setSupplyKey(supplyKey)
		.setMaxTransactionFee(new Hbar(50, HbarUnit.Hbar));

	tokenCreateTx.freezeWith(client);
	const signedCreateTx = await tokenCreateTx.sign(operatorKey);
	const executionResponse = await signedCreateTx.execute(client);

	/* Get the receipt of the transaction */
	const createTokenRx = await executionResponse.getReceipt(client).catch((e) => {
		console.log(e);
		console.log('Token Create **FAILED*');
	});

	/* Get the token ID from the receipt */
	nftTokenId = createTokenRx.tokenId;

	const tokenMintTx = new TokenMintTransaction().setTokenId(tokenId);

	for (let i = 0; i < 10; i++) {
		tokenMintTx.addMetadata(Buffer.from('ipfs://bafybeihbyr6ldwpowrejyzq623lv374kggemmvebdyanrayuviufdhi6xu/metadata.json'));
	}

	tokenMintTx.freezeWith(client);

	const signedTx = await tokenMintTx.sign(supplyKey);
	const tokenMintSubmit = await signedTx.execute(client);
	// check it worked
	const mintRx = await tokenMintSubmit.getReceipt(client);
	return mintRx.status.toString();
}

/**
 * Helper function to send hbar
 * @param {AccountId} sender sender address
 * @param {PrivateKey} senderPK
 * @param {AccountId} receiver receiver address
 * @param {string | number | BigNumber} amount the amounbt to send
 * @returns {any} expect a string of SUCCESS
 */
async function hbarTransferFcn(sender, senderPK, receiver, amount) {
	const transferTx = new TransferTransaction()
		.addHbarTransfer(sender, -amount)
		.addHbarTransfer(receiver, amount)
		.freezeWith(client);
	const transferSign = await transferTx.sign(senderPK);
	const transferSubmit = await transferSign.execute(client);
	const transferRx = await transferSubmit.getReceipt(client);
	return transferRx.status.toString();
}

/**
 * Helper function to gather relevant balances
 * @param {AccountId} acctId
 * @returns {[number, Hbar, number]} NFT token balance, hbar balance, $LAZY balance
 */
async function getAccountBalance(acctId) {

	const query = new AccountInfoQuery()
		.setAccountId(acctId);

	const info = await query.execute(client);

	let balance;

	const tokenMap = info.tokenRelationships;
	const tokenBal = tokenMap.get(tokenId.toString());

	if (tokenBal) {
		balance = tokenBal.balance;
	}
	else {
		balance = -1;
	}

	return [balance, info.balance];
}

/**
 * Helper to setup the allowances
 * @param {AccountId} spenderAcct the account to set allowance for
 * @param {AccountId} ownerAcct the account to set allowance for
 * @param {*} amount amount of allowance to set
 */
async function setFungibleAllowance(spenderAcct, ownerAcct, amount) {
	const transaction = new AccountAllowanceApproveTransaction()
		.approveTokenAllowance(tokenId, ownerAcct, spenderAcct, amount)
		.freezeWith(client);

	const txResponse = await transaction.execute(client);
	const receipt = await txResponse.getReceipt(client);
	return receipt.status.toString();
}

/**
 * @param {AccountId} acct
 * @param {PrivateKey} key
 */
async function mintFT(acct, key) {
	const tokenCreateTx = new TokenCreateTransaction()
		.setTokenName('FaucetTestToken_FT' + acct.toString())
		.setTokenSymbol('FTT_FT')
		.setTokenType(TokenType.FungibleCommon)
		.setDecimals(1)
		.setInitialSupply(10000)
		.setTreasuryAccountId(acct)
		.setSupplyKey(key)
		.freezeWith(client);

	const tokenCreateSubmit = await tokenCreateTx.execute(client);
	const tokenCreateRx = await tokenCreateSubmit.getReceipt(client);
	tokenId = tokenCreateRx.tokenId;
}

/**
 * Helper method for token association
 * @param {AccountId} account
 * @param {PrivateKey} key
 * @param {TokenId} tokenToAssociate
 * @returns {any} expected to be a string 'SUCCESS' implioes it worked
 */
async function associateTokenToAccount(account, key, tokenToAssociate) {
	// now associate the token to the operator account
	const associateToken = await new TokenAssociateTransaction()
		.setAccountId(account)
		.setTokenIds([tokenToAssociate])
		.freezeWith(client)
		.sign(key);

	const associateTokenTx = await associateToken.execute(client);
	const associateTokenRx = await associateTokenTx.getReceipt(client);

	const associateTokenStatus = associateTokenRx.status;

	return associateTokenStatus.toString();
}

/**
 * Helper function to create new accounts
 * @param {PrivateKey} privateKey new accounts private key
 * @param {string | number} initialBalance initial balance in hbar
 * @returns {AccountId} the nrewly created Account ID object
 */
async function accountCreator(privateKey, initialBalance) {
	const response = await new AccountCreateTransaction()
		.setInitialBalance(new Hbar(initialBalance))
		.setMaxAutomaticTokenAssociations(10)
		.setKey(privateKey.publicKey)
		.execute(client);
	const receipt = await response.getReceipt(client);
	return receipt.accountId;
}

/**
 * Helper function to deploy the contract
 * @param {string} bytecode bytecode from compiled SOL file
 * @param {number} gasLim gas limit as a number
 */
async function contractDeployFcn(bytecode, gasLim) {
	const contractCreateTx = await new ContractCreateFlow()
		.setBytecode(bytecode)
		.setGas(gasLim)
		.setConstructorParameters(
			new ContractFunctionParameters()
				.addAddress(aliceId.toSolidityAddress())
				.addAddress(tokenId.toSolidityAddress())
				.addAddress(nftTokenId.toSolidityAddress())
				.addUint256(1)
				.addUint256(0)
				.addUint256(1)
				.addUint8(1),
		);
	const contractCreateSubmit = await contractCreateTx.execute(client);
	const contractCreateRx = await contractCreateSubmit.getReceipt(client);
	contractId = contractCreateRx.contractId;
	contractAddress = contractId.toSolidityAddress();
}