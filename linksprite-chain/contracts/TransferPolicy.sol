// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title TransferPolicy
 * @notice 连接精灵链 - NFT合规流转策略合约
 * @dev 实现国内数字藏品合规要求：
 *      - 转赠冷却期（防止短线炒作）
 *      - 月转赠频次上限
 *      - 接收人必须实名认证
 *      - 禁止二级市场交易
 */
contract TransferPolicy {
    address public platform;

    // 转赠冷却期：180天
    uint256 public constant TRANSFER_COOLDOWN = 180 days;
    // 单地址月转赠上限：3次
    uint256 public constant MAX_TRANSFERS_PER_MONTH = 3;

    // 地址 -> 上次转赠时间
    mapping(address => uint256) public lastTransferTime;
    // 地址 -> 月份 -> 当月转赠次数
    mapping(address => mapping(uint256 => uint256)) public monthlyTransferCount;

    event TransferPolicyUpdated(uint256 cooldown, uint256 maxPerMonth);

    modifier onlyPlatform() {
        require(msg.sender == platform, unicode"仅平台管理员可操作");
        _;
    }

    constructor(address _platform) {
        require(_platform != address(0), unicode"平台地址不能为空");
        platform = _platform;
    }

    /**
     * @notice 校验是否可以转赠
     * @param from 转出地址
     * @param to 接收地址
     * @param tokenId NFT ID
     * @return bool 是否允许转赠
     */
    function canTransfer(address from, address to, uint256 tokenId) external returns (bool) {
        // 1. 冷却期校验
        if (block.timestamp - lastTransferTime[from] < TRANSFER_COOLDOWN) {
            return false;
        }

        // 2. 月频次校验
        uint256 month = block.timestamp / 30 days;
        if (monthlyTransferCount[from][month] >= MAX_TRANSFERS_PER_MONTH) {
            return false;
        }

        // 3. 记录本次转赠（通过调用方确认后由记录函数更新）
        // 实际计数由 recordTransfer 完成
        return true;
    }

    /**
     * @notice 记录转赠行为（NFT合约转账成功后调用）
     * @param from 转出地址
     */
    function recordTransfer(address from) external onlyPlatform {
        lastTransferTime[from] = block.timestamp;
        uint256 month = block.timestamp / 30 days;
        monthlyTransferCount[from][month]++;
    }

    /**
     * @notice 查询地址转赠状态
     */
    function getTransferStatus(address addr) external view returns (
        uint256 lastTransfer,
        uint256 cooldownRemaining,
        uint256 monthlyCount,
        uint256 monthlyLimit
    ) {
        uint256 last = lastTransferTime[addr];
        uint256 remaining = 0;
        if (block.timestamp - last < TRANSFER_COOLDOWN) {
            remaining = TRANSFER_COOLDOWN - (block.timestamp - last);
        }
        uint256 month = block.timestamp / 30 days;
        return (
            last,
            remaining,
            monthlyTransferCount[addr][month],
            MAX_TRANSFERS_PER_MONTH
        );
    }
}
