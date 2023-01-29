#Faucet SC tester

npm install

npm run test

---
Gas Cost Algo:

gasToUse = FT balance > 0 ? 0 : 950,000

Baseline: gasToUse += 150,000

Additional NFT: gasToUse += 75,000