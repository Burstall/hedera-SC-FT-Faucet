require('dotenv').config();
const fs = require('fs');
const { ContractId, AccountId } = require('@hashgraph/sdk');
const { ethers } = require('ethers');
const axios = require('axios');

let abi, iface, baseUrl;

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

	const serials = args[0].split(',');

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

	iface = new ethers.utils.Interface(abi);

	console.log('\n -POST to mirror node...\n');
	const encodedCommand = iface.encodeFunctionData('getClaimableForTokens', [serials]);
	console.log('encodedCommand:', encodedCommand);

	await readOnlyEVMFromMirrorNode(encodedCommand, operatorId);
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

	const response = await axios.post(url, body);
	console.log(response.data);
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