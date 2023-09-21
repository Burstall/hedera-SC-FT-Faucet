require('dotenv').config();
const fs = require('fs');
const { ContractId, AccountId, PrivateKey, Client, ContractCallQuery } = require('@hashgraph/sdk');
const readlineSync = require('readline-sync');
const ethers = require('ethers');
const axios = require('axios');

let abi, iface, baseUrl, serials;

const contractName = process.env.CONTRACT_NAME ?? null;
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);

const contractId = ContractId.fromString(process.env.CONTRACT_ID);
const BASEURL_MAIN = 'https://mainnet-public.mirrornode.hedera.com';
const BASEURL_TEST = 'https://testnet.mirrornode.hedera.com';

const env = process.env.ENVIRONMENT ?? null;

const main = async () => {

	const args = process.argv.slice(2);
	if (args.length != 1 || getArgFlag('h')) {
		console.log('Usage: mirrorClaimQueryEthers.js X,Y,Z');
		console.log('		X,Y,Z are the serials to claim');
		return;
	}

	serials = args[0].split(',');

	if (contractName === undefined || contractName == null) {
		console.log('Environment required, please specify CONTRACT_NAME for ABI in the .env file');
		return;
	}

	if (env.toUpperCase() == 'TEST') {
		baseUrl = BASEURL_TEST;
		console.log('interacting in *TESTNET*');
	}
	else if (env.toUpperCase() == 'MAIN') {
		baseUrl = BASEURL_MAIN;
		console.log('interacting in *MAINNET*');
	}
	else {
		console.log('ERROR: Must specify either MAIN or TEST as environment in .env file');
		return;
	}

	console.log('\n-Using ENIVRONMENT:', env);
	console.log('\n-Using Contract:', contractId.toString(), 'with name:', contractName, 'and address:', contractId.toSolidityAddress());

	// import ABI
	const json = JSON.parse(fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`, 'utf8'));
	abi = json.abi;
	console.log('\n -Loading ABI...\n');

	iface = new ethers.Interface(abi);

	console.log('\n -POST to mirror node...\n');
	const encodedCommand = iface.encodeFunctionData('getClaimableForTokens', [serials]);
	console.log('encodedCommand:', encodedCommand);

	const data = await readOnlyEVMFromMirrorNode(encodedCommand, operatorId, false);
	console.log('data:', ethers.formatUnits(data.result, 8));
};

async function readOnlyEVMFromMirrorNode(data, from, estimate = true) {
	const body = {
		'block': 'latest',
		'data': data,
		'estimate': estimate,
		'from': from.toSolidityAddress(),
		'gas': 300_000,
		'gasPrice': 100000000,
		'to': contractId.toSolidityAddress(),
		'value': 0,
	};

	const url = `${baseUrl}/api/v1/contracts/call`;

	try {
		const response = await axios.post(url, body);
		return response.data;
	}
	catch (error) {
		console.log(error.response.data?._status?.messages[0]?.message, error.response.data?._status?.messages[0]?.data);
		console.log(parseError(error.response.data?._status?.messages[0]?.data));

		// if user supplied a private key in .env file offer them chance to pay to query
		if (process.env?.PRIVATE_KEY) {
			const proceed = readlineSync.keyInYNStrict('Do you want to check claimable balance for serial(s): ' + serials + '?');
			if (proceed) {
				const pk = PrivateKey.fromString(process.env.PRIVATE_KEY);
				let client;
				if (env.toUpperCase() == 'TEST') {
					client = Client.forTestnet();
				}
				else if (env.toUpperCase() == 'MAIN') {
					client = Client.forMainnet();
				}
				else if (env.toUpperCase() == 'LOCAL') {
					const node = { '127.0.0.1:50211': new AccountId(3) };
					client = Client.forNetwork(node).setMirrorNetwork('127.0.0.1:5600');
				}
				else {
					console.log('ERROR: Must specify either MAIN, TEST or LOCAL as environment in .env file');
					process.exit(1);
				}
				client.setOperator(operatorId, pk);
				const results = await contractExecuteQuery(client, 300_000, 'getClaimableForTokens', [serials], null, 'amt');
				return { result: results[0] };
			}
			else {
				console.log('User Aborted');
				process.exit(0);
			}
		}
		else {
			process.exit(1);
		}
	}
}

/**
 * Generalised parseing function to error handle
 * @param {*} errorData bytes of the error
 * @returns {String} the error message
 */
function parseError(errorData) {

	if (errorData.startsWith('0x08c379a0')) {
		// decode Error(string)

		const content = `0x${errorData.substring(10)}`;
		const reason = ethers.AbiCoder.defaultAbiCoder().decode(['string'], content);
		// reason: string; for standard revert error string
		return reason[0];
	}

	if (errorData.startsWith('0x4e487b71')) {
		// decode Panic(uint)
		const content = `0x${errorData.substring(10)}`;
		const code = ethers.AbiCoder.defaultAbiCoder().decode(['uint'], content);

		let type;
		switch (Number(code[0])) {
		case 0:
			type = 'Generic compiler inserted panic';
			break;
		case 1:
			type = 'Assert with an argument that evaluates to false';
			break;
		case 17:
			type = 'Arithmetic operation results in underflow or overflow outside of an unchecked { ... } block';
			break;
		case 18:
			type = 'Divide or modulo by zero (e.g. 5 / 0 or 23 % 0)';
			break;
		case 33:
			type = 'Convert a value that is too big or negative into an enum type';
			break;
		case 34:
			type = 'Access a storage byte array that is incorrectly encoded';
			break;
		case 49:
			type = 'Call .pop() on an empty array';
			break;
		case 50:
			type = 'Access an array, bytesN or an array slice at an out-of-bounds or negative index (i.e. x[i] where i >= x.length or i < 0)';
			break;
		case 65:
			type = 'Allocate too much memory or create an array that is too large';
			break;
		case 81:
			type = 'Call a zero-initialized variable of internal function type';
			break;
		default:
			type = 'Unknown';
		}

		return `Panic code: ${code[0]} : ${type}`;
	}

	try {
		const errDescription = iface.parseError(errorData);
		return errDescription;
	}
	catch (e) {
		console.error(e);
	}
}

/**
 * Helper function for calling the contract methods
 * @param {Client} client the client to use for execution
 * @param {number | Long.Long} gasLim the max gas
 * @param {string} fcnName name of the function to call
 * @param {[]} params the function arguments
 * @param {Hbar | null} queryCost the cost of the query - nullable
 * @returns {[TransactionReceipt, any, TransactionRecord]} the transaction receipt and any decoded results
 */
async function contractExecuteQuery(client, gasLim, fcnName, params, queryCost, ...expectedVars) {
	// check the gas lim is a numeric value else 100_000
	if (!gasLim || isNaN(gasLim)) {
		gasLim = 100_000;
	}

	const functionCallAsUint8Array = iface.encodeFunctionData(fcnName, params);

	console.log('Calling function:', fcnName, 'with params:', params);

	let contractQuery;
	try {
		const contractQueryTx = new ContractCallQuery()
			.setContractId(contractId)
			.setFunctionParameters(Buffer.from(functionCallAsUint8Array.slice(2), 'hex'))
			.setGas(gasLim);

		if (queryCost) {
			contractQueryTx.setQueryPayment(queryCost);
		}

		contractQuery = await contractQueryTx.execute(client);
	}
	catch (err) {
		console.log('ERROR: Contract Call Failed');
		// console.dir(err, { depth: 5, colors: true });

		return [(parseError(err.contractFunctionResult.errorMessage))];
	}

	const queryResult = iface.decodeFunctionResult(fcnName, contractQuery.bytes);
	console.log('Query result:', fcnName, queryResult);

	if (expectedVars.length == 0) {
		return queryResult;
	}
	else {
		const results = [];
		for (let v = 0 ; v < expectedVars.length; v++) {
			results.push(queryResult[expectedVars[v]]);
		}
		return results;
	}
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
		// process.exit(0);
	})
	.catch(error => {
		console.error(error);
		process.exit(1);
	});