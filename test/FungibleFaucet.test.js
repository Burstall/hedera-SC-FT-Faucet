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
		aliceId = await accountCreator(alicePK, 150);
		console.log('Alice account ID:', aliceId.toString(), '\nkey:', alicePK.toString());

		client.setOperator(aliceId, alicePK);
		// mint an FT from Alice Account
		await mintFT(aliceId, alicePK);

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

		// send 1 hbar to the contract.
		await hbarTransferFcn(operatorId, operatorKey, contractId, 5);

		// set allowance for the contract for the FT
		client.setOperator(aliceId, alicePK);
		await setFungibleAllowance(contractId, aliceId, 5000);

		// create Bob account
		client.setOperator(operatorId, operatorKey);
		bobPK = PrivateKey.generateED25519();
		bobId = await accountCreator(bobPK, 200);
		console.log('Bob account ID:', bobId.toString(), '\nkey:', bobPK.toString());

		// associate the token for Bob
		client.setOperator(bobId, bobPK);
		result = await associateTokenToAccount(bobId, bobPK, tokenId);
		expect(result).to.be.equal('SUCCESS');

		result = await associateTokenToAccount(bobId, bobPK, nftTokenId);
		expect(result).to.be.equal('SUCCESS');

		// send an NFT to Bob
		client.setOperator(operatorId, operatorKey);
		await sendNFT(bobId, 1);
	});

});

describe('Access Checks: ', function() {
	it('Alice cant call sensitive methods', async function() {
		client.setOperator(aliceId, alicePK);
		let errorCount = 0;
		// update FT SCT
		try {
			await useSetterAddress('updateSCT', aliceId);
		}
		catch (err) {
			errorCount++;
		}
		// update FT
		try {
			await useSetterAddress('updateFungibleToken', tokenId);
		}
		catch (err) {
			errorCount++;
		}
		// update claim NFT
		try {
			await useSetterAddress('updateClaimToken', nftTokenId);
		}
		catch (err) {
			errorCount++;
		}
		// update daily amount
		try {
			await useSetterUints('updateDailyAmount', 12);
		}
		catch (err) {
			errorCount++;
		}
		// update boost multipler
		try {
			await useSetterUints('updateBoostMultiplier', 75);
		}
		catch (err) {
			errorCount++;
		}
		// update pause
		try {
			await useSetterBool('updatePauseStatus', false);
		}
		catch (err) {
			errorCount++;
		}
		// update min Time
		try {
			await useSetterUints('updateMinTime', 360);
		}
		catch (err) {
			errorCount++;
		}
		// update max time units
		try {
			await useSetteUint8s('updateMaxTimeUnits', 2);
		}
		catch (err) {
			errorCount++;
		}
		// add boost
		try {
			await useSetterUint256Array('addBoostSerials', [1]);
		}
		catch (err) {
			errorCount++;
		}
		// remove boost
		try {
			await useSetterUint256Array('removeBoostSerials', [1]);
		}
		catch (err) {
			errorCount++;
		}
		// reset serial timestamp
		try {
			await useResetSerialTimestamp('resetSerialTimestamp', [1], Math.floor((new Date().getTime()) / 1000));
		}
		catch (err) {
			errorCount++;
		}
		// transfer Hbar
		try {
			await transferHbarFromContract(aliceId, 1, HbarUnit.Tinybar);
		}
		catch (err) {
			errorCount++;
		}
		expect(errorCount).to.be.equal(12);
	});

	it('Alice can use getters', async function() {
		client.setOperator(aliceId, alicePK);
		// get FT SCT
		const addressSCT = await getSetting('getSCT', 'sct');
		expect(AccountId.fromSolidityAddress(addressSCT).toString() == aliceId.toString()).to.be.true;

		// get FT
		const addressFungible = await getSetting('getFungibleToken', 'fungible');
		expect(TokenId.fromSolidityAddress(addressFungible).toString() == tokenId.toString()).to.be.true;

		// get claim token
		const addressNFT = await getSetting('getClaimToken', 'nft');
		expect(TokenId.fromSolidityAddress(addressNFT).toString() == nftTokenId.toString()).to.be.true;

		// get daily amount
		const uintDailyAmt = await getSetting('getDailyAmount', 'dailyAmt');
		expect(Number(uintDailyAmt) == 1).to.be.true;

		// get boost multiplier
		const uintBoost = await getSetting('getBoostMultipler', 'boostPercentage');
		expect(Number(uintBoost) == 0).to.be.true;

		// get pause
		const boolPause = await getSetting('getPaused', 'paused');
		expect(boolPause).to.be.true;

		// get min time
		const uintMinTime = await getSetting('getMinTime', 'minTime');
		expect(Number(uintMinTime) == 5).to.be.true;

		// get max time (& units)
		const [uint8MaxTimeUnits, uint256MaxTime] = await getSettings('getMaxTimeUnits', 'maxTimeUnits', 'maxTime');
		expect(Number(uint8MaxTimeUnits) == 1).to.be.true;
		expect(Number(uint256MaxTime) == 5).to.be.true;

		// get boost serials
		const intArraySerials = await getSetting('getBoostSerials', 'boostSerials');
		expect(intArraySerials.length == 0).to.be.true;
	});

});

