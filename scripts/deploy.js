// Deployment script for Identity contract
// Run with: npx hardhat run scripts/deploy.js --network amoy

const { ethers, upgrades } = require("hardhat");

async function main() {
  // Адрес твоего мультисига (ЗАМЕНИ НА СВОЙ!)
  const ADMIN_ADDRESS = "0xYourMultisigAddressHere";
  
  console.log("🚀 Deploying Identity contract...");
  
  // Деплоим логику
  const Identity = await ethers.getContractFactory("Identity");
  const identity = await upgrades.deployProxy(Identity, [ADMIN_ADDRESS], {
    initializer: "initialize",
    kind: "uups",
  });
  
  await identity.waitForDeployment();
  const proxyAddress = await identity.getAddress();
  
  console.log("✅ Identity deployed to:", proxyAddress);
  console.log("🔧 Implementation:", await upgrades.erc1967.getImplementationAddress(proxyAddress));
  console.log("👑 Admin:", ADMIN_ADDRESS);
  
  // Верификация для PolygonScan (опционально)
  // await hre.run("verify:verify", { address: proxyAddress });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
