// SPDX-License-Identifier: MIT
// Proxy contract for Identity - DO NOT MODIFY DIRECTLY
pragma solidity ^0.8.20;

// ❌ Старый путь (не работает в v5.x):
// import "@openzeppelin/contracts-upgradeable/proxy/ERC1967/ERC1967ProxyUpgradeable.sol";

// ✅ Правильный путь для v5.x:
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title IdentityProxy
 * @dev Прокси-контракт для апгрейдабельной логики Identity
 */
contract IdentityProxy is ERC1967Proxy {
    constructor(
        address _logic,
        bytes memory _data
    ) ERC1967Proxy(_logic, _data) {}
}
