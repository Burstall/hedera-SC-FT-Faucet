const {
	Client,
	AccountId,
	PrivateKey,
	ContractId,
	Hbar,
	ContractExecuteTransaction,
	ContractCallQuery,
	ContractFunctionParameters,
} = require('@hashgraph/sdk');
require('dotenv').config();
const fs = require('fs');
const Web3 = require('web3');
const web3 = new Web3();
const readlineSync = require('readline-sync');
let abi;

// Get operator from .env file
const operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const contractName = process.env.CONTRACT_NAME ?? null;

const contractId = ContractId.fromString(process.env.CONTRACT_ID);

const env = process.env.ENVIRONMENT ?? null;
let client;

// check-out the deployed script - test read-only method
const main = async () => {
	const args = process.argv.slice(2);
	if (args.length != 1 || getArgFlag('h')) {
		console.log('Usage: addBoostSerials.js X,Y,Z');
		console.log('		X,Y,Z are the serials to claim');
		return;
	}

	const serials = args[0].split(',');

	if (contractName === undefined || contractName == null) {
		console.log('Environment required, please specify CONTRACT_NAME for ABI in the .env file');
		return;
	}

	console.log('\n-Using ENIVRONMENT:', env);
	console.log('\n-Using Operator:', operatorId.toString());

	if (env.toUpperCase() == 'TEST') {
		client = Client.forTestnet();
		console.log('interacting in *TESTNET*');
	}
	else if (env.toUpperCase() == 'MAIN') {
		client = Client.forMainnet();
		console.log('interacting in *MAINNET*');
	}
	else {
		console.log('ERROR: Must specify either MAIN or TEST as environment in .env file');
		return;
	}

	client.setOperator(operatorId, operatorKey);

	// import ABI
	const json = JSON.parse(fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`, 'utf8'));
	abi = json.abi;
	console.log('\n -Loading ABI...\n');

	let intArraySerials = await getSetting('getBoostSerials', 'boostSerials');
	console.log('Current Boost Serials:', intArraySerials);

	const proceed = readlineSync.keyInYNStrict('Do you want to **ADD** boost to serial(s): ' + serials + '?');
	if (!proceed) {
		console.log('User Aborted');
		return;
	}

	const [status] = await useSetterUint256Array('addBoostSerials', serials);
	console.log('Operation:', status);

	intArraySerials = await getSetting('getBoostSerials', 'boostSerials');
	console.log('Updated Boost Serials:', intArraySerials);
};


/**
 * Generic setter caller
 * @param {string} fcnName
 * @param {number[]} ints
 * @returns {string}
 */
// eslint-disable-next-line no-unused-vars
async function useSetterUint256Array(fcnName, ints) {
	const gasLim = 220000;
	const params = new ContractFunctionParameters().addUint256Array(ints);

	const [setterIntArrayRx, setterResult] = await contractExecuteFcn(contractId, gasLim, fcnName, params);
	return [setterIntArrayRx.status.toString(), setterResult];
}


/**
 * Helper function for calling the contract methods
 * @param {ContractId} cId the contract to call
 * @param {number | Long.Long} gasLim the max gas
 * @param {string} fcnName name of the function to call
 * @param {ContractFunctionParameters} params the function arguments
 * @param {string | number | Hbar | Long.Long | BigNumber} amountHbar the amount of hbar to send in the methos call
 * @returns {[TransactionReceipt, any, TransactionRecord]} the transaction receipt and any decoded results
 */
async function contractExecuteFcn(cId, gasLim, fcnName, params, amountHbar) {
	const contractExecuteTx = await new ContractExecuteTransaction()
		.setContractId(cId)
		.setGas(gasLim)
		.setFunction(fcnName, params)
		.setPayableAmount(amountHbar)
		.execute(client);

	// get the results of the function call;
	const record = await contractExecuteTx.getRecord(client);
	const contractResults = decodeFunctionResult(fcnName, record.contractFunctionResult.bytes);
	const contractExecuteRx = await contractExecuteTx.getReceipt(client);
	return [contractExecuteRx, contractResults, record];
}

/**
 * Helper function to get the current settings of the contract
 * @param {string} fcnName the name of the getter to call
 * @param {string} expectedVar the variable to exeppect to get back
 * @return {*}
 */
// eslint-disable-next-line no-unused-vars
async function getSetting(fcnName, expectedVar) {
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

function encodeFunctionCall(functionName, parameters) {
	const functionAbi = abi.find((func) => func.name === functionName && func.type === 'function');
	const encodedParametersHex = web3.eth.abi.encodeFunctionCall(functionAbi, parameters).slice(2);
	return Buffer.from(encodedParametersHex, 'hex');
}

function getArgFlag(arg) {
	const customIndex = process.argv.indexOf(`-${arg}`);

	if (customIndex > -1) {
		return true;
	}

	return false;
}

main()
	.then(() => {
		// eslint-disable-next-line no-useless-escape
		process.exit(0);
	})
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
