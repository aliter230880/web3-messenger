// SPDX-License-Identifier: MIT
// Proxy contract for Identity - DO NOT MODIFY DIRECTLY

pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/ERC1967/ERC1967ProxyUpgradeable.sol";

/**
 * @title IdentityProxy
 * @dev Прокси-контракт для апгрейдабельной логики Identity
 * 
 * 📌 Этот контракт НЕЛЬЗЯ менять после деплоя.
 * Все обновления происходят через замену implementation в _upgradeTo().
 */
contract IdentityProxy is ERC1967ProxyUpgradeable {
    
    constructor(
        address _logic,
        bytes memory _data
    ) ERC1967ProxyUpgradeable(_logic, _data) {}
    
    /**
     * @dev Выполняет апгрейд на новую реализацию
     * Вызывается только через Identity._authorizeUpgrade()
     */
    function upgradeTo(address newImplementation) external {
        _upgradeTo(newImplementation);
    }
    
    /**
     * @dev Апгрейд с вызовом инициализации
     */
    function upgradeToAndCall(address newImplementation, bytes memory data) external payable {
        _upgradeToAndCall(newImplementation, data);
    }
}
