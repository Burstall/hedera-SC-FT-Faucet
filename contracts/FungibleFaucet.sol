// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.12 <0.9.0;

import "./HederaResponseCodes.sol";
import "./HederaTokenService.sol";

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract FungibleFaucet is HederaTokenService, Ownable, ReentrancyGuard {
	using EnumerableMap for EnumerableMap.UintToUintMap;
	using EnumerableSet for EnumerableSet.UintSet;

	address private _fungibleToken;
	address private _fungibleSCT;
	address private _claimNFT;

	uint256 private _dailyAmt;
	uint256 private _boostPercentage;
	uint256 private _minTime;
	uint256 private _startTime;
	uint8 private _maxTimeUnits;
	EnumerableMap.UintToUintMap private _serialToTimestampMap;
	EnumerableSet.UintSet private _boostSerials;
	bool private _paused;

	event FaucetMessage(
        string msgType,
        address indexed fromAddress,
		address indexed toAddress,
        uint256 amount
    );

	/// @param sct the address from which the faucet draws
	/// @param fungible the address for the fungible token drawn
	/// @param claimNFT the address of the NFT used to claim from the faucet
	/// @param dailyAmt the amount to pay per claim
	/// @param boostPercentage the percentage to boost a claim by if appropriate
	/// @param minTime the unit of claim time (seconds)
	/// @param maxTimeUnits the max units of claim time (e.g if 24 hours claim and set to 5 can claim 5 days max)
	constructor(
		address sct, 
		address fungible,
		address claimNFT,
		uint256 dailyAmt,
		uint256 boostPercentage,
		uint256 minTime,
		uint8 maxTimeUnits
	) {
		require(maxTimeUnits > 0, "min 1 period");
		_fungibleSCT = sct;
		_fungibleToken = fungible;
		_claimNFT = claimNFT;
		_dailyAmt = dailyAmt;
		_boostPercentage = boostPercentage;
		_minTime = minTime;
		_maxTimeUnits = maxTimeUnits;
		// deploy paused by default
		_paused = true;
	}

	/// @param sct new Lazy SC Treasury address
    function updateSCT(address sct) external onlyOwner {
        _fungibleSCT = sct;
    }

	/// @return sct the address set for the current lazy SC Treasury
    function getSCT() external view returns (address sct) {
    	sct = _fungibleSCT;
    }

	/// @param fungible new FT address
    function updateFungibleToken(address fungible) external onlyOwner {
        _fungibleToken = fungible;
    }

	/// @return nft the address set as NFT claim token
    function getClaimToken() external view returns (address nft) {
    	nft = _claimNFT;
    }

	/// @param nft new NFT address
    function updateClaimToken(address nft) external onlyOwner {
        _claimNFT = nft;
    }

	/// @return fungible the address set for Lazy FT token
    function getFungibleToken() external view returns (address fungible) {
    	fungible = _fungibleToken;
    }

	/// @param dailyAmt the amount to draw daily
    function updateDailyAmount(uint256 dailyAmt) external onlyOwner {
        _dailyAmt = dailyAmt;
    }

	/// @return dailyAmt the address set for Lazy FT token
    function getDailyAmount() external view returns (uint256 dailyAmt) {
    	dailyAmt = _dailyAmt;
    }

	/// @param boost the new boosdt multiplier (as %)
    function updateBoostMultiplier(uint256 boost) external onlyOwner {
        _boostPercentage = boost;
    }

	/// @return boostPercentage the address set for Lazy FT token
    function getBoostMultipler() external view returns (uint256 boostPercentage) {
    	boostPercentage = _boostPercentage;
    }

	/// @param paused boolean to pause (true) or release (false)
	/// @return changed indicative of whether a change was made
	function updatePauseStatus(bool paused) external onlyOwner returns (bool changed) {
		changed = _paused == paused ? false : true;
		if (changed) {
			emit FaucetMessage(paused ? "PAUSED" : "UNPAUSED", msg.sender, address(0), paused ? 1 : 0);
			if (!paused) {
				_startTime = block.timestamp;
			}
		}
		_paused = paused;
	}

	/// @return paused unit of time for a claim.
    function getPaused() external view returns (bool paused) {
    	paused = _paused;
    }

	/// @param minTime the new boosdt multiplier (as %)
    function updateMinTime(uint256 minTime) external onlyOwner {
        _minTime = minTime;
    }

	/// @return minTime unit of time for a claim.
    function getMinTime() external view returns (uint256 minTime) {
    	minTime = _minTime;
    }

	// hard limit on max time < 4 weeks to avoid monster claims / transtion issues
	/// @param maxTimeUnits the number of claimable units
    function updateMaxTimeUnits(uint8 maxTimeUnits) external onlyOwner {
		require(maxTimeUnits > 0, "Min claim 1 unit");
		require((_minTime * maxTimeUnits) < 4 weeks, "Window too long");
        _maxTimeUnits = maxTimeUnits;
    }

	/// @return maxTimeUnits the max claimable units
	/// @return maxTime the number of seconds for the max time
    function getMaxTimeUnits() external view returns (uint64 maxTimeUnits, uint256 maxTime) {
    	maxTimeUnits = _maxTimeUnits;
		maxTime = _maxTimeUnits * _minTime;
    }

	// Add an array of serials for boosts (256 at a time)
    /// @param serials the newss address to add
    function addBoostSerials(uint[] calldata serials) external onlyOwner {
		require(serials.length <= type(uint8).max, "Too many serials");

		string memory serialsAdded = "ADDED BOOST SERIALS: ";
		uint counter;
        for (uint8 i = 0; i < serials.length; i++) {
			if(_boostSerials.add(serials[i])) {
				serialsAdded = string.concat(serialsAdded, ",", Strings.toString(serials[i]));
				counter++;
			}
		}
        emit FaucetMessage(
            serialsAdded,
            msg.sender,
            address(0),
            counter
        );
    }

	// Remove an array of serials for boosts (256 at a time)
    /// @param serials the newss address to add
    function removeBoostSerials(uint[] calldata serials) external onlyOwner {
		require(serials.length <= type(uint8).max, "Too many serials");

		string memory serialsRemoved = "REMOVED BOOST SERIALS";
		uint counter;
        for (uint8 i = 0; i < serials.length; i++) {
			if(_boostSerials.remove(serials[i])) {
				serialsRemoved = string.concat(serialsRemoved, ",", Strings.toString(serials[i]));
				counter++;
			}
		}
        emit FaucetMessage(
            serialsRemoved,
            msg.sender,
            address(0),
            counter
        );
    }

	/// @return boostSerials an array of the boosted serials
	function getBoostSerials()
		external
        view
        returns (uint[] memory boostSerials)
    {
        return _boostSerials.values();
    }

	// method to allow owner to reset the timestamp for additional claim
	/// @param serials tthe olist of serials to reset
	/// @param timestamp the time (seconds) to set it to
	function resetSerialTimestamp(uint[] calldata serials, uint256 timestamp) external onlyOwner {
		require(serials.length <= type(uint8).max, "Too many serials");
		require(timestamp <= block.timestamp, "Reset to the past");
		for (uint8 i = 0; i < serials.length; i++) {
			_serialToTimestampMap.set(serials[i], timestamp);
		}

	}


	// helper method to allow a user to query how many FT they would claim
	// not sure the point of calling it as better to claim but adding in for good measure
	/// @param serials a uint array of token serials 
	/// @return amt the claimable amount
	function getClaimableAmount(uint[] calldata serials) external returns (uint256 amt) {
		require(!_paused, "Faucet is paused");
		require(serials.length <= type(uint8).max, "Too many serials");
		return calcDraw(serials, true, false);
	}

	// helper method to allow a user to query how many FT for a given token 
	/// @param serials a uint array of token serials 
	/// @return amt the claimable amount
	function getClaimableForTokens(uint[] calldata serials) external returns (uint256 amt) {
		require(!_paused, "Faucet is paused");
		require(serials.length <= type(uint8).max, "Too many serials");
		return calcDraw(serials, true, true);
	}

	function calcDraw(uint[] calldata serials, bool readOnly, bool ignoreOwner) internal returns (uint256 amt) {
		for (uint8 i = 0; i < serials.length; i++) {
			//check user owns the serial
			if(IERC721(_claimNFT).ownerOf(serials[i]) == msg.sender || ignoreOwner) {
				uint startTime;
				uint elapsedUnits;
				// check when serial last claimed
				(bool found, uint timestamp) = _serialToTimestampMap.tryGet(serials[i]);
				startTime = found ? Math.max(_startTime, timestamp) : _startTime;
				// calc elapsed time
				elapsedUnits = Math.min(SafeMath.div(block.timestamp - startTime, _minTime), _maxTimeUnits);
				// now update the timestamps as needed
				if (!readOnly && elapsedUnits > 0) {
					// be kind if claim comes during partial time period
					if (elapsedUnits < _maxTimeUnits) {
						// instead push the timestamp forward by the units claimed saving partial progress
						_serialToTimestampMap.set(serials[i], startTime + SafeMath.mul(_minTime, elapsedUnits));
					} else {
						// if outside max period reset counter to current block time
						_serialToTimestampMap.set(serials[i], block.timestamp);
					}
				}
				// check if serial is boosted
				uint boostPerc = _boostSerials.contains(serials[i]) ? _boostPercentage + 100 : 100;
				
				// add the claimable amount
				amt += SafeMath.div(SafeMath.mul(elapsedUnits, SafeMath.mul(_dailyAmt, boostPerc)), 100);
			}
		}
	}

	// pull the faucet for up to 256 serials at a time
	function pullFaucetHTS(uint[] calldata serials) external nonReentrant returns (uint amt) {
		require(!_paused, "Faucet is paused");
		require(serials.length <= type(uint8).max, "Too many serials");
		amt = calcDraw(serials, false, false);
		if (amt == 0) return 0;
        int responseCode = this.transferFrom(
            _fungibleToken,
            _fungibleSCT,
            msg.sender,
            amt
        );

        emit FaucetMessage(
            "Transfer with HTS",
            _fungibleSCT,
            msg.sender,
			amt
        );

        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("transferHTS - failed");
        }
    }

	// useful in case hbar is sent to contract
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

	// allows the contract to recieve HBAR
    receive() external payable {
        emit FaucetMessage(
            "Receive",
			address(this),
            msg.sender,
            msg.value
        );
    }

	// allows us to know when fallback was called
    fallback() external payable {
        emit FaucetMessage(
            "Fallback",
			address(this),
            msg.sender,
            msg.value
        );
    }
}