describe('Interaction: ', function() {
	it('Operator unpauses the contract', async function() {
		client.setOperator(operatorId, operatorKey);
		const result = await useSetterBool('updatePauseStatus', false);
		expect(result == 'SUCCESS').to.be.true;
		await sleep(4500);
	});

	it('Bob draws faucet for single NFT held', async function() {
		client.setOperator(bobId, bobPK);
		const [, uintAmtCalc] = await useSetterUint256Array('getClaimableAmount', [1]);
		expect(Number(uintAmtCalc[0]) == 1).to.be.true;

		const [, uintAmtClaim] = await useSetterUint256Array('pullFaucetHTS', [1]);
		expect(Number(uintAmtClaim[0]) == 1).to.be.true;
	});

	it('Operator draws faucet for multiple NFTs held', async function() {
		client.setOperator(operatorId, operatorKey);
		const [, uintAmtCalc] = await useSetterUint256Array('getClaimableAmount', [2, 3]);
		expect(Number(uintAmtCalc[0]) == 2).to.be.true;

		const [, uintAmtClaim] = await useSetterUint256Array('pullFaucetHTS', [2, 3]);
		expect(Number(uintAmtClaim[0]) == 2).to.be.true;
	});

	it('Operator fails to pull faucet a second time for same NFTs', async function() {
		client.setOperator(operatorId, operatorKey);
		const [, uintAmtClaim] = await useSetterUint256Array('pullFaucetHTS', [2, 3]);
		expect(Number(uintAmtClaim[0]) == 0).to.be.true;
	});

	it('Operator gets partial success pulling faucet with one unclaimed and one claimed', async function() {
		client.setOperator(operatorId, operatorKey);
		const [, uintAmtClaim] = await useSetterUint256Array('pullFaucetHTS', [3, 4]);
		expect(Number(uintAmtClaim[0]) == 1).to.be.true;
	});

	it('Alice fails to pull faucet if no NFTs held', async function() {
		client.setOperator(aliceId, alicePK);
		let errorCount = 0;
		let uintAmtClaim;
		try {
			await useSetterUint256Array('pullFaucetHTS', []);
		}
		catch (err) {
			errorCount++;
		}
		expect(errorCount == 1).to.be.true;
		[, uintAmtClaim] = await useSetterUint256Array('pullFaucetHTS', [7]);
		expect(Number(uintAmtClaim[0]) == 0).to.be.true;
		[, uintAmtClaim] = await useSetterUint256Array('pullFaucetHTS', [5, 6]);
		expect(Number(uintAmtClaim[0]) == 0).to.be.true;
	});

	it('Bob claims faucet for single NFT held across multiple time periods', async function() {
		client.setOperator(operatorId, operatorKey);
		// set the contract for multiple periods at 2 second
		let [result] = await useSetterUints('updateMinTime', 2);
		expect(result == 'SUCCESS').to.be.true;

		[result] = await useSetteUint8s('updateMaxTimeUnits', 3);
		expect(result == 'SUCCESS').to.be.true;

		// reset timestamp to the current time for bob
		[result] = await useResetSerialTimestamp('resetSerialTimestamp', [1], Math.floor((new Date().getTime()) / 1000));
		expect(result == 'SUCCESS').to.be.true;

		client.setOperator(bobId, bobPK);
		// claim to reset timer
		await useSetterUint256Array('pullFaucetHTS', [1]);
		await sleep(3500);
		const [, uintAmtCalc] = await useSetterUint256Array('getClaimableAmount', [1]);
		expect(Number(uintAmtCalc[0]) == 2).to.be.true;

		// potential race condition...hence checking just >= claim calc
		const [, uintAmtClaim] = await useSetterUint256Array('pullFaucetHTS', [1]);
		expect(Number(uintAmtClaim[0]) >= Number(uintAmtCalc[0])).to.be.true;
	});

	it('Operator draws faucet for multiple NFTs across multiple time periods', async function() {
		client.setOperator(operatorId, operatorKey);
		const [, uintAmtCalc] = await useSetterUint256Array('getClaimableAmount', [2, 3]);

		const [, uintAmtClaim] = await useSetterUint256Array('pullFaucetHTS', [2, 3]);
		expect(Number(uintAmtClaim[0]) >= Number(uintAmtCalc[0])).to.be.true;
	});

	it('Bob claims faucet for single NFT held > max accrual length', async function() {
		client.setOperator(operatorId, operatorKey);
		// move timer to 1 second to speed it up
		const [result] = await useSetterUints('updateMinTime', 1);
		expect(result == 'SUCCESS').to.be.true;
		// sleep for whole window to max claim
		await sleep(3000);
		client.setOperator(bobId, bobPK);
		const [, uintAmtCalc] = await useSetterUint256Array('getClaimableAmount', [1]);
		expect(Number(uintAmtCalc[0]) == 3).to.be.true;

		const [, uintAmtClaim] = await useSetterUint256Array('pullFaucetHTS', [1]);
		expect(Number(uintAmtClaim[0]) == 3).to.be.true;
	});

	it('Operator draws faucet for multiple NFTs > max accrual length', async function() {
		client.setOperator(operatorId, operatorKey);
		const [, uintAmtCalc] = await useSetterUint256Array('getClaimableAmount', [2, 3]);
		expect(Number(uintAmtCalc[0]) == 6).to.be.true;

		const [, uintAmtClaim] = await useSetterUint256Array('pullFaucetHTS', [2, 3]);
		expect(Number(uintAmtClaim[0]) == 6).to.be.true;
	});

	it('Operator adds boost serials for Bob and one of their own', async function() {
		client.setOperator(operatorId, operatorKey);
		let [result] = await useSetterUints('updateBoostMultiplier', 150);
		expect(result == 'SUCCESS').to.be.true;

		[result] = await useSetteUint8s('updateMaxTimeUnits', 2);
		expect(result == 'SUCCESS').to.be.true;

		[result] = await useSetterUint256Array('addBoostSerials', [1, 2]);
		expect(result == 'SUCCESS').to.be.true;
	});

	it('Bob claims faucet for boosted single serial', async function() {
		// let max claim build
		await sleep(2000);
		client.setOperator(bobId, bobPK);
		const [, uintAmtCalc] = await useSetterUint256Array('getClaimableAmount', [1]);
		expect(Number(uintAmtCalc[0]) == 5).to.be.true;

		// potential race condition...hence checking just >= claim calc
		const [, uintAmtClaim] = await useSetterUint256Array('pullFaucetHTS', [1]);
		expect(Number(uintAmtClaim[0]) == 5).to.be.true;
	});

	it('Operator draws faucet for multiple NFTs (partially boosted)', async function() {
		client.setOperator(operatorId, operatorKey);
		const [, uintAmtCalc] = await useSetterUint256Array('getClaimableAmount', [2, 3, 4]);
		expect(Number(uintAmtCalc[0]) == 9).to.be.true;

		const [, uintAmtClaim] = await useSetterUint256Array('pullFaucetHTS', [2, 3, 4]);
		expect(Number(uintAmtClaim[0]) == 9).to.be.true;
	});

	it('Operator removes boost serials', async function() {
		client.setOperator(operatorId, operatorKey);

		const [result] = await useSetterUint256Array('removeBoostSerials', [1, 2]);
		expect(result == 'SUCCESS').to.be.true;

		const intArraySerials = await getSetting('getBoostSerials', 'boostSerials');
		expect(intArraySerials.length == 0).to.be.true;
	});

	it('Operator can reset serial timestamp', async function() {
		client.setOperator(operatorId, operatorKey);
		let [result] = await useSetteUint8s('updateMaxTimeUnits', 10);
		expect(result == 'SUCCESS').to.be.true;

		[result] = await useSetterUints('updateMinTime', 1);
		expect(result == 'SUCCESS').to.be.true;

		// also tests boost removal by claiming previously boosted serial
		const histricTimeInSecs = Math.floor((new Date().getTime()) / 1000) - 10;

		[result] = await useResetSerialTimestamp('resetSerialTimestamp', [1, 2, 3], histricTimeInSecs);
		expect(result == 'SUCCESS').to.be.true;

		client.setOperator(bobId, bobPK);
		let [, uintAmtCalc] = await useSetterUint256Array('getClaimableAmount', [1]);
		expect(Number(uintAmtCalc[0]) == 10).to.be.true;

		let [, uintAmtClaim] = await useSetterUint256Array('pullFaucetHTS', [1]);
		expect(Number(uintAmtClaim[0]) == 10).to.be.true;

		client.setOperator(operatorId, operatorKey);
		[, uintAmtCalc] = await useSetterUint256Array('getClaimableAmount', [2, 3, 4]);
		expect(Number(uintAmtCalc[0]) == 30).to.be.true;

		[, uintAmtClaim] = await useSetterUint256Array('pullFaucetHTS', [2, 3, 4]);
		expect(Number(uintAmtClaim[0]) == 30).to.be.true;
	});

	after('Retrieve any hbar spent', async function() {
		client.setOperator(operatorId, operatorKey);
		const [, aliceHbarBal] = await getAccountBalance(aliceId);
		let result = await hbarTransferFcn(aliceId, alicePK, operatorId, aliceHbarBal.toBigNumber().minus(0.01));
		console.log('Clean-up -> Retrieve hbar from Alice');
		expect(result == 'SUCCESS').to.be.true;


		const [, bobHbarBal] = await getAccountBalance(bobId);
		result = await hbarTransferFcn(bobId, bobPK, operatorId, bobHbarBal.toBigNumber().minus(0.01));
		console.log('Clean-up -> Retrieve hbar from Bob');
		expect(result == 'SUCCESS').to.be.true;

		client.setOperator(operatorId, operatorKey);
		let [contractHbarBal] = await getContractBalance(contractId);
		result = await transferHbarFromContract(operatorId, Number(contractHbarBal.toTinybars()), HbarUnit.Tinybar);
		console.log('Clean-up -> Retrieve hbar from Contract');
		[contractHbarBal] = await getContractBalance(contractId);
		console.log('Contract ending hbar balance:', contractHbarBal.toString());
		expect(result).to.be.equal('SUCCESS');
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

	const tokenCreateTx = new TokenCreateTransaction()
		.setTokenType(TokenType.NonFungibleUnique)
		.setTokenName('FTT_NFT' + aliceId.toString())
		.setTokenSymbol('FTT_NFT')
		.setInitialSupply(0)
		.setMaxSupply(10)
		.setSupplyType(TokenSupplyType.Finite)
		.setTreasuryAccountId(AccountId.fromString(operatorId))
		.setAutoRenewAccountId(AccountId.fromString(operatorId))
		.setSupplyKey(operatorKey)
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

	const tokenMintTx = new TokenMintTransaction().setTokenId(nftTokenId);

	for (let i = 0; i < 10; i++) {
		tokenMintTx.addMetadata(Buffer.from('ipfs://bafybeihbyr6ldwpowrejyzq623lv374kggemmvebdyanrayuviufdhi6xu/metadata.json'));
	}

	tokenMintTx.freezeWith(client);

	const tokenMintSubmit = await tokenMintTx.execute(client);
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
	const ctrcttAsAccount = AccountId.fromString(spenderAcct.toString());
	console.log('Set approval\nToken:', tokenId.toString());
	console.log('Spender:', spenderAcct.toString(), ctrcttAsAccount.toString());
	console.log('Owner:', ownerAcct.toString(), aliceId.toString());
	const transaction = new AccountAllowanceApproveTransaction()
		.approveTokenAllowance(tokenId, ownerAcct, ctrcttAsAccount, amount)
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
		.setInitialSupply(100000)
		.setTreasuryAccountId(acct)
		.setSupplyKey(key)
		.freezeWith(client);

	const tokenCreateSubmit = await tokenCreateTx.execute(client);
	const tokenCreateRx = await tokenCreateSubmit.getReceipt(client);
	tokenId = tokenCreateRx.tokenId;
	console.log('FT Minted:', tokenId.toString());
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
				.addUint256(5)
				.addUint8(1),
		);
	const contractCreateSubmit = await contractCreateTx.execute(client);
	const contractCreateRx = await contractCreateSubmit.getReceipt(client);
	contractId = contractCreateRx.contractId;
	contractAddress = contractId.toSolidityAddress();
}


/**
 * Helper function for calling the contract methods
 * @param {ContractId} cId the contract to call
 * @param {number | Long.Long} gasLim the max gas
 * @param {string} fcnName name of the function to call
 * @param {ContractFunctionParameters} params the function arguments
 * @param {string | number | Hbar | Long.Long | BigNumber} amountHbar the amount of hbar to send in the methos call
 * @param {boolean =true} decode whether to decode outputs
 * @returns {[TransactionReceipt, any, TransactionRecord]} the transaction receipt and any decoded results
 */
async function contractExecuteFcn(cId, gasLim, fcnName, params, amountHbar, decode = true) {
	const contractExecuteTx = await new ContractExecuteTransaction()
		.setContractId(cId)
		.setGas(gasLim)
		.setFunction(fcnName, params)
		.setPayableAmount(amountHbar)
		.execute(client);

	// get the results of the function call;
	const record = await contractExecuteTx.getRecord(client);
	const contractResults = decode ? decodeFunctionResult(fcnName, record.contractFunctionResult.bytes) : '';
	const contractExecuteRx = await contractExecuteTx.getReceipt(client);
	return [contractExecuteRx, contractResults, record];
}

/**
 * Decodes the result of a contract's function execution
 * @param functionName the name of the function within the ABI
 * @param resultAsBytes a byte array containing the execution result
 */
function decodeFunctionResult(functionName, resultAsBytes) {
	const functionAbi = abi.find(func => func.name === functionName);
	const functionParameters = functionAbi.outputs;
	const resultHex = '0x'.concat(Buffer.from(resultAsBytes).toString('hex'));
	const result = web3.eth.abi.decodeParameters(functionParameters, resultHex);
	return result;
}

/**
 * Generic setter caller
 * @param {string} fcnName
 * @param {boolean} value
 * @param {number=} gasLim
 * @returns {string}
 */
// eslint-disable-next-line no-unused-vars
async function useSetterBool(fcnName, value, gasLim = 200000) {
	const params = new ContractFunctionParameters()
		.addBool(value);
	const [setterAddressRx, , ] = await contractExecuteFcn(contractId, gasLim, fcnName, params);
	return setterAddressRx.status.toString();
}

/**
 * Generic setter caller
 * @param {string} fcnName
 * @param {TokenId | AccountId | ContractId} value
 * @returns {string}
 */
// eslint-disable-next-line no-unused-vars
async function useSetterAddress(fcnName, value) {
	const gasLim = 200000;
	const params = new ContractFunctionParameters()
		.addAddress(value.toSolidityAddress());
	const [setterAddressRx, , ] = await contractExecuteFcn(contractId, gasLim, fcnName, params);
	return setterAddressRx.status.toString();
}

/**
 * Generic setter caller
 * @param {string} fcnName
 * @param {TokenId[] | AccountId[] | ContractId[]} value
 * @returns {string}
 */
// eslint-disable-next-line no-unused-vars
async function useSetterAddresses(fcnName, value) {
	const gasLim = 500000;
	const params = new ContractFunctionParameters()
		.addAddressArray(value);
	const [setterAddressRx, , ] = await contractExecuteFcn(contractId, gasLim, fcnName, params);
	return setterAddressRx.status.toString();
}

/**
 * Generic setter caller
 * @param {string} fcnName
 * @param {string} value
 * @returns {string}
 */
// eslint-disable-next-line no-unused-vars
async function useSetterString(fcnName, value) {
	const gasLim = 200000;
	const params = new ContractFunctionParameters()
		.addString(value);
	const [setterAddressRx, , ] = await contractExecuteFcn(contractId, gasLim, fcnName, params);
	return setterAddressRx.status.toString();
}

/**
 * Generic setter caller
 * @param {string} fcnName
 * @param {string[]} value
 * @returns {string}
 */
// eslint-disable-next-line no-unused-vars
async function useSetterStringArray(fcnName, value, gasLim = 500000) {
	const params = new ContractFunctionParameters()
		.addStringArray(value);
	const [setterAddressRx, setterResults] = await contractExecuteFcn(contractId, gasLim, fcnName, params);
	return [setterAddressRx.status.toString(), setterResults];
}

/**
 * Generic setter caller
 * @param {string} fcnName
 * @param {number[]} ints
 * @returns {string}
 */
// eslint-disable-next-line no-unused-vars
async function useSetterUint256Array(fcnName, ints) {
	const gasLim = 8000000;
	const params = new ContractFunctionParameters().addUint256Array(ints);

	const [setterIntArrayRx, setterResult] = await contractExecuteFcn(contractId, gasLim, fcnName, params);
	return [setterIntArrayRx.status.toString(), setterResult];
}

/**
 * Generic setter caller
 * @param {string} fcnName
 * @param {...number} values
 * @returns {string}
 */
// eslint-disable-next-line no-unused-vars
async function useSetterUints(fcnName, ...values) {
	const gasLim = 800000;
	const params = new ContractFunctionParameters();

	for (let i = 0 ; i < values.length; i++) {
		params.addUint256(values[i]);
	}
	const [setterIntsRx, setterResult] = await contractExecuteFcn(contractId, gasLim, fcnName, params);
	return [setterIntsRx.status.toString(), setterResult];
}

/**
 * Generic setter caller
 * @param {string} fcnName
 * @param {...number} values
 * @returns {string}
 */
// eslint-disable-next-line no-unused-vars
async function useSetteUint8s(fcnName, ...values) {
	const gasLim = 800000;
	const params = new ContractFunctionParameters();

	for (let i = 0 ; i < values.length; i++) {
		params.addUint8(values[i]);
	}
	const [setterIntsRx, setterResult] = await contractExecuteFcn(contractId, gasLim, fcnName, params);
	return [setterIntsRx.status.toString(), setterResult];
}

/**
 * Specific caller for the method (consider switching to web3 encode instead)
 * @param {string} fcnName
 * @param {number[]} ints array of serials
 * @param {number} timestamp in seconds
 * @returns {string}
 */
// eslint-disable-next-line no-unused-vars
async function useResetSerialTimestamp(fcnName, ints, timestamp) {
	const gasLim = 8000000;
	const params = new ContractFunctionParameters()
		.addUint256Array(ints)
		.addUint256(timestamp);

	const [setterIntArrayRx, setterResult] = await contractExecuteFcn(contractId, gasLim, fcnName, params, null, false);
	return [setterIntArrayRx.status.toString(), setterResult];
}

/**
 * Request hbar from the contract
 * @param {AccountId} address
 * @param {number} amount
 * @param {HbarUnit=} units defaults to Hbar as the unit type
 */
async function transferHbarFromContract(address, amount, units = HbarUnit.Hbar) {
	const gasLim = 400000;
	const params = new ContractFunctionParameters()
		.addAddress(address.toSolidityAddress())
		.addUint256(new Hbar(amount, units).toTinybars());
	const [callHbarRx, , ] = await contractExecuteFcn(contractId, gasLim, 'transferHbar', params);
	return callHbarRx.status.toString();
}

/**
 * Helper function to get the FT & hbar balance of the contract
 * @returns {[number | Long.Long, Hbar]} The balance of the FT (without decimals)  & Hbar at the SC
 */
async function getContractBalance() {

	const query = new ContractInfoQuery()
		.setContractId(contractId);

	const info = await query.execute(client);

	return [info.balance];
}

/**
 * Helper function to get the current settings of the contract
 * @param {string} fcnName the name of the getter to call
 * @param {string} expectedVar the variable to exeppect to get back
 * @param {number=100000} gasLim allows gas veride
 * @return {*}
 */
// eslint-disable-next-line no-unused-vars
async function getSetting(fcnName, expectedVar, gasLim = 100000) {
	// check the Lazy Token and LSCT addresses
	// generate function call with function name and parameters
	const functionCallAsUint8Array = await encodeFunctionCall(fcnName, []);

	// query the contract
	const contractCall = await new ContractCallQuery()
		.setContractId(contractId)
		.setFunctionParameters(functionCallAsUint8Array)
		.setMaxQueryPayment(new Hbar(2))
		.setGas(gasLim)
		.execute(client);
	const queryResult = await decodeFunctionResult(fcnName, contractCall.bytes);
	return queryResult[expectedVar];
}

/**
 * Helper function to get the current settings of the contract
 * @param {string} fcnName the name of the getter to call
 * @param {string} expectedVars the variable to exeppect to get back
 * @return {*} array of results
 */
// eslint-disable-next-line no-unused-vars
async function getSettings(fcnName, ...expectedVars) {
	// check the Lazy Token and LSCT addresses
	// generate function call with function name and parameters
	const functionCallAsUint8Array = await encodeFunctionCall(fcnName, []);

	// query the contract
	const contractCall = await new ContractCallQuery()
		.setContractId(contractId)
		.setFunctionParameters(functionCallAsUint8Array)
		.setMaxQueryPayment(new Hbar(2))
		.setGas(100000)
		.execute(client);
	const queryResult = await decodeFunctionResult(fcnName, contractCall.bytes);
	const results = [];
	for (let v = 0 ; v < expectedVars.length; v++) {
		results.push(queryResult[expectedVars[v]]);
	}
	return results;
}

/**
 * Helper method to encode a contract query function
 * @param {string} functionName name of the function to call
 * @param {string[]} parameters string[] of parameters - typically blank
 * @returns {Buffer} encoded function call
 */
function encodeFunctionCall(functionName, parameters) {
	const functionAbi = abi.find((func) => func.name === functionName && func.type === 'function');
	const encodedParametersHex = web3.eth.abi.encodeFunctionCall(functionAbi, parameters).slice(2);
	return Buffer.from(encodedParametersHex, 'hex');
}

/*
 * basci sleep function
 * @param {number} ms milliseconds to sleep
 * @returns {Promise}
 */
// eslint-disable-next-line no-unused-vars
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}