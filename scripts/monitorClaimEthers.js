require('dotenv').config();
const fs = require('fs');
const { ContractId, AccountId } = require('@hashgraph/sdk');
const { ethers } = require('ethers');
const axios = require('axios');
const cron = require('node-cron');
let abi, iface, baseUrl;

const contractName = process.env.CONTRACT_NAME ?? null;
const eventName = process.env.EVENT_NAME ?? null;
const DECIMALS = process.env.DECIMALS ?? 0;

const contractId = ContractId.fromString(process.env.CONTRACT_ID);
const BASEURL_MAIN = 'https://mainnet-public.mirrornode.hedera.com';
const BASEURL_TEST = 'https://testnet.mirrornode.hedera.com';

let lastTimestamp = (new Date().getTime() / 1000);

const env = process.env.ENVIRONMENT ?? null;

cron.schedule('*/5 * * * * *', () => {
	contextAwareFetchLogsFromMirror();
});

cron.schedule('2 */30 * * * *', () => {
	console.log('...');
});

const main = async () => {

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
	console.log('\n-Using Event:', eventName);

	// import ABI
	const json = JSON.parse(fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`, 'utf8'));
	abi = json.abi;
	console.log('\n -Loading ABI...\n');

	iface = new ethers.utils.Interface(abi);

	console.log('\n -Starting event monitor...\n');
	// await contextAwareFetchLogsFromMirror();
};

async function contextAwareFetchLogsFromMirror() {
	const newTimestamp = new Date().getTime() / 1000;
	let url = `${baseUrl}/api/v1/contracts/${contractId.toString()}/results/logs?order=desc&limit=100`;
	while (url) {
		// console.log(url);

		await axios.get(url)
			.then(function(response) {
				const jsonResponse = response.data;
				// console.log(' -Got', jsonResponse, 'events from mirror node');

				const validLogs = jsonResponse.logs.filter(function(log) {
					// console.log('log.timestamp', Number(log.timestamp), 'lastTimestamp', lastTimestamp, Number(log.timestamp) > lastTimestamp);
					if (Number(log.timestamp) > lastTimestamp) return true;
					else return false;
				});

				// console.log(' -Got', validLogs.length, 'events from mirror node');

				validLogs.forEach(log => {
					// decode the event data
					if (log.data == '0x') {
						return;
					}
					const event = iface.parseLog({ topics: log.topics, data: log.data });

					console.log('Block: ' + log.block_number
						+ ' : Tx Hash: ' + log.transaction_hash
						+ ' : Event: ' + event.name + ' : '
						+ event.args.msgType + ' : '
						+ AccountId.fromSolidityAddress(event.args.fromAddress).toString()
						+ ' -> ' + AccountId.fromSolidityAddress(event.args.toAddress).toString() + ' : '
						+ event.args.amount * Math.pow(10, -DECIMALS) + ' @ ' + new Date(event.args.timestamp * 1000).toLocaleString());
				});

				if (validLogs.length == jsonResponse.logs.length) {
					url = jsonResponse.links.next ? baseUrl + jsonResponse.links.next : null;
				}
				else {
					url = null;
				}
			})
			.catch(function(err) {
				console.error(new Date().toISOString(), 'Error fetching logs from mirror node', url, err.name, err.message);
				url = null;
				return;
			});
	}
	// trying to avoid missing any events
	lastTimestamp = newTimestamp;
}

/**
 * Generic function to fetch logs from mirror node
 * not context aware, so will not adjust values
 */
// eslint-disable-next-line no-unused-vars
async function genericFetchLogsFromMirror() {
	let url = `${baseUrl}/api/v1/contracts/${contractId.toString()}/results/logs?order=desc&limit=100`;
	while (url) {
		console.log(url);

		await axios.get(url)
			.then(function(response) {
				const jsonResponse = response.data;
				// console.log(' -Got', jsonResponse, 'events from mirror node');

				jsonResponse.logs.forEach(log => {
					// decode the event data
					if (log.data == '0x') return;
					const event = iface.parseLog({ topics: log.topics, data: log.data });

					let outputStr = 'Block: ' + log.block_number
						+ ' : Tx Hash: ' + log.transaction_hash
						+ ' : Event: ' + event.name + ' : ';

					for (let f = 0; f < event.args.length; f++) {
						const field = event.args[f];

						let output;
						if (typeof field === 'string') {
							output = field.startsWith('0x') ? AccountId.fromSolidityAddress(field).toString() : field;
						}
						else {
							output = field.toString();
						}
						output = f == 0 ? output : ' : ' + output;
						outputStr += output;
					}

					console.log(outputStr);
				});


				url = baseUrl + jsonResponse.links.next;
				return;
			})
			.catch(function(err) {
				console.error(err);
				url = null;
				return;
			});
	}
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