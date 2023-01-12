// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.12 <0.9.0;

import "./HederaResponseCodes.sol";
import "./HederaTokenService.sol";

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";

contract FungibleFaucet is HederaTokenService, Ownable {
	using EnumerableMap for EnumerableMap.AddressToUintMap;

	address private _lazyToken;
	address private _lazySCT;

	uint256 private _dailyAmt;
	EnumerableMap.AddressToUintMap private _addressTimestampMap;

	event FaucetMessage(
        string msgType,
        address indexed fromAddress,
		address indexed toAddress,
        uint256 amount
    );

	/// @param lsct the address of the Lazy Smart Contract Treasury
	/// @param lazy the address for the LAZY token
	constructor(
		address lsct, 
		address lazy,
		uint256 dailyAmt
	) {
		_lazySCT = lsct;
		_lazyToken = lazy;
		_dailyAmt = dailyAmt;

		tokenAssociate(_lazyToken);
	}

	// Call to associate a new token to the contract
    /// @param tokenId EVM token to associate
    function tokenAssociate(address tokenId) internal {
        int256 response = HederaTokenService.associateToken(
            address(this),
            tokenId
        );

        if (response != HederaResponseCodes.SUCCESS) {
            revert("AF");
        }
    }

	/// @param lsct new Lazy SC Treasury address
    function updateLSCT(address lsct) external onlyOwner {
        _lazySCT = lsct;
    }

	/// @return lsct the address set for the current lazy SC Treasury
    function getLSCT() external view returns (address lsct) {
    	lsct = _lazySCT;
    }

	/// @param lazy new Lazy FT address
    function updateLazyToken(address lazy) external onlyOwner {
        _lazyToken = lazy;
    }

	/// @return lazy the address set for Lazy FT token
    function getLazyToken() external view returns (address lazy) {
    	lazy = _lazyToken;
    }

	/// @param dailyAmt the amount to draw daily
    function updateDailyAmount(uint256 dailyAmt) external onlyOwner {
        _dailyAmt = dailyAmt;
    }

	/// @return dailyAmt the address set for Lazy FT token
    function getDailyAmount() external view returns (uint256 dailyAmt) {
    	dailyAmt = _dailyAmt;
    }

	function getLastPull() external view returns (uint256 timestamp) {
		bool found;
		(found, timestamp) = _addressTimestampMap.tryGet(msg.sender);
		if (found) {
			return timestamp;
		}
		else {
			return 0;
		}
	}

	function calcDraw() internal returns (uint256 amt) {
		bool found;
		uint timestamp;
		(found, timestamp) = _addressTimestampMap.tryGet(msg.sender);
		if (found) {
			if (timestamp + 86400 <= block.timestamp) {
				_addressTimestampMap.set(msg.sender, block.timestamp);
				return _dailyAmt;
			}
			else {
				return 0;
			}
		}
		else {
			if(IERC20(_lazyToken).balanceOf(msg.sender) == 0) associateToken(msg.sender, _lazyToken);
			_addressTimestampMap.set(msg.sender, block.timestamp);
			return _dailyAmt;
		}
	}

	function pullFaucetHTS() external returns (int responseCode) {
		uint256 amt = calcDraw();
		require(amt > 0, "<24 since last pull");
        responseCode = this.transferFrom(
            _lazyToken,
            _lazySCT,
            msg.sender,
            amt
        );

        emit FaucetMessage(
            "Transfer with HTS",
            _lazySCT,
            msg.sender,
			amt
        );

        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("transferHTS - failed");
        }
    }

	function pullFaucetETH() external returns (bool sent) {
		uint256 amt = calcDraw();
		require(amt > 0, "<24 since last pull");
        sent = IERC20(_lazyToken).transferFrom(_lazySCT, msg.sender, amt);
        require(sent, "Failed to transfer Tokens");

        emit FaucetMessage("Transfer ERC20", _lazySCT, msg.sender, amt);
    }

    /// @param receiverAddress address in EVM fomat of the reciever of the token
    /// @param amount number of tokens to send (in long form adjusted for decimal)
    function transferHbar(address payable receiverAddress, uint amount)
        external
        onlyOwner
    {
        // throws error on failure
		Address.sendValue(receiverAddress, amount);

        emit FaucetMessage(
            "Hbar Transfer",
			address(this),
            receiverAddress,
            amount
        );
    }

	 // allows the contract top recieve HBAR
    receive() external payable {
        emit FaucetMessage(
            "Receive",
			address(this),
            msg.sender,
            msg.value
        );
    }

    fallback() external payable {
        emit FaucetMessage(
            "Fallback",
			address(this),
            msg.sender,
            msg.value
        );
    }
}