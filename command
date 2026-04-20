cd /Users/tams/Desktop/mobiledistri/voting-dapp/contracts
npx hardhat ignition deploy ignition/modules/VotingBoard.ts --network localhost

npx hardhat node

cd /Users/tams/Desktop/mobiledistri/voting-dapp/frontend
npm i ethers

npm run dev
