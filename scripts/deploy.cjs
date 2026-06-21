const hre = require("hardhat");

async function main() {
  console.log("Starting Monadgotchi contract deployment...");

  // Get deployer account info
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account configured. Please check your PRIVATE_KEY env variable.");
  }
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Account balance: ${hre.ethers.formatEther(balance)} MON`);

  // Get contract factory
  const Monadgotchi = await hre.ethers.getContractFactory("Monadgotchi");
  
  // Deploy the contract
  const contract = await Monadgotchi.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log(`Monadgotchi contract successfully deployed to: ${contractAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
