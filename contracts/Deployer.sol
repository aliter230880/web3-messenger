// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Identity.sol";
import "./IdentityProxy.sol";

/**
 * @title Deployer
 * @dev Этот контракт разворачивает Логику и Прокси одной транзакцией.
 * Идеально для Mainnet деплоя без сложных настроек.
 */
contract Deployer {
    event Deployed(address proxy, address logic);

    /**
     * @param admin Адрес владельца (Твой мультисиг или кошелек)
     */
    constructor(address admin) {
        // 1. Деплоим Логику (Implementation)
        // Она пока не инициализирована
        Identity logic = new Identity();
        
        // 2. Готовим данные для инициализации
        // Это вызов функции initialize(admin)
        bytes memory initData = abi.encodeWithSelector(Identity.initialize.selector, admin);
        
        // 3. Деплоим Прокси, передавая ему адрес Логики и данные инициализации
        // Прокси сам вызовет initialize(admin) внутри своего конструктора
        IdentityProxy proxy = new IdentityProxy(address(logic), initData);
        
        // 4. Публикуем адреса в логах транзакции
        emit Deployed(address(proxy), address(logic));
    }
}
