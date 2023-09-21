require('dotenv').config();
const fs = require('fs');
const { ContractId, AccountId } = require('@hashgraph/sdk');
const ethers = require('ethers');
const axios = require('axios');
let abi, iface, baseUrl;

const contractName = process.env.CONTRACT_NAME ?? null;
const eventName = process.env.EVENT_NAME ?? null;
const DECIMALS = process.env.DECIMALS ?? 0;

const contractId = ContractId.fromString(process.env.CONTRACT_ID);
const BASEURL_MAIN = 'https://mainnet-public.mirrornode.hedera.com';
const BASEURL_TEST = 'http://testnet.mirrornode.hedera.com';

const env = process.env.ENVIRONMENT ?? null;


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

	iface = new ethers.Interface(abi);

	await contextAwareFetchLogsFromMirror();
};

/**
 * Get all claim records and calculate the stats
 *
 */
async function contextAwareFetchLogsFromMirror() {

	const statsObj = {
		totalClaims: 0,
		totalTokensClaimed: 0,
	};

	const userClaimMap = new Map();
	let url = `${baseUrl}/api/v1/contracts/${contractId.toString()}/results/logs?order=desc&limit=100`;
	while (url) {
		// console.log(url);

		await axios.get(url)
			.then(function(response) {
				const jsonResponse = response.data;
				// console.log(' -Got', jsonResponse, 'events from mirror node');

				jsonResponse.logs.forEach(log => {
					// decode the event data
					if (log.data == '0x') {
						return;
					}
					const event = iface.parseLog({ topics: log.topics, data: log.data });

					const fromAddress = AccountId.fromEvmAddress(0, 0, event.args.toAddress).toString();

					statsObj.totalClaims++;
					statsObj.totalTokensClaimed += Math.floor(event.args.amount * Math.pow(10, -DECIMALS));
					let constClaimList = userClaimMap.get(fromAddress);
					if (!constClaimList) {
						constClaimList = [];
					}
					userClaimMap.set(fromAddress, [...constClaimList, Number(event.args.timestamp)]);
				});

				url = jsonResponse.links.next ? baseUrl + jsonResponse.links.next : null;
			})
			.catch(function(err) {
				console.error(err);
				url = null;
				return;
			});
	}

	const claimsArray = Array.from(userClaimMap.entries()).map(([key, value]) => {
		return {
			accountId: key,
			claimCount: value.length,
			claimList: value,
		};
	});

	// calculate the average gap between claims per user
	claimsArray.forEach(claim => {
		let totalGap = 0;
		for (let i = 0; i < claim.claimList.length - 1; i++) {
			totalGap += claim.claimList[i + 1] - claim.claimList[i];
		}
		claim.averageGap = -Math.floor(totalGap / (claim.claimList.length - 1));
	});

	// calculate the number of users who have claimed more than once
	statsObj.multiClaimUsers = claimsArray.filter(claim => claim.claimCount > 1).length;
	// calculate the number of users who have claimed only once
	statsObj.singleClaimUsers = claimsArray.filter(claim => claim.claimCount == 1).length;

	// calulate the average gap between claims
	let totalGap = 0;
	claimsArray.forEach(claim => {
		totalGap += claim.averageGap ? claim.averageGap : 0;
	});
	statsObj.averageGap = Math.floor(totalGap / claimsArray.length);

	// add the average gap as days
	statsObj.averageGapDays = statsObj.averageGap / 86400;

	statsObj.claimsArray = claimsArray;


	const startTime = new Date();
	const timestamp = startTime.toISOString().split('.')[0].replaceAll(':', '-');
	const filename = `./faucetClaimStats-${timestamp}.txt`;

	fs.writeFileSync(filename, JSON.stringify(statsObj, null, 2), { flag: 'w' }, function(err) {
		if (err) {
			console.log('ERROR occured - printing to console:\n', JSON.stringify(statsObj, null, 2));
			return console.error(err);
		}
		// read it back in to be sure it worked.
		fs.readFile(filename, 'utf-8', function(err) {
			if (err) {
				console.log('Reading file failed -- printing to console');
				console.log(JSON.stringify(statsObj, null, 2));
			}
			console.log('Stats File created', filename);
		});
	});

}

main()
	.then(() => {
		process.exit(0);
	})
	.catch(error => {
		console.error(error);
		process.exit(1);
	});