const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer Address:", deployer.address);
  try {
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Balance:", hre.ethers.formatEther(balance), "MON");
    const gasPrice = await hre.ethers.provider.getFeeData();
    console.log("Gas Price:", hre.ethers.formatUnits(gasPrice.gasPrice, "gwei"), "gwei");
  } catch (error) {
    console.error("Connection failed:", error.message);
  }
}

main().catch(console.error);
