// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Identity.sol";
import "./IdentityProxy.sol";

contract Deployer {
    // Событие, чтобы мы нашли адреса после деплоя
    event Deployed(address proxy, address logic);

    constructor(address admin) {
        // 1. Деплоим Логику (Implementation)
        Identity logic = new Identity();
        
        // 2. Кодируем вызов функции initialize(admin)
        bytes memory initData = abi.encodeWithSelector(Identity.initialize.selector, admin);
        
        // 3. Деплоим Прокси и сразу передаём ему данные инициализации
        IdentityProxy proxy = new IdentityProxy(address(logic), initData);
        
        // 4. Публикуем адреса в логах транзакции
        emit Deployed(address(proxy), address(logic));
    }
}
