const {
	Client,
	AccountId,
	PrivateKey,
	ContractCreateFlow,
	ContractFunctionParameters,
	ContractId,
	TokenId,
	ContractCreateTransaction,
} = require('@hashgraph/sdk');
const fs = require('fs');
const readlineSync = require('readline-sync');
require('dotenv').config();

// Get operator from .env file
const operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const contractName = process.env.CONTRACT_NAME ?? null;

const ftSCT_ContractId = ContractId.fromString(process.env.SCT_CONTRACT);
const ftTokenId = TokenId.fromString(process.env.TOKEN_ID);
const claimTokenId = TokenId.fromString(process.env.CLAIM_TOKEN);
const dailyAmt = process.env.DAILY_AMT || 5;
const boostPercentage = process.env.BOOST_PERCENTAGE || 100;
const minTime = process.env.MIN_TIME || 43200;
const maxTimeUnits = process.env.MAX_TIME_UNITS || 12;

const env = process.env.ENVIRONMENT ?? null;

let client;

async function contractDeployFcn(bytecode, gasLim) {
	const contractCreateTx = new ContractCreateFlow()
		.setBytecode(bytecode)
		.setGas(gasLim)
		.setAutoRenewAccountId(operatorId)
		.setConstructorParameters(
			new ContractFunctionParameters()
				.addAddress(ftSCT_ContractId.toSolidityAddress())
				.addAddress(ftTokenId.toSolidityAddress())
				.addAddress(claimTokenId.toSolidityAddress())
				.addUint256(dailyAmt)
				.addUint256(boostPercentage)
				.addUint256(minTime)
				.addUint8(maxTimeUnits),
		);
	const contractCreateSubmit = await contractCreateTx.execute(client);
	const contractCreateRx = await contractCreateSubmit.getReceipt(client);
	const contractId = contractCreateRx.contractId;
	const contractAddress = contractId.toSolidityAddress();
	return [contractId, contractAddress];
}

async function contractCreateFcn(bytecodeFileId, gasLim) {
	const contractCreateTx = new ContractCreateTransaction()
		.setBytecodeFileId(bytecodeFileId)
		.setGas(gasLim)
		.setAutoRenewAccountId(operatorId)
		.setConstructorParameters(
			new ContractFunctionParameters()
				.addAddress(ftSCT_ContractId.toSolidityAddress())
				.addAddress(ftTokenId.toSolidityAddress())
				.addAddress(claimTokenId.toSolidityAddress())
				.addUint256(dailyAmt)
				.adduint256(boostPercentage)
				.adduint256(minTime)
				.addUint8(maxTimeUnits),
		);
	const contractCreateSubmit = await contractCreateTx.execute(client);
	const contractCreateRx = await contractCreateSubmit.getReceipt(client);
	const contractId = contractCreateRx.contractId;
	const contractAddress = contractId.toSolidityAddress();
	return [contractId, contractAddress];
}

const main = async () => {
	if (contractName === undefined || contractName == null) {
		console.log('Environment required, please specify CONTRACT_NAME for ABI in the .env file');
		return;
	}


	console.log('\n-Using ENIVRONMENT:', env);
	console.log('\n-Using Operator:', operatorId.toString());
	console.log('\n-Using SCT:', ftSCT_ContractId.toString());
	console.log('\n-Using FT Token:', ftTokenId.toString());
	console.log('\n-Using NFT Claim Token:', claimTokenId.toString());
	console.log('\n-Using Daily FT Amount:', dailyAmt);
	console.log('\n-Using Min Time (secs):', minTime);
	console.log('\n-Using Max Time units:', maxTimeUnits);
	console.log('\n-Using Boost Perc:', boostPercentage);

	const proceed = readlineSync.keyInYNStrict('Do you want to deploy the faucet?');

	if (proceed) {
		if (env.toUpperCase() == 'TEST') {
			client = Client.forTestnet();
			console.log('deploying in *TESTNET*');
		}
		else if (env.toUpperCase() == 'MAIN') {
			client = Client.forMainnet();
			client.setMirrorNetwork('mainnet-public.mirrornode.hedera.com:443');
			console.log('deploying in *MAINNET*');
		}
		else {
			console.log('ERROR: Must specify either MAIN or TEST as environment in .env file');
			return;
		}

		client.setOperator(operatorId, operatorKey);

		const json = JSON.parse(fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`));

		const contractBytecode = json.bytecode;

		console.log('\n- Deploying contract...');
		const gasLimit = 1500000;

		const args = process.argv.slice(2);

		let contractId, contractAddress;
		if (args.length == 1) {
			console.log('Using FileID', args[0]);
			[contractId, contractAddress] = await contractCreateFcn(args[0], gasLimit);
		}
		else {
			console.log('Uploading bytecode and deploying...');
			[contractId, contractAddress] = await contractDeployFcn(contractBytecode, gasLimit);
		}

		console.log(`Contract created with ID: ${contractId} / ${contractAddress}`);
	}
	else {
		console.log('User aborted');
	}
};

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